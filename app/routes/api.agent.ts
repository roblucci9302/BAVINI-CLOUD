/**
 * API Route for Multi-Agent System
 *
 * This route implements a real multi-agent orchestration system.
 * The Orchestrator analyzes requests and delegates to specialized agents:
 * - explore: Code search and analysis
 * - coder: Code creation and modification
 * - builder: Build and npm commands
 * - tester: Test execution
 * - deployer: Git operations
 * - reviewer: Code review
 * - fixer: Auto-fix errors
 */

import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { streamText as _streamText } from 'ai';
import { getAPIKey } from '~/lib/.server/llm/api-key';
import { getAnthropicModel } from '~/lib/.server/llm/model';
import { getSystemPrompt } from '~/lib/.server/llm/prompts';
import { createScopedLogger } from '~/utils/logger';
import { withRateLimit } from '~/lib/security/rate-limiter';
import { createStreamingResponse } from '~/lib/api/cache-headers';

// Import from modular API modules
import type { ChatMessage, AgentRequestBody } from '~/lib/agents/api';
import {
  sendAgentStatus,
  sendText,
  sendError,
  sendDone,
  detectErrorsInOutput,
  buildFixerPrompt,
  analyzeAndDecide,
  // Verification loop (Phase 0 Task 2.4)
  runAutoFixWithVerification,
  DEFAULT_VERIFICATION_CONFIG,
  getVerificationMetrics,
} from '~/lib/agents/api';

// Server-only prompts
import { getAgentSystemPrompt, getFixerInstructions } from '~/lib/agents/api.server/prompts';

const logger = createScopedLogger('api.agent');

/*
 * ============================================================================
 * CONSTANTS
 * ============================================================================
 */

/** Global timeout for agent requests (10 minutes) */
const GLOBAL_TIMEOUT_MS = 600_000;

/**
 * Per-stage timeouts for each agent type.
 * Allows fine-grained control over how long each agent can run.
 * Prevents runaway LLM calls while allowing appropriate time for each task.
 */
const STAGE_TIMEOUTS: Record<string, number> = {
  orchestrator: 30_000,   // 30s for analysis and routing
  coder: 180_000,         // 3min for code generation (complex)
  builder: 120_000,       // 2min for build commands
  tester: 60_000,         // 1min for test verification
  reviewer: 60_000,       // 1min for code review
  fixer: 120_000,         // 2min for auto-fixes
  explorer: 60_000,       // 1min for code exploration
  deployer: 90_000,       // 1.5min for git operations
  default: 60_000,        // 1min fallback
};

/**
 * Execute an agent function with a stage-specific timeout.
 * Throws an error if the agent takes too long, allowing graceful recovery.
 *
 * @param agentName - Name of the agent (used to look up timeout)
 * @param fn - Async function to execute
 * @returns Result of the function
 * @throws Error if timeout is exceeded
 */
async function runAgentWithTimeout<T>(
  agentName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const timeout = STAGE_TIMEOUTS[agentName] ?? STAGE_TIMEOUTS.default;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeout);

  try {
    // Race between the function and the timeout
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`Agent ${agentName} timed out after ${timeout / 1000}s`));
        });
      }),
    ]);

    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

/*
 * ============================================================================
 * ACTION
 * ============================================================================
 */

export async function action(args: ActionFunctionArgs) {
  // Rate limiting: 20 requêtes/minute pour les routes LLM (coûteuses)
  return withRateLimit(args.request, () => agentAction(args), 'llm');
}

async function agentAction({ request, context }: ActionFunctionArgs) {
  const body = await request.json<AgentRequestBody>();
  const {
    message,
    messages: incomingMessages,
    files,
    context: agentContext,
    controlMode = 'strict',
    multiAgent = false,
  } = body;

  // Build messages array
  let messages: ChatMessage[] = [];

  if (incomingMessages && incomingMessages.length > 0) {
    messages = incomingMessages;
    logger.info(`Agent request received with ${messages.length} messages (multiAgent: ${multiAgent})`);
  } else if (message) {
    messages = [{ role: 'user', content: message }];
    logger.info(`Agent request received with single message (multiAgent: ${multiAgent})`);
  } else {
    logger.error('No message or messages provided');
    return new Response(JSON.stringify({ error: 'No message provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Build file context
  const fileContext = files && files.length > 0 ? files.map((f) => `- ${f.path}`).join('\n') : '';

  const lastUserMessage = messages.filter((m) => m.role === 'user').pop()?.content || '';
  logger.debug('Last user message:', lastUserMessage.substring(0, 100));

  // Create streaming response with global timeout protection
  const encoder = new TextEncoder();

  // Global timeout to prevent infinite requests
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.warn('Global timeout reached, aborting request');
    abortController.abort(new Error('Request timeout: operation took too long'));
  }, GLOBAL_TIMEOUT_MS);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Check if already aborted
        if (abortController.signal.aborted) {
          throw new Error('Request was aborted');
        }

        // Step 1: Orchestrator analyzes the request
        sendAgentStatus(controller, encoder, 'orchestrator', 'thinking');

        // Analyze and decide
        const decision = await analyzeAndDecide(lastUserMessage, fileContext);

        logger.info('Orchestration decision', {
          action: decision.action,
          targetAgent: decision.targetAgent,
          reasoning: decision.reasoning,
        });

        // Step 2: Execute based on decision
        if (decision.action === 'delegate' && decision.targetAgent) {
          await executeDelegation(controller, encoder, decision, messages, files, fileContext, context);
        } else if (decision.action === 'decompose' && decision.subtasks) {
          await executeDecomposition(controller, encoder, decision, messages, files, fileContext, context);
        } else {
          await executeDirectResponse(controller, encoder, messages, files, context);
        }

        // Done
        sendDone(controller, encoder);
      } catch (error) {
        handleStreamError(controller, encoder, error, abortController);
      } finally {
        clearTimeout(timeoutId);
        controller.close();
      }
    },
  });

  return createStreamingResponse(stream, { status: 200 });
}

/*
 * ============================================================================
 * EXECUTION HANDLERS
 * ============================================================================
 */

async function executeDelegation(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  decision: { targetAgent?: string; reasoning: string },
  messages: ChatMessage[],
  files: { path: string; content?: string }[] | undefined,
  fileContext: string,
  context: ActionFunctionArgs['context'],
): Promise<void> {
  if (!decision.targetAgent) {
    throw new Error('No target agent specified');
  }

  sendAgentStatus(controller, encoder, 'orchestrator', 'completed');
  sendAgentStatus(controller, encoder, decision.targetAgent, 'executing');

  // Get agent's system prompt with file context appended
  let agentPrompt = getAgentSystemPrompt(decision.targetAgent as any);

  if (fileContext) {
    agentPrompt += `\n\n<project_files>\nFichiers disponibles dans le projet:\n${fileContext}\n</project_files>`;
  }

  // Add special context for fixer when invoked for user-reported errors
  if (decision.targetAgent === 'fixer' && decision.reasoning.includes('Error message detected')) {
    agentPrompt += getFixerInstructions();
  }

  // Filter out any system messages from the conversation (keep only user/assistant)
  const agentMessages: ChatMessage[] = messages
    .filter((m) => m.role !== 'system' && m.content && m.content.trim() !== '')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  // Call LLM with agent's prompt and stage-specific timeout
  logger.info(`Calling LLM for agent ${decision.targetAgent} with ${agentMessages.length} messages`);

  const model = getAnthropicModel(getAPIKey(context.cloudflare.env));

  // Stream the agent's response and collect for error detection
  let totalChunks = 0;
  let fullAgentOutput = '';

  // Wrap LLM call with stage timeout
  await runAgentWithTimeout(decision.targetAgent, async () => {
    const agentResult = await _streamText({
      model,
      system: agentPrompt,
      maxOutputTokens: 32768, // Increased from 16K to 32K for complex code generation
      messages: agentMessages,
    });

    for await (const chunk of agentResult.textStream) {
      totalChunks++;
      fullAgentOutput += chunk;
      sendText(controller, encoder, chunk);
    }
  });

  logger.info(`LLM stream completed with ${totalChunks} chunks`);
  sendAgentStatus(controller, encoder, decision.targetAgent, 'completed');

  // Run appropriate pipeline based on agent type
  if (CODE_GENERATING_AGENTS.includes(decision.targetAgent)) {
    // Full quality pipeline for code-generating agents: tester → reviewer → fixer
    await runCodeQualityPipeline(controller, encoder, fullAgentOutput, agentMessages, fileContext, context);
  } else {
    // Simple error detection & auto-fix pipeline for other agents
    await runAutoFixPipeline(controller, encoder, fullAgentOutput, decision.targetAgent, agentMessages, context);
  }
}

async function executeDecomposition(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  decision: { subtasks?: Array<{ agent: string; task: string; dependsOn?: number[] }> },
  messages: ChatMessage[],
  files: { path: string; content?: string }[] | undefined,
  fileContext: string,
  context: ActionFunctionArgs['context'],
): Promise<void> {
  if (!decision.subtasks) {
    throw new Error('No subtasks specified');
  }

  sendText(controller, encoder, `🎯 **Décomposition en ${decision.subtasks.length} sous-tâches**\n\n`);
  sendAgentStatus(controller, encoder, 'orchestrator', 'executing');

  // Execute subtasks sequentially (respecting dependencies)
  const results: string[] = [];

  for (let i = 0; i < decision.subtasks.length; i++) {
    const subtask = decision.subtasks[i];

    sendText(controller, encoder, `\n### Sous-tâche ${i + 1}: ${subtask.agent}\n`);
    sendAgentStatus(controller, encoder, subtask.agent, 'executing');

    // Build context with previous results
    const subtaskContext = results.length > 0 ? `\n\nRésultats des tâches précédentes:\n${results.join('\n\n')}` : '';

    // Append file context to system prompt
    let subtaskPrompt = getAgentSystemPrompt(subtask.agent as any);

    if (fileContext) {
      subtaskPrompt += `\n\n<project_files>\nFichiers disponibles:\n${fileContext}\n</project_files>`;
    }

    const model = getAnthropicModel(getAPIKey(context.cloudflare.env));

    const subtaskResult = await _streamText({
      model,
      system: subtaskPrompt,
      maxOutputTokens: 32768, // Increased from 16K to 32K
      messages: [{ role: 'user' as const, content: subtask.task + subtaskContext }],
    });

    let subtaskOutput = '';

    for await (const chunk of subtaskResult.textStream) {
      subtaskOutput += chunk;
      sendText(controller, encoder, chunk);
    }

    sendAgentStatus(controller, encoder, subtask.agent, 'completed');

    // Run quality pipeline for code-generating subtasks
    if (CODE_GENERATING_AGENTS.includes(subtask.agent)) {
      const subtaskMessages: ChatMessage[] = [{ role: 'user' as const, content: subtask.task + subtaskContext }];
      await runCodeQualityPipeline(controller, encoder, subtaskOutput, subtaskMessages, fileContext, context);
    }

    results.push(`[${subtask.agent}]: ${subtaskOutput}`);
  }

  sendAgentStatus(controller, encoder, 'orchestrator', 'completed');
}

async function executeDirectResponse(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  messages: ChatMessage[],
  files: { path: string; content?: string }[] | undefined,
  context: ActionFunctionArgs['context'],
): Promise<void> {
  sendAgentStatus(controller, encoder, 'orchestrator', 'executing');

  // Build file contents for context if available
  const fileContents =
    files
      ?.filter((f) => f.content)
      .map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
      .join('\n\n') || '';

  // Append file context to system prompt
  let directPrompt = getSystemPrompt();

  if (fileContents) {
    directPrompt += `\n\n<project_files>\nContenu des fichiers:\n${fileContents}\n</project_files>`;
  }

  // Filter messages to only user/assistant with non-empty content
  const filteredMessages = messages
    .filter((m) => m.role !== 'system' && m.content && m.content.trim() !== '')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const model = getAnthropicModel(getAPIKey(context.cloudflare.env));
  const directResult = await _streamText({
    model,
    system: directPrompt,
    maxOutputTokens: 32768, // Increased from 16K to 32K
    messages: filteredMessages,
  });

  for await (const chunk of directResult.textStream) {
    sendText(controller, encoder, chunk);
  }

  sendAgentStatus(controller, encoder, 'orchestrator', 'completed');
}

/*
 * ============================================================================
 * AGENTS THAT TRIGGER QUALITY PIPELINE
 * ============================================================================
 */

/** Agents that should trigger the full quality pipeline (tester → reviewer → fixer) */
const CODE_GENERATING_AGENTS = ['coder', 'builder'];

/*
 * ============================================================================
 * CODE QUALITY PIPELINE (Tester → Reviewer → Fixer)
 * ============================================================================
 */

interface QualityIssue {
  type: 'test' | 'review';
  severity: 'error' | 'warning' | 'info';
  message: string;
}

/**
 * Runs the complete code quality pipeline after code generation:
 * 1. Tester - Verifies code functionality and identifies potential bugs
 * 2. Reviewer - Analyzes code quality, patterns, and best practices
 * 3. Fixer - Automatically fixes any issues found (if needed)
 */
async function runCodeQualityPipeline(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  coderOutput: string,
  agentMessages: ChatMessage[],
  fileContext: string,
  context: ActionFunctionArgs['context'],
): Promise<void> {
  logger.info('Starting code quality pipeline (tester → reviewer → fixer)');

  const model = getAnthropicModel(getAPIKey(context.cloudflare.env));
  const allIssues: QualityIssue[] = [];

  /*
   * =========================================================================
   * STEP 1: TESTER - Verify code functionality
   * =========================================================================
   */
  sendText(controller, encoder, '\n\n---\n\n🧪 **Vérification par le Tester...**\n\n');
  sendAgentStatus(controller, encoder, 'tester', 'executing');

  let testerPrompt = getAgentSystemPrompt('tester');

  if (fileContext) {
    testerPrompt += `\n\n<project_files>\nFichiers disponibles:\n${fileContext}\n</project_files>`;
  }

  const testerRequest = `Analyse le code généré ci-dessous et vérifie:
1. La logique du code est correcte
2. Les cas limites sont gérés
3. Il n'y a pas de bugs évidents
4. Les imports et dépendances sont corrects

Code généré:
${coderOutput}

Réponds avec:
- ✅ si tout est OK
- ⚠️ pour les avertissements
- ❌ pour les erreurs critiques

Sois concis et précis.`;

  const testerResult = await _streamText({
    model,
    system: testerPrompt,
    maxOutputTokens: 8192, // Increased from 4K to 8K for more detailed analysis
    messages: [
      ...agentMessages,
      { role: 'assistant' as const, content: coderOutput },
      { role: 'user' as const, content: testerRequest },
    ],
  });

  let testerOutput = '';

  for await (const chunk of testerResult.textStream) {
    testerOutput += chunk;
    sendText(controller, encoder, chunk);
  }

  sendAgentStatus(controller, encoder, 'tester', 'completed');
  logger.info('Tester analysis completed');

  // Parse tester issues
  const testerIssues = parseQualityIssues(testerOutput, 'test');
  allIssues.push(...testerIssues);

  /*
   * =========================================================================
   * STEP 2: REVIEWER - Analyze code quality
   * =========================================================================
   */
  sendText(controller, encoder, '\n\n---\n\n📝 **Revue de code par le Reviewer...**\n\n');
  sendAgentStatus(controller, encoder, 'reviewer', 'executing');

  let reviewerPrompt = getAgentSystemPrompt('reviewer');

  if (fileContext) {
    reviewerPrompt += `\n\n<project_files>\nFichiers disponibles:\n${fileContext}\n</project_files>`;
  }

  const reviewerRequest = `Effectue une revue de code du code généré ci-dessous:

Code généré:
${coderOutput}

Résultats du Tester:
${testerOutput}

Vérifie:
1. Qualité et lisibilité du code
2. Respect des bonnes pratiques
3. Sécurité (XSS, injection, etc.)
4. Performance
5. Maintenabilité

Réponds avec:
- ✅ pour les points positifs
- ⚠️ pour les suggestions d'amélioration
- ❌ pour les problèmes critiques à corriger

Sois concis et actionnable.`;

  const reviewerResult = await _streamText({
    model,
    system: reviewerPrompt,
    maxOutputTokens: 8192, // Increased from 4K to 8K for more complete reviews
    messages: [
      ...agentMessages,
      { role: 'assistant' as const, content: coderOutput },
      { role: 'user' as const, content: reviewerRequest },
    ],
  });

  let reviewerOutput = '';

  for await (const chunk of reviewerResult.textStream) {
    reviewerOutput += chunk;
    sendText(controller, encoder, chunk);
  }

  sendAgentStatus(controller, encoder, 'reviewer', 'completed');
  logger.info('Reviewer analysis completed');

  // Parse reviewer issues
  const reviewerIssues = parseQualityIssues(reviewerOutput, 'review');
  allIssues.push(...reviewerIssues);

  /*
   * =========================================================================
   * STEP 3: FIXER - Fix issues and apply improvements
   * =========================================================================
   * Include both errors (critical) and warnings (improvements) for the fixer
   */
  const fixableIssues = allIssues.filter((i) => i.severity === 'error' || i.severity === 'warning');
  const criticalCount = allIssues.filter((i) => i.severity === 'error').length;
  const warningCount = allIssues.filter((i) => i.severity === 'warning').length;

  if (fixableIssues.length > 0) {
    const actionType =
      criticalCount > 0
        ? '🔧 **Correction automatique par le Fixer...**'
        : '✨ **Amélioration automatique par le Fixer...**';

    sendText(controller, encoder, `\n\n---\n\n${actionType}\n\n`);
    sendAgentStatus(controller, encoder, 'fixer', 'executing');

    const fixerPrompt = buildQualityFixerPrompt(testerOutput, reviewerOutput, fixableIssues);

    const fixerResult = await _streamText({
      model,
      system: getAgentSystemPrompt('fixer'),
      maxOutputTokens: 32768, // Increased from 16K to 32K for complete fixes
      messages: [
        ...agentMessages,
        { role: 'assistant' as const, content: coderOutput },
        { role: 'user' as const, content: fixerPrompt },
      ],
    });

    for await (const chunk of fixerResult.textStream) {
      sendText(controller, encoder, chunk);
    }

    sendAgentStatus(controller, encoder, 'fixer', 'completed');
    logger.info('Fixer completed', { corrections: criticalCount, improvements: warningCount });
  } else {
    sendText(controller, encoder, '\n\n---\n\n✅ **Validation complète - Code de qualité optimale**\n');
    logger.info('No issues found, skipping fixer');
  }

  // Summary
  sendText(
    controller,
    encoder,
    `\n\n📊 **Résumé de la chaîne qualité:** ${criticalCount} erreur(s), ${warningCount} avertissement(s)\n`,
  );

  logger.info('Code quality pipeline completed', { errors: criticalCount, warnings: warningCount });
}

/**
 * Parse quality issues from agent output based on emoji markers and keywords
 * Enhanced detection for both French and English outputs
 */
function parseQualityIssues(output: string, type: 'test' | 'review'): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const lines = output.split('\n');

  // Keywords for error detection (FR + EN)
  const errorKeywords = [
    'erreur',
    'error',
    'bug',
    'crash',
    'fail',
    'broken',
    'critique',
    'critical',
    'fatal',
    'grave',
    'bloquant',
    'blocking',
  ];

  // Keywords for warning detection (FR + EN)
  const warningKeywords = [
    'warning',
    'attention',
    'améliorer',
    'improve',
    'suggestion',
    'recommand',
    'devrait',
    'should',
    'pourrait',
    'could',
    'consider',
    'optimis',
    'refactor',
    'meilleur',
    'better',
    'prefer',
    'éviter',
    'avoid',
    'manque',
    'missing',
    'ajouter',
    'add',
    'problème',
    'problem',
    'issue',
  ];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.length < 5) {
      continue;
    }

    const lowerLine = trimmed.toLowerCase();

    // Priority 1: Emoji-based detection (most reliable)
    if (trimmed.startsWith('❌') || trimmed.includes('❌')) {
      issues.push({ type, severity: 'error', message: trimmed });
    } else if (trimmed.startsWith('⚠️') || trimmed.includes('⚠️')) {
      issues.push({ type, severity: 'warning', message: trimmed });
    } else if (trimmed.startsWith('✅') || trimmed.includes('✅')) {
      issues.push({ type, severity: 'info', message: trimmed });
    }
    // Priority 2: Keyword-based detection
    else if (errorKeywords.some((kw) => lowerLine.includes(kw))) {
      // Only add if line looks like an actual issue (starts with bullet/dash or is in a list)
      if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*') || trimmed.match(/^\d+\./)) {
        issues.push({ type, severity: 'error', message: trimmed });
      }
    } else if (warningKeywords.some((kw) => lowerLine.includes(kw))) {
      if (trimmed.startsWith('-') || trimmed.startsWith('•') || trimmed.startsWith('*') || trimmed.match(/^\d+\./)) {
        issues.push({ type, severity: 'warning', message: trimmed });
      }
    }
  }

  return issues;
}

/**
 * Build fixer prompt from quality pipeline results
 */
function buildQualityFixerPrompt(testerOutput: string, reviewerOutput: string, fixableIssues: QualityIssue[]): string {
  const errors = fixableIssues.filter((i) => i.severity === 'error');
  const warnings = fixableIssues.filter((i) => i.severity === 'warning');

  let issuesList = '';

  if (errors.length > 0) {
    issuesList += '**❌ Erreurs critiques à corriger (OBLIGATOIRE):**\n';
    issuesList += errors.map((i) => `- [${i.type.toUpperCase()}] ${i.message}`).join('\n');
    issuesList += '\n\n';
  }

  if (warnings.length > 0) {
    issuesList += '**⚠️ Améliorations suggérées à appliquer:**\n';
    issuesList += warnings.map((i) => `- [${i.type.toUpperCase()}] ${i.message}`).join('\n');
  }

  return `Le Tester et le Reviewer ont analysé le code. Tu dois corriger les erreurs ET appliquer les améliorations.

**Résultats du Tester:**
${testerOutput}

**Résultats du Reviewer:**
${reviewerOutput}

${issuesList}

**Instructions:**
1. Corrige TOUTES les erreurs critiques (❌) - c'est obligatoire
2. Applique TOUTES les améliorations suggérées (⚠️) - pour améliorer la qualité
3. Génère le code corrigé et amélioré complet avec les balises <boltAction> appropriées
4. Assure-toi que le code final respecte toutes les bonnes pratiques mentionnées`;
}

/*
 * ============================================================================
 * AUTO-FIX PIPELINE WITH VERIFICATION (Phase 0 Task 2.4)
 * ============================================================================
 * Enhanced auto-fix pipeline with:
 * - Verification loop (retry if fix doesn't resolve errors)
 * - Configurable max retries (default: 3)
 * - Rollback on failure
 * - Metrics tracking
 * ============================================================================
 */

async function runAutoFixPipeline(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  fullAgentOutput: string,
  sourceAgent: string,
  agentMessages: ChatMessage[],
  context: ActionFunctionArgs['context'],
): Promise<void> {
  const errors = detectErrorsInOutput(fullAgentOutput);

  if (errors.length === 0 || sourceAgent === 'fixer') {
    return;
  }

  logger.info(`Detected ${errors.length} error(s), invoking fixer agent with verification loop`);

  // Notify client about error detection
  sendText(controller, encoder, '\n\n---\n\n⚠️ **Erreurs détectées, correction automatique avec vérification en cours...**\n\n');
  sendAgentStatus(controller, encoder, 'fixer', 'executing');

  const fixerModel = getAnthropicModel(getAPIKey(context.cloudflare.env));

  // Define the fixer function for the verification loop
  const runFixer = async (prompt: string, messages: ChatMessage[]): Promise<string> => {
    const fixerResult = await _streamText({
      model: fixerModel,
      system: getAgentSystemPrompt('fixer'),
      maxOutputTokens: 32768,
      messages,
    });

    let output = '';

    for await (const chunk of fixerResult.textStream) {
      output += chunk;
      sendText(controller, encoder, chunk);
    }

    return output;
  };

  // Run verification loop with retries
  const verificationResult = await runAutoFixWithVerification(
    runFixer,
    fullAgentOutput,
    sourceAgent,
    agentMessages,
    {
      maxRetries: DEFAULT_VERIFICATION_CONFIG.maxRetries,
      rollbackOnFailure: DEFAULT_VERIFICATION_CONFIG.rollbackOnFailure,
      verbose: false,
    },
  );

  // Report results
  if (verificationResult.success) {
    sendText(
      controller,
      encoder,
      `\n\n✅ **Correction réussie** (tentative ${verificationResult.totalAttempts}/${DEFAULT_VERIFICATION_CONFIG.maxRetries})\n`,
    );
  } else if (verificationResult.rolledBack) {
    sendText(
      controller,
      encoder,
      `\n\n⚠️ **Correction échouée après ${verificationResult.totalAttempts} tentatives - rollback effectué**\n`,
    );
    sendText(
      controller,
      encoder,
      `Erreurs restantes: ${verificationResult.finalErrors.map((e) => e.message).join(', ')}\n`,
    );
  } else {
    sendText(
      controller,
      encoder,
      `\n\n⚠️ **Correction partielle après ${verificationResult.totalAttempts} tentatives**\n`,
    );
  }

  // Log metrics periodically
  const metrics = getVerificationMetrics();

  if (metrics.totalFixOperations % 10 === 0) {
    logger.info('Verification metrics checkpoint', {
      total: metrics.totalFixOperations,
      successRate: `${(metrics.successRate * 100).toFixed(1)}%`,
      avgAttempts: metrics.averageAttempts.toFixed(2),
    });
  }

  sendAgentStatus(controller, encoder, 'fixer', 'completed');
  logger.info('Fixer agent completed with verification', {
    success: verificationResult.success,
    attempts: verificationResult.totalAttempts,
    rolledBack: verificationResult.rolledBack,
    durationMs: verificationResult.totalDurationMs,
  });
}

/*
 * ============================================================================
 * ERROR HANDLING
 * ============================================================================
 */

function handleStreamError(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  error: unknown,
  abortController: AbortController,
): void {
  const isTimeout = abortController.signal.aborted;
  const errorMessage = isTimeout
    ? 'La requête a dépassé le délai maximum (10 minutes). Veuillez réessayer avec une demande plus simple.'
    : error instanceof Error
      ? error.message
      : 'Unknown error';

  logger.error('Agent error:', { message: errorMessage, isTimeout });

  sendError(controller, encoder, errorMessage);
  sendAgentStatus(controller, encoder, 'orchestrator', 'failed');
}
