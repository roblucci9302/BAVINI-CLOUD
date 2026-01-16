/*
 * see https://docs.anthropic.com/en/docs/about-claude/models
 * Increased from 16K to 32K for more complex code generation
 */
export const MAX_TOKENS = 32768;

// limits the number of model responses that can be returned in a single request
export const MAX_RESPONSE_SEGMENTS = 2;
