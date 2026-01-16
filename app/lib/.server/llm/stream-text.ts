import { streamText as _streamText, stepCountIs, type ToolSet } from 'ai';
import { getAPIKey } from '~/lib/.server/llm/api-key';
import { getAnthropicModel } from '~/lib/.server/llm/model';
import { MAX_TOKENS } from './constants';
import { getSystemPrompt } from './prompts';
import { createWebSearchTools, getWebSearchStatus, isWebSearchAvailable } from './web-search';
import type { Message } from '~/types/message';

export type Messages = Message[];

export interface StreamingOptions {
  onFinish?: Parameters<typeof _streamText>[0]['onFinish'];
  onChunk?: Parameters<typeof _streamText>[0]['onChunk'];
  abortSignal?: AbortSignal;
  toolChoice?: Parameters<typeof _streamText>[0]['toolChoice'];

  /** Enable web search tools (requires TAVILY_API_KEY) */
  enableWebSearch?: boolean;
}

export function streamText(messages: Messages, env: Env, options?: StreamingOptions) {
  // Convert our Message format to the format expected by streamText
  const modelMessages = messages.map((m) => ({
    role: m.role as 'user' | 'assistant' | 'system',
    content: m.content,
  }));

  // Build system prompt with web search status if enabled
  let systemPrompt = getSystemPrompt();

  const webSearchEnabled = options?.enableWebSearch !== false && isWebSearchAvailable(env);

  if (webSearchEnabled) {
    systemPrompt += '\n' + getWebSearchStatus(env);
  }

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
export function streamTextSimple(messages: Messages, env: Env, options?: Omit<StreamingOptions, 'enableWebSearch'>) {
  return streamText(messages, env, { ...options, enableWebSearch: false });
}

/**
 * Check if web search is available in the environment
 */
export { isWebSearchAvailable } from './web-search';
