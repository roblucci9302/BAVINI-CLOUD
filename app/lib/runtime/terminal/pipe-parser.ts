/**
 * =============================================================================
 * BAVINI Container - Pipe Parser
 * =============================================================================
 * FIX 3.2: Parses shell pipes and redirections.
 * Supports: | (pipe), > (overwrite), >> (append), < (input redirect)
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PipeParser');

/**
 * Types of operators in a pipeline
 */
export type PipeOperator = '|' | '>' | '>>' | '<';

/**
 * A single command in a pipeline
 */
export interface PipelineCommand {
  /** Raw command string */
  raw: string;
  /** Command name */
  command: string;
  /** Command arguments */
  args: string[];
}

/**
 * Redirection target
 */
export interface Redirection {
  /** Type of redirection */
  type: '>' | '>>' | '<';
  /** Target file path */
  file: string;
}

/**
 * Parsed pipeline structure
 */
export interface ParsedPipeline {
  /** Commands in the pipeline (connected by |) */
  commands: PipelineCommand[];
  /** Output redirection (> or >>) */
  outputRedirect?: Redirection;
  /** Input redirection (<) */
  inputRedirect?: Redirection;
  /** Whether this is a simple command (no pipes or redirects) */
  isSimple: boolean;
}

/**
 * Check if input contains pipe operators
 */
export function hasPipeOperators(input: string): boolean {
  // Check for unquoted pipe/redirect operators
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    // Check for operators outside quotes
    if (!inSingleQuote && !inDoubleQuote) {
      if (char === '|' || char === '>' || char === '<') {
        return true;
      }
    }
  }

  return false;
}

/**
 * Parse a command line into a pipeline structure
 */
export function parsePipeline(input: string): ParsedPipeline {
  const result: ParsedPipeline = {
    commands: [],
    isSimple: true,
  };

  if (!hasPipeOperators(input)) {
    // Simple command, no pipes
    const cmd = parseSimpleCommand(input.trim());
    if (cmd) {
      result.commands.push(cmd);
    }
    return result;
  }

  result.isSimple = false;

  // Split by operators while respecting quotes
  const segments = splitByOperators(input);

  logger.debug('Pipeline segments:', segments);

  let currentCommands: string[] = [];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    if (segment.type === 'command') {
      currentCommands.push(segment.value);
    } else if (segment.type === 'operator') {
      const op = segment.value as PipeOperator;

      if (op === '|') {
        // Pipe: add current command to pipeline
        if (currentCommands.length > 0) {
          const cmd = parseSimpleCommand(currentCommands.join(' ').trim());
          if (cmd) {
            result.commands.push(cmd);
          }
          currentCommands = [];
        }
      } else if (op === '>' || op === '>>') {
        // Output redirect: get file from next segment
        if (currentCommands.length > 0) {
          const cmd = parseSimpleCommand(currentCommands.join(' ').trim());
          if (cmd) {
            result.commands.push(cmd);
          }
          currentCommands = [];
        }

        // Next segment should be the file
        const nextSegment = segments[i + 1];
        if (nextSegment && nextSegment.type === 'command') {
          result.outputRedirect = {
            type: op,
            file: nextSegment.value.trim(),
          };
          i++; // Skip the file segment
        }
      } else if (op === '<') {
        // Input redirect: get file from next segment
        const nextSegment = segments[i + 1];
        if (nextSegment && nextSegment.type === 'command') {
          result.inputRedirect = {
            type: op,
            file: nextSegment.value.trim(),
          };
          i++; // Skip the file segment
        }
      }
    }
  }

  // Add remaining command
  if (currentCommands.length > 0) {
    const cmd = parseSimpleCommand(currentCommands.join(' ').trim());
    if (cmd) {
      result.commands.push(cmd);
    }
  }

  return result;
}

/**
 * Segment type from split
 */
interface Segment {
  type: 'command' | 'operator';
  value: string;
}

/**
 * Split input by operators while respecting quotes
 */
function splitByOperators(input: string): Segment[] {
  const segments: Segment[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      current += char;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += char;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    // Check for operators outside quotes
    if (!inSingleQuote && !inDoubleQuote) {
      // Check for >> first (two characters)
      if (char === '>' && input[i + 1] === '>') {
        if (current.trim()) {
          segments.push({ type: 'command', value: current });
        }
        segments.push({ type: 'operator', value: '>>' });
        current = '';
        i++; // Skip next >
        continue;
      }

      if (char === '|' || char === '>' || char === '<') {
        if (current.trim()) {
          segments.push({ type: 'command', value: current });
        }
        segments.push({ type: 'operator', value: char });
        current = '';
        continue;
      }
    }

    current += char;
  }

  // Add remaining content
  if (current.trim()) {
    segments.push({ type: 'command', value: current });
  }

  return segments;
}

/**
 * Parse a simple command (no pipes/redirects) into command + args
 */
function parseSimpleCommand(input: string): PipelineCommand | null {
  const tokens = tokenize(input);

  if (tokens.length === 0) {
    return null;
  }

  const [command, ...args] = tokens;

  return {
    raw: input,
    command,
    args,
  };
}

/**
 * Tokenize a command string respecting quotes
 */
function tokenize(input: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (escape) {
      current += char;
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Format a pipeline for display (debugging)
 */
export function formatPipeline(pipeline: ParsedPipeline): string {
  let result = pipeline.commands.map((c) => c.raw).join(' | ');

  if (pipeline.outputRedirect) {
    result += ` ${pipeline.outputRedirect.type} ${pipeline.outputRedirect.file}`;
  }

  if (pipeline.inputRedirect) {
    result = `${pipeline.inputRedirect.file} < ` + result;
  }

  return result;
}
