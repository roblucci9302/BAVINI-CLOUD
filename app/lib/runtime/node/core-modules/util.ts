/**
 * =============================================================================
 * BAVINI Container - Util Module
 * =============================================================================
 * Node.js util module implementation.
 * =============================================================================
 */

/**
 * Format string with printf-style placeholders
 */
export function format(f: unknown, ...args: unknown[]): string {
  if (typeof f !== 'string') {
    return [f, ...args].map((arg) => inspect(arg)).join(' ');
  }

  let i = 0;
  let str = f.replace(/%[sdifjoO%]/g, (match) => {
    if (match === '%%') return '%';
    if (i >= args.length) return match;

    const arg = args[i++];

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
        return inspect(arg);
      default:
        return match;
    }
  });

  // Append remaining args
  while (i < args.length) {
    str += ' ' + inspect(args[i++]);
  }

  return str;
}

/**
 * Format with newline
 */
export function formatWithOptions(inspectOptions: InspectOptions, f: unknown, ...args: unknown[]): string {
  return format(f, ...args);
}

/**
 * Inspect options
 */
export interface InspectOptions {
  showHidden?: boolean;
  depth?: number | null;
  colors?: boolean;
  customInspect?: boolean;
  showProxy?: boolean;
  maxArrayLength?: number | null;
  maxStringLength?: number | null;
  breakLength?: number;
  compact?: boolean | number;
  sorted?: boolean | ((a: string, b: string) => number);
  getters?: boolean | 'get' | 'set';
  numericSeparator?: boolean;
}

/**
 * Custom inspect symbol
 */
export const inspect = Object.assign(
  function inspect(obj: unknown, options?: InspectOptions | boolean): string {
    const opts: InspectOptions =
      typeof options === 'boolean' ? { showHidden: options } : options || {};

    const depth = opts.depth ?? 2;
    const colors = opts.colors ?? false;
    const maxArrayLength = opts.maxArrayLength ?? 100;

    return formatValue(obj, depth, colors, maxArrayLength, new Set());
  },
  {
    custom: Symbol.for('nodejs.util.inspect.custom'),
    colors: {
      bold: [1, 22],
      italic: [3, 23],
      underline: [4, 24],
      inverse: [7, 27],
      white: [37, 39],
      grey: [90, 39],
      black: [30, 39],
      blue: [34, 39],
      cyan: [36, 39],
      green: [32, 39],
      magenta: [35, 39],
      red: [31, 39],
      yellow: [33, 39],
    },
    styles: {
      special: 'cyan',
      number: 'yellow',
      bigint: 'yellow',
      boolean: 'yellow',
      undefined: 'grey',
      null: 'bold',
      string: 'green',
      symbol: 'green',
      date: 'magenta',
      regexp: 'red',
    },
    defaultOptions: {
      showHidden: false,
      depth: 2,
      colors: false,
      customInspect: true,
      showProxy: false,
      maxArrayLength: 100,
      maxStringLength: 10000,
      breakLength: 80,
      compact: 3,
      sorted: false,
      getters: false,
    },
  },
);

function formatValue(
  value: unknown,
  depth: number,
  colors: boolean,
  maxArrayLength: number,
  seen: Set<unknown>,
): string {
  if (value === null) return colors ? '\x1b[1mnull\x1b[0m' : 'null';
  if (value === undefined) return colors ? '\x1b[90mundefined\x1b[0m' : 'undefined';

  const type = typeof value;

  if (type === 'string') {
    const escaped = (value as string).replace(/'/g, "\\'").replace(/\n/g, '\\n');
    return colors ? `\x1b[32m'${escaped}'\x1b[0m` : `'${escaped}'`;
  }

  if (type === 'number') {
    return colors ? `\x1b[33m${value}\x1b[0m` : String(value);
  }

  if (type === 'boolean') {
    return colors ? `\x1b[33m${value}\x1b[0m` : String(value);
  }

  if (type === 'bigint') {
    return colors ? `\x1b[33m${value}n\x1b[0m` : `${value}n`;
  }

  if (type === 'symbol') {
    return colors ? `\x1b[32m${value.toString()}\x1b[0m` : value.toString();
  }

  if (type === 'function') {
    const name = (value as Function).name || 'anonymous';
    return colors ? `\x1b[36m[Function: ${name}]\x1b[0m` : `[Function: ${name}]`;
  }

  // Object types
  if (type === 'object') {
    // Check for circular reference
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);

    if (depth < 0) {
      if (Array.isArray(value)) return '[Array]';
      return '[Object]';
    }

    // Check for custom inspect
    const customInspect = (value as Record<string | symbol, unknown>)[inspect.custom];

    if (typeof customInspect === 'function') {
      return String(customInspect.call(value, depth, { colors }));
    }

    if (value instanceof Date) {
      return colors ? `\x1b[35m${value.toISOString()}\x1b[0m` : value.toISOString();
    }

    if (value instanceof RegExp) {
      return colors ? `\x1b[31m${value.toString()}\x1b[0m` : value.toString();
    }

    if (value instanceof Error) {
      return value.stack || value.message;
    }

    if (value instanceof Map) {
      const entries = Array.from(value.entries())
        .slice(0, maxArrayLength)
        .map(([k, v]) => `${formatValue(k, depth - 1, colors, maxArrayLength, seen)} => ${formatValue(v, depth - 1, colors, maxArrayLength, seen)}`)
        .join(', ');
      return `Map(${value.size}) { ${entries} }`;
    }

    if (value instanceof Set) {
      const entries = Array.from(value)
        .slice(0, maxArrayLength)
        .map((v) => formatValue(v, depth - 1, colors, maxArrayLength, seen))
        .join(', ');
      return `Set(${value.size}) { ${entries} }`;
    }

    if (ArrayBuffer.isView(value)) {
      const name = value.constructor.name;
      return `${name}(${(value as Uint8Array).length}) [ ... ]`;
    }

    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';

      const items = value
        .slice(0, maxArrayLength)
        .map((v) => formatValue(v, depth - 1, colors, maxArrayLength, seen));

      if (value.length > maxArrayLength) {
        items.push(`... ${value.length - maxArrayLength} more items`);
      }

      return `[ ${items.join(', ')} ]`;
    }

    // Plain object
    const keys = Object.keys(value as object);

    if (keys.length === 0) return '{}';

    const entries = keys
      .slice(0, maxArrayLength)
      .map((k) => `${k}: ${formatValue((value as Record<string, unknown>)[k], depth - 1, colors, maxArrayLength, seen)}`);

    if (keys.length > maxArrayLength) {
      entries.push(`... ${keys.length - maxArrayLength} more properties`);
    }

    return `{ ${entries.join(', ')} }`;
  }

  return String(value);
}

/**
 * Deprecated warning
 */
export function deprecate<T extends (...args: unknown[]) => unknown>(
  fn: T,
  msg: string,
  code?: string,
): T {
  let warned = false;

  return function (this: unknown, ...args: unknown[]) {
    if (!warned) {
      warned = true;
      console.warn(`DeprecationWarning: ${msg}${code ? ` (${code})` : ''}`);
    }

    return fn.apply(this, args);
  } as T;
}

/**
 * Inherit prototype (legacy)
 */
export function inherits(
  ctor: new (...args: unknown[]) => unknown,
  superCtor: new (...args: unknown[]) => unknown,
): void {
  Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
}

/**
 * Promisify a callback-style function
 */
export function promisify<T>(
  fn: (...args: [...unknown[], (err: Error | null, result?: T) => void]) => void,
): (...args: unknown[]) => Promise<T> {
  return function (...args: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      fn(...args, (err: Error | null, result?: T) => {
        if (err) {
          reject(err);
        } else {
          resolve(result as T);
        }
      });
    });
  };
}

/**
 * Callbackify a promise-returning function
 */
export function callbackify<T>(
  fn: (...args: unknown[]) => Promise<T>,
): (...args: [...unknown[], (err: Error | null, result?: T) => void]) => void {
  return function (...args: unknown[]): void {
    const callback = args.pop() as (err: Error | null, result?: T) => void;

    fn(...args)
      .then((result) => callback(null, result))
      .catch((err) => callback(err));
  };
}

/**
 * Debug log (simplified)
 */
export function debuglog(section: string): (...args: unknown[]) => void {
  const debug = process?.env?.NODE_DEBUG?.includes(section);

  if (debug) {
    return (...args: unknown[]) => {
      const [first, ...rest] = args;
      console.error(`${section.toUpperCase()} ${process?.pid ?? 0}: ${format(first, ...rest)}`);
    };
  }

  return () => {};
}

/**
 * Check if value is array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Check if value is boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Check if value is null
 */
export function isNull(value: unknown): value is null {
  return value === null;
}

/**
 * Check if value is null or undefined
 */
export function isNullOrUndefined(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * Check if value is number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

/**
 * Check if value is string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Check if value is symbol
 */
export function isSymbol(value: unknown): value is symbol {
  return typeof value === 'symbol';
}

/**
 * Check if value is undefined
 */
export function isUndefined(value: unknown): value is undefined {
  return value === undefined;
}

/**
 * Check if value is object
 */
export function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * Check if value is function
 */
export function isFunction(value: unknown): value is Function {
  return typeof value === 'function';
}

/**
 * Check if value is primitive
 */
export function isPrimitive(value: unknown): boolean {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

/**
 * Check if value is buffer
 */
export function isBuffer(value: unknown): boolean {
  return value instanceof Uint8Array;
}

/**
 * Check if value is date
 */
export function isDate(value: unknown): value is Date {
  return value instanceof Date;
}

/**
 * Check if value is error
 */
export function isError(value: unknown): value is Error {
  return value instanceof Error;
}

/**
 * Check if value is regex
 */
export function isRegExp(value: unknown): value is RegExp {
  return value instanceof RegExp;
}

/**
 * Text decoder
 */
export const TextDecoder = globalThis.TextDecoder;

/**
 * Text encoder
 */
export const TextEncoder = globalThis.TextEncoder;

/**
 * Default export
 */
export default {
  format,
  formatWithOptions,
  inspect,
  deprecate,
  inherits,
  promisify,
  callbackify,
  debuglog,
  isArray,
  isBoolean,
  isNull,
  isNullOrUndefined,
  isNumber,
  isString,
  isSymbol,
  isUndefined,
  isObject,
  isFunction,
  isPrimitive,
  isBuffer,
  isDate,
  isError,
  isRegExp,
  TextDecoder,
  TextEncoder,
};
