import { streamText as _streamText, stepCountIs, type ToolSet } from 'ai';
import { getAPIKey } from '~/lib/.server/llm/api-key';
import { getAnthropicModel } from '~/lib/.server/llm/model';
import { MAX_TOKENS } from './constants';
import { getSystemPrompt } from './prompts';
import { createWebSearchTools, getWebSearchStatus, isWebSearchAvailable } from './web-search';
import { loadFrontendDesignSkill, formatSkillContent, type GuidelinesLevel } from '~/lib/skills';
import { createScopedLogger } from '~/utils/logger';
import type { Message } from '~/types/message';

const logger = createScopedLogger('StreamText');

export type Messages = Message[];

/*
 * =============================================================================
 * TYPES
 * =============================================================================
 */

export interface DesignGuidelinesOptions {
  /** Enable design guidelines injection (default: true) */
  enabled?: boolean;
  /** Guidelines detail level (default: 'standard') */
  level?: GuidelinesLevel;
}

export interface StreamingOptions {
  onFinish?: Parameters<typeof _streamText>[0]['onFinish'];
  onChunk?: Parameters<typeof _streamText>[0]['onChunk'];
  abortSignal?: AbortSignal;
  toolChoice?: Parameters<typeof _streamText>[0]['toolChoice'];

  /** Enable web search tools (requires TAVILY_API_KEY) */
  enableWebSearch?: boolean;

  /** Design guidelines configuration */
  designGuidelines?: DesignGuidelinesOptions;
}

/*
 * =============================================================================
 * DESIGN GUIDELINES INJECTION
 * =============================================================================
 */

/**
 * Détecte si la requête concerne du frontend/UI
 */
function isUIRequest(messages: Messages): boolean {
  const UI_PATTERNS = [
    /\b(site|page|app|application|dashboard|interface|ui|design)\b/i,
    /\b(boutique|portfolio|landing|website|webpage|web)\b/i,
    /\b(cré[ée]r?|build|make|develop|design|implement|faire)\b.*\b(ui|interface|page|site|app)\b/i,
    /\b(e-?commerce|saas|blog|restaurant|agency|agence)\b/i,
    /\b(react|next\.?js|vue|angular|svelte)\b.*\b(component|page|app|composant)\b/i,
    /\b(tailwind|css|style|styling|layout|frontend)\b/i,
    /\b(formulaire|form|modal|carte|card|button|bouton|header|footer|navbar)\b/i,
  ];

  // Extraire le dernier message utilisateur
  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');

  if (!lastUserMessage) return false;

  // Message content is always a string in our Message type
  const content = lastUserMessage.content;

  return UI_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Injecte les design guidelines dans le prompt si applicable
 */
function injectDesignGuidelines(
  systemPrompt: string,
  messages: Messages,
  options?: DesignGuidelinesOptions
): string {
  // Vérifier si les guidelines sont activées
  const enabled = options?.enabled !== false;
  const level = options?.level ?? 'standard';

  if (!enabled || level === 'minimal') {
    return systemPrompt;
  }

  // Vérifier si c'est une requête UI
  if (!isUIRequest(messages)) {
    logger.debug('Skipping design guidelines: not a UI request');
    return systemPrompt;
  }

  // Charger et formater le skill
  try {
    const skill = loadFrontendDesignSkill();
    const formattedGuidelines = formatSkillContent(skill, level);

    if (!formattedGuidelines) {
      return systemPrompt;
    }

    logger.info(`Injecting design guidelines (level: ${level})`);

    return `${systemPrompt}

/*
 * =============================================================================
 * FRONTEND DESIGN PLUGIN (Anthropic Official Guidelines)
 * =============================================================================
 */

${formattedGuidelines}
`;
  } catch (error) {
    logger.error('Failed to inject design guidelines:', error);
    return systemPrompt;
  }
}

/*
 * =============================================================================
 * MAIN STREAM FUNCTION
 * =============================================================================
 */

export function streamText(messages: Messages, env: Env, options?: StreamingOptions) {
  // Convert our Message format to the format expected by streamText
  const modelMessages = messages.map((m) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }));

  // Build system prompt
  let systemPrompt = getSystemPrompt();

  // Web search status injection
  const webSearchEnabled = options?.enableWebSearch !== false && isWebSearchAvailable(env);

  if (webSearchEnabled) {
    systemPrompt += '\n' + getWebSearchStatus(env);
  }

  // Design guidelines injection
  systemPrompt = injectDesignGuidelines(systemPrompt, messages, options?.designGuidelines);

  // Create tools if web search is enabled and available
  const tools = webSearchEnabled ? (createWebSearchTools(env.TAVILY_API_KEY) as ToolSet) : undefined;

  // Configure stop condition for tool loops (allow up to 5 steps when tools are available)
  const stopWhen = tools ? stepCountIs(5) : stepCountIs(1);

  // Use type assertion for the streamText call to avoid generic inference issues
  return _streamText({
    model: getAnthropicModel(getAPIKey(env)),
    system: systemPrompt,
    maxOutputTokens: MAX_TOKENS,
    messages: modelMessages,
    tools,
    stopWhen,
    onFinish: options?.onFinish as Parameters<typeof _streamText>[0]['onFinish'],
    onChunk: options?.onChunk as Parameters<typeof _streamText>[0]['onChunk'],
    abortSignal: options?.abortSignal,
    toolChoice: options?.toolChoice as Parameters<typeof _streamText>[0]['toolChoice'],
  });
}

/**
 * Stream text without tools (for simple responses)
 */
export function streamTextSimple(
  messages: Messages,
  env: Env,
  options?: Omit<StreamingOptions, 'enableWebSearch'>
) {
  return streamText(messages, env, { ...options, enableWebSearch: false });
}

/**
 * Stream text with full design guidelines
 */
export function streamTextWithDesign(
  messages: Messages,
  env: Env,
  options?: Omit<StreamingOptions, 'designGuidelines'>
) {
  return streamText(messages, env, {
    ...options,
    designGuidelines: { enabled: true, level: 'full' },
  });
}

/**
 * Stream text without design guidelines
 */
export function streamTextNoDesign(
  messages: Messages,
  env: Env,
  options?: Omit<StreamingOptions, 'designGuidelines'>
) {
  return streamText(messages, env, {
    ...options,
    designGuidelines: { enabled: false },
  });
}

/**
 * Check if web search is available in the environment
 */
export { isWebSearchAvailable } from './web-search';

/**
 * Export types for external use
 */
export type { GuidelinesLevel };
