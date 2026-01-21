import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { z } from 'zod';
import { MAX_RESPONSE_SEGMENTS, MAX_TOKENS } from '~/lib/.server/llm/constants';
import { CONTINUE_PROMPT } from '~/lib/.server/llm/prompts';
import {
  streamText,
  isWebSearchAvailable,
  type Messages,
  type StreamingOptions,
  type DesignGuidelinesOptions,
} from '~/lib/.server/llm/stream-text';
import SwitchableStream from '~/lib/.server/llm/switchable-stream';
import { createScopedLogger } from '~/utils/logger';
import { ChatModeAgent, type ChatMode } from '~/lib/.server/agents';
import type { AgentContext } from '~/lib/.server/agents';
import { handleRouteError } from '~/lib/errors/error-handler';
import { withRateLimit } from '~/lib/security/rate-limiter';
import { createStreamingResponse } from '~/lib/api/cache-headers';
import {
  analyzeContext,
  prepareMessagesForLLM,
  getContextStats,
  type ContextManagerConfig,
} from '~/lib/.server/llm/context-manager';

/**
 * Convert an AsyncIterable text stream to a ReadableStream in AI SDK format
 * Format: 0:"text chunk"\n for each chunk
 */
function textStreamToReadable(textStream: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of textStream) {
          // Format as AI SDK stream: 0:"text"\n
          controller.enqueue(encoder.encode(`0:${JSON.stringify(chunk)}\n`));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });
}

const logger = createScopedLogger('api.chat');

/**
 * Configuration du context manager
 */
const CONTEXT_CONFIG: ContextManagerConfig = {
  maxTokens: 180000, // Claude 3.5 Sonnet limit avec marge
  threshold: 0.8, // Résumer à 80% d'utilisation
  minRecentMessages: 10, // Garder les 10 derniers messages
};

/**
 * Fonction de summarization utilisant le LLM
 */
async function summarizeWithLLM(prompt: string, env: Env): Promise<string> {
  const summaryMessages: Messages = [
    {
      role: 'user',
      content: prompt,
    },
  ];

  // Collecter tout le texte du stream
  let fullText = '';

  const result = await streamText(summaryMessages, env, {
    toolChoice: 'none',
  });

  for await (const chunk of result.textStream) {
    fullText += chunk;
  }

  return fullText;
}

/**
 * Extrait le dernier message utilisateur des messages
 */
function getLastUserMessage(messages: Messages): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg.role === 'user' && msg.content) {
      return msg.content;
    }
  }
  return '';
}

/**
 * Traite en mode Chat (analyse sans modification)
 * Retourne un stream compatible avec le AI SDK (useChat)
 */
async function handleChatMode(messages: Messages, context: AgentContext | undefined): Promise<Response> {
  const agent = new ChatModeAgent();

  if (context) {
    agent.setContext(context);
  }

  const lastMessage = getLastUserMessage(messages);

  try {
    const response = await agent.process(lastMessage);

    /*
     * Créer un stream compatible avec le AI SDK format
     * Format: 0:"texte"\n pour les chunks de texte
     */
    const encoder = new TextEncoder();
    const text = response.content || '';

    const stream = new ReadableStream({
      start(controller) {
        // Envoyer le texte au format AI SDK stream
        controller.enqueue(encoder.encode(`0:${JSON.stringify(text)}\n`));
        controller.close();
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
      },
    });
  } catch (error) {
    const [response] = handleRouteError(error, 'ChatModeAgent', logger);
    return response;
  }
}

export async function action(args: ActionFunctionArgs) {
  // Rate limiting: 20 requêtes/minute pour les routes LLM
  return withRateLimit(args.request, () => chatAction(args), 'llm');
}

interface ContinuationContext {
  artifactId: string | null;
}

/**
 * Normalise une chaîne pour éviter les attaques par encodage unicode
 */
function normalizeString(str: string): string {
  // Normalisation NFC pour éviter les homoglyphes et encodages alternatifs
  return str.normalize('NFC');
}

/**
 * Valide le contexte de continuation pour éviter les injections de prompt
 */
function validateContinuationContext(ctx: unknown): ctx is ContinuationContext {
  if (!ctx || typeof ctx !== 'object') {
    return false;
  }

  const context = ctx as Record<string, unknown>;

  // artifactId doit être null ou une string valide
  if (context.artifactId !== null) {
    if (typeof context.artifactId !== 'string') {
      return false;
    }

    // Normaliser pour prévenir les attaques unicode
    const normalized = normalizeString(context.artifactId);

    // Limite de longueur (après normalisation)
    if (normalized.length > 128) {
      return false;
    }

    // Pas de caractères spéciaux qui pourraient casser le prompt
    if (/[<>{}|\\`\n\r]/.test(normalized)) {
      return false;
    }

    // Rejeter si contient des caractères de contrôle unicode (U+0000-U+001F, U+007F-U+009F)

    if (/[\x00-\x1F\x7F-\x9F]/.test(normalized)) {
      return false;
    }

    // Rejeter les séquences d'échappement unicode suspectes
    if (/\\u[0-9a-fA-F]{4}/.test(normalized)) {
      return false;
    }
  }

  return true;
}

/**
 * Zod schema for message validation
 * Note: 'data' role is included for compatibility with Message type
 */
const MessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system', 'data']),
  content: z.string(),
  id: z.string().optional(),
});

/**
 * Zod schema for continuation context validation
 */
const ContinuationContextSchema = z
  .object({
    artifactId: z.string().max(128).nullable(),
  })
  .nullable();

/**
 * Zod schema for agent context
 * Using passthrough to allow the full AgentContext structure
 */
const AgentContextSchema = z.record(z.unknown()).optional();

/**
 * Maximum total request body size in bytes (10MB)
 * This prevents DoS attacks via oversized payloads
 */
const MAX_REQUEST_BODY_SIZE = 10 * 1024 * 1024;

/**
 * Maximum size for a single message content in characters (500KB)
 */
const MAX_MESSAGE_CONTENT_SIZE = 500 * 1024;

/**
 * Zod schema for design guidelines options
 */
const DesignGuidelinesSchema = z
  .object({
    enabled: z.boolean().optional().default(true),
    level: z.enum(['minimal', 'standard', 'full']).optional().default('standard'),
  })
  .optional();

/**
 * Zod schema for the full chat request body with size validation
 */
const ChatRequestBodySchema = z.object({
  messages: z
    .array(
      MessageSchema.refine(
        (msg) => !msg.content || msg.content.length <= MAX_MESSAGE_CONTENT_SIZE,
        { message: `Message content exceeds maximum size of ${MAX_MESSAGE_CONTENT_SIZE} characters` }
      )
    )
    .min(1, 'Au moins un message requis')
    .max(100, 'Trop de messages'),
  mode: z.enum(['agent', 'chat']).optional().default('agent'),
  context: AgentContextSchema,
  continuationContext: ContinuationContextSchema.optional(),
  multiAgent: z.boolean().optional().default(false),
  designGuidelines: DesignGuidelinesSchema,
});

type ChatRequestBody = z.infer<typeof ChatRequestBodySchema>;

/**
 * Crée un message système de continuation à injecter
 */
function createContinuationSystemMessage(context: ContinuationContext): string {
  return `[CONTINUATION REQUISE]
L'utilisateur demande de continuer le code interrompu.
RÈGLES:
1. Utilise OBLIGATOIREMENT les balises <boltArtifact> et <boltAction>
2. ${context.artifactId ? `ID d'artifact à réutiliser: "${context.artifactId}"` : 'Crée un nouvel artifact'}
3. Ne répète pas le code déjà généré
4. Fournis les fichiers COMPLETS dans chaque <boltAction type="file">`;
}

async function chatAction({ context, request }: ActionFunctionArgs) {
  // Check Content-Length header first (fast rejection for oversized requests)
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > MAX_REQUEST_BODY_SIZE) {
    logger.warn(`Request rejected: Content-Length ${contentLength} exceeds limit`);
    return new Response(
      JSON.stringify({ error: `Request body too large. Maximum size is ${MAX_REQUEST_BODY_SIZE / 1024 / 1024}MB` }),
      {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }

  // Parse JSON with error handling and size check
  let rawBody: unknown;
  let bodyText: string;

  try {
    bodyText = await request.text();

    // Double-check actual body size (in case Content-Length was missing or wrong)
    if (bodyText.length > MAX_REQUEST_BODY_SIZE) {
      logger.warn(`Request rejected: Body size ${bodyText.length} exceeds limit`);
      return new Response(
        JSON.stringify({ error: `Request body too large. Maximum size is ${MAX_REQUEST_BODY_SIZE / 1024 / 1024}MB` }),
        {
          status: 413,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    rawBody = JSON.parse(bodyText);
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate with Zod schema
  const parseResult = ChatRequestBodySchema.safeParse(rawBody);

  if (!parseResult.success) {
    logger.warn('Invalid chat request body:', parseResult.error.errors);

    return new Response(
      JSON.stringify({
        error: 'Validation failed',
        details: parseResult.error.errors.map((e) => ({
          path: e.path.join('.'),
          message: e.message,
        })),
      }),
      {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const { messages, mode, context: agentContext, continuationContext, multiAgent, designGuidelines } = parseResult.data;

  logger.debug(`Chat mode: ${mode}, Multi-Agent: ${multiAgent}, Design Guidelines: ${designGuidelines?.enabled ?? 'default'} (${designGuidelines?.level ?? 'standard'})`);

  /*
   * Si un contexte de continuation est fourni, injecter les instructions système
   * Cela permet de guider le LLM sans que l'utilisateur voie ces instructions
   */
  if (continuationContext) {
    // Valider le contexte pour éviter les injections de prompt
    if (!validateContinuationContext(continuationContext)) {
      logger.warn('Invalid continuation context rejected:', continuationContext);

      return new Response(JSON.stringify({ error: 'Invalid continuation context' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    logger.debug('Continuation context detected, injecting system instructions');

    const continuationInstruction = createContinuationSystemMessage(continuationContext);

    // Injecter comme message système au début
    messages.unshift({
      role: 'system',
      content: continuationInstruction,
    });
  }

  // Mode Multi-Agent : ajouter des instructions pour une exécution structurée
  if (multiAgent) {
    logger.info('Multi-Agent mode enabled - structured execution');
    messages.unshift({
      role: 'system',
      content: `[MODE MULTI-AGENT ACTIVÉ]
Tu travailles en mode orchestrateur avec des sous-agents spécialisés.
Pour chaque tâche:
1. ANALYSE d'abord ce qui doit être fait
2. PLANIFIE les étapes clairement
3. EXÉCUTE chaque fichier/action de manière structurée
4. VÉRIFIE que chaque action est complète avant de passer à la suivante

Sois méthodique et explicite sur chaque action que tu entreprends.`,
    });
  }

  // Mode Chat : analyse seule, pas de modifications
  if (mode === 'chat') {
    return handleChatMode(messages, agentContext as AgentContext | undefined);
  }

  // Mode 'agent' - comportement existant avec streaming
  const stream = new SwitchableStream();

  try {
    /*
     * Context Management: Vérifier et résumer si nécessaire
     * Cela permet des conversations "infinies" sans dépasser la limite de contexte
     */
    const contextAnalysis = analyzeContext(messages, CONTEXT_CONFIG);

    logger.debug(
      `Context analysis: ${contextAnalysis.totalTokens} tokens (${contextAnalysis.usagePercent.toFixed(1)}%), ` +
        `${contextAnalysis.messageCount} messages, needsSummarization: ${contextAnalysis.needsSummarization}`,
    );

    // Préparer les messages (avec summarization si nécessaire)
    let processedMessages = messages;

    if (contextAnalysis.needsSummarization) {
      logger.info(
        `Context threshold reached (${contextAnalysis.usagePercent.toFixed(1)}%). ` +
          `Summarizing ${contextAnalysis.messagesToSummarize.length} messages...`,
      );

      const {
        messages: summarizedMessages,
        wasSummarized,
        analysis: newAnalysis,
      } = await prepareMessagesForLLM(
        messages,
        (prompt) => summarizeWithLLM(prompt, context.cloudflare.env),
        CONTEXT_CONFIG,
      );

      if (wasSummarized) {
        logger.info(
          `Summarization complete. New context: ${newAnalysis.totalTokens} tokens ` +
            `(${newAnalysis.usagePercent.toFixed(1)}%), ${newAnalysis.messageCount} messages`,
        );
        processedMessages = summarizedMessages;
      }
    }

    // Check if web search is available
    const webSearchEnabled = isWebSearchAvailable(context.cloudflare.env);

    if (webSearchEnabled) {
      logger.debug('Web search enabled via Tavily');
    }

    const options: StreamingOptions = {
      // Enable tools if web search is available, otherwise disable
      toolChoice: webSearchEnabled ? 'auto' : 'none',
      enableWebSearch: webSearchEnabled,
      // Design guidelines injection (auto-detected for UI requests)
      designGuidelines: designGuidelines as DesignGuidelinesOptions,
      onFinish: async ({ text: content, finishReason }) => {
        // Continuer si max tokens atteint
        if (finishReason === 'length') {
          if (stream.switches >= MAX_RESPONSE_SEGMENTS) {
            throw Error('Cannot continue message: Maximum segments reached');
          }

          const switchesLeft = MAX_RESPONSE_SEGMENTS - stream.switches;

          logger.info(`Reached max token limit (${MAX_TOKENS}): Continuing message (${switchesLeft} switches left)`);

          processedMessages.push({ role: 'assistant', content });
          processedMessages.push({ role: 'user', content: CONTINUE_PROMPT });

          const result = await streamText(processedMessages, context.cloudflare.env, options);

          return stream.switchSource(textStreamToReadable(result.textStream));
        }

        return stream.close();
      },
    };

    const result = await streamText(processedMessages, context.cloudflare.env, options);

    stream.switchSource(textStreamToReadable(result.textStream));

    // Ajouter les stats de contexte dans les headers (pour le client)
    const stats = getContextStats(processedMessages);

    return new Response(stream.readable, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store',
        Connection: 'keep-alive',
        'X-Context-Tokens': stats.totalTokens.toString(),
        'X-Context-Usage': stats.usagePercent.toFixed(1),
        'X-Context-Messages': stats.messageCount.toString(),
        'X-Context-Summaries': stats.summaryCount.toString(),
        'X-Web-Search': webSearchEnabled ? 'enabled' : 'disabled',
        'X-Design-Guidelines': designGuidelines?.enabled !== false ? (designGuidelines?.level ?? 'standard') : 'disabled',
      },
    });
  } catch (error) {
    const [response] = handleRouteError(error, 'Chat', logger);
    return response;
  }
}
