/**
 * =============================================================================
 * BAVINI Container - Console Implementation
 * =============================================================================
 * Node.js console object implementation with formatting.
 * =============================================================================
 */

import type { ConsoleObject } from '../types';

/**
 * Console configuration
 */
export interface ConsoleConfig {
  stdout?: (data: string) => void;
  stderr?: (data: string) => void;
  colorMode?: boolean | 'auto';
}

/**
 * ANSI color codes
 */
const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

/**
 * Create a Node.js console object
 */
export function createConsole(config: ConsoleConfig = {}): ConsoleObject {
  const stdout = config.stdout ?? ((data) => globalThis.console.log(data));
  const stderr = config.stderr ?? ((data) => globalThis.console.error(data));
  const useColors = config.colorMode === true || (config.colorMode !== false && typeof window !== 'undefined');

  // Timer storage
  const timers = new Map<string, number>();

  // Counter storage
  const counters = new Map<string, number>();

  // Group depth
  let groupDepth = 0;

  /**
   * Format value for output
   */
  function formatValue(value: unknown, depth = 0): string {
    if (value === null) return useColors ? `${COLORS.bold}null${COLORS.reset}` : 'null';
    if (value === undefined) return useColors ? `${COLORS.dim}undefined${COLORS.reset}` : 'undefined';

    const type = typeof value;

    if (type === 'string') {
      return useColors ? `${COLORS.green}'${value}'${COLORS.reset}` : `'${value}'`;
    }

    if (type === 'number') {
      return useColors ? `${COLORS.yellow}${value}${COLORS.reset}` : String(value);
    }

    if (type === 'boolean') {
      return useColors ? `${COLORS.yellow}${value}${COLORS.reset}` : String(value);
    }

    if (type === 'bigint') {
      return useColors ? `${COLORS.yellow}${value}n${COLORS.reset}` : `${value}n`;
    }

    if (type === 'symbol') {
      return useColors ? `${COLORS.green}${value.toString()}${COLORS.reset}` : value.toString();
    }

    if (type === 'function') {
      const name = (value as Function).name || 'anonymous';
      return useColors ? `${COLORS.cyan}[Function: ${name}]${COLORS.reset}` : `[Function: ${name}]`;
    }

    if (Array.isArray(value)) {
      if (depth > 2) return '[Array]';

      const items = value.map((v) => formatValue(v, depth + 1)).join(', ');
      return `[ ${items} ]`;
    }

    if (value instanceof Date) {
      return useColors ? `${COLORS.magenta}${value.toISOString()}${COLORS.reset}` : value.toISOString();
    }

    if (value instanceof RegExp) {
      return useColors ? `${COLORS.red}${value.toString()}${COLORS.reset}` : value.toString();
    }

    if (value instanceof Error) {
      return useColors ? `${COLORS.red}${value.stack || value.message}${COLORS.reset}` : value.stack || value.message;
    }

    if (type === 'object') {
      if (depth > 2) return '[Object]';

      const entries = Object.entries(value as object)
        .map(([k, v]) => `${k}: ${formatValue(v, depth + 1)}`)
        .join(', ');
      return `{ ${entries} }`;
    }

    return String(value);
  }

  /**
   * Format multiple arguments
   */
  function formatArgs(args: unknown[]): string {
    if (args.length === 0) return '';

    // Handle format string (like printf)
    if (typeof args[0] === 'string' && args.length > 1) {
      let str = args[0] as string;
      let argIndex = 1;

      str = str.replace(/%[sdifjoO%]/g, (match) => {
        if (match === '%%') return '%';
        if (argIndex >= args.length) return match;

        const arg = args[argIndex++];

        switch (match) {
          case '%s':
            return String(arg);
          case '%d':
          case '%i':
            return String(parseInt(String(arg), 10));
          case '%f':
            return String(parseFloat(String(arg)));
          case '%j':
            try {
              return JSON.stringify(arg);
            } catch {
              return '[Circular]';
            }
          case '%o':
          case '%O':
            return formatValue(arg);
          default:
            return match;
        }
      });

      // Add remaining args
      const remaining = args.slice(argIndex).map((a) => formatValue(a));

      if (remaining.length > 0) {
        return str + ' ' + remaining.join(' ');
      }

      return str;
    }

    return args.map((a) => formatValue(a)).join(' ');
  }

  /**
   * Get indent string based on group depth
   */
  function getIndent(): string {
    return '  '.repeat(groupDepth);
  }

  const console: ConsoleObject = {
    log(...args: unknown[]): void {
      stdout(getIndent() + formatArgs(args) + '\n');
    },

    info(...args: unknown[]): void {
      const prefix = useColors ? `${COLORS.blue}ℹ${COLORS.reset} ` : 'ℹ ';
      stdout(getIndent() + prefix + formatArgs(args) + '\n');
    },

    warn(...args: unknown[]): void {
      const prefix = useColors ? `${COLORS.yellow}⚠${COLORS.reset} ` : '⚠ ';
      stderr(getIndent() + prefix + formatArgs(args) + '\n');
    },

    error(...args: unknown[]): void {
      const prefix = useColors ? `${COLORS.red}✖${COLORS.reset} ` : '✖ ';
      stderr(getIndent() + prefix + formatArgs(args) + '\n');
    },

    debug(...args: unknown[]): void {
      const prefix = useColors ? `${COLORS.dim}[debug]${COLORS.reset} ` : '[debug] ';
      stdout(getIndent() + prefix + formatArgs(args) + '\n');
    },

    trace(...args: unknown[]): void {
      const stack = new Error().stack?.split('\n').slice(2).join('\n') ?? '';
      stdout(getIndent() + 'Trace: ' + formatArgs(args) + '\n' + stack + '\n');
    },

    dir(obj: unknown, options?: { depth?: number; colors?: boolean }): void {
      const formatted = formatValue(obj, 0);
      stdout(getIndent() + formatted + '\n');
    },

    table(data: unknown, columns?: string[]): void {
      if (!Array.isArray(data) && typeof data !== 'object') {
        console.log(data);
        return;
      }

      // Simple table implementation
      const rows: unknown[] = Array.isArray(data) ? data : [data];
      const headers = columns ?? (rows.length > 0 ? Object.keys(rows[0] as object) : []);

      // Calculate column widths
      const widths = headers.map((h) => h.length);

      for (const row of rows) {
        for (let i = 0; i < headers.length; i++) {
          const val = String((row as Record<string, unknown>)[headers[i]] ?? '');
          widths[i] = Math.max(widths[i], val.length);
        }
      }

      // Print header
      const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join(' | ');
      const separator = widths.map((w) => '-'.repeat(w)).join('-+-');

      stdout(getIndent() + headerLine + '\n');
      stdout(getIndent() + separator + '\n');

      // Print rows
      for (const row of rows) {
        const rowLine = headers.map((h, i) => String((row as Record<string, unknown>)[h] ?? '').padEnd(widths[i])).join(' | ');
        stdout(getIndent() + rowLine + '\n');
      }
    },

    time(label = 'default'): void {
      timers.set(label, performance.now());
    },

    timeEnd(label = 'default'): void {
      const start = timers.get(label);

      if (start === undefined) {
        stderr(`Timer '${label}' does not exist\n`);
        return;
      }

      const duration = performance.now() - start;
      timers.delete(label);
      stdout(getIndent() + `${label}: ${duration.toFixed(3)}ms\n`);
    },

    timeLog(label = 'default', ...args: unknown[]): void {
      const start = timers.get(label);

      if (start === undefined) {
        stderr(`Timer '${label}' does not exist\n`);
        return;
      }

      const duration = performance.now() - start;
      stdout(getIndent() + `${label}: ${duration.toFixed(3)}ms ${formatArgs(args)}\n`);
    },

    count(label = 'default'): void {
      const count = (counters.get(label) ?? 0) + 1;
      counters.set(label, count);
      stdout(getIndent() + `${label}: ${count}\n`);
    },

    countReset(label = 'default'): void {
      counters.delete(label);
    },

    group(...args: unknown[]): void {
      if (args.length > 0) {
        stdout(getIndent() + formatArgs(args) + '\n');
      }

      groupDepth++;
    },

    groupCollapsed(...args: unknown[]): void {
      // Same as group in terminal
      console.group(...args);
    },

    groupEnd(): void {
      if (groupDepth > 0) {
        groupDepth--;
      }
    },

    clear(): void {
      stdout('\x1b[2J\x1b[H');
    },

    assert(condition?: boolean, ...args: unknown[]): void {
      if (!condition) {
        const message = args.length > 0 ? formatArgs(args) : 'Assertion failed';
        stderr(getIndent() + `Assertion failed: ${message}\n`);
      }
    },
  };

  return console;
}
