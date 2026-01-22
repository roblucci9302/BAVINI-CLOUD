/**
 * =============================================================================
 * BAVINI Container - HTTP Module
 * =============================================================================
 * Node.js http module implementation for browser environment.
 * Uses fetch API for client requests and provides mock server functionality.
 * =============================================================================
 */

import { EventEmitter } from './events';
import { Readable, Writable, Duplex } from './stream';
import { Buffer } from '../globals/buffer';

/**
 * HTTP methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS' | 'CONNECT' | 'TRACE';

/**
 * HTTP status codes
 */
export const STATUS_CODES: Record<number, string> = {
  100: 'Continue',
  101: 'Switching Protocols',
  102: 'Processing',
  200: 'OK',
  201: 'Created',
  202: 'Accepted',
  204: 'No Content',
  206: 'Partial Content',
  301: 'Moved Permanently',
  302: 'Found',
  303: 'See Other',
  304: 'Not Modified',
  307: 'Temporary Redirect',
  308: 'Permanent Redirect',
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  405: 'Method Not Allowed',
  408: 'Request Timeout',
  409: 'Conflict',
  410: 'Gone',
  413: 'Payload Too Large',
  414: 'URI Too Long',
  415: 'Unsupported Media Type',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

/**
 * HTTP methods array
 */
export const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS', 'CONNECT', 'TRACE'];

/**
 * Request options
 */
export interface RequestOptions {
  protocol?: string;
  hostname?: string;
  host?: string;
  port?: number | string;
  path?: string;
  method?: HttpMethod | string;
  headers?: Record<string, string | string[]>;
  timeout?: number;
  agent?: Agent | boolean;
  signal?: AbortSignal;
}

/**
 * Server options
 */
export interface ServerOptions {
  IncomingMessage?: typeof IncomingMessage;
  ServerResponse?: typeof ServerResponse;
}

/**
 * Incoming HTTP headers
 */
export type IncomingHttpHeaders = Record<string, string | string[] | undefined>;

/**
 * Outgoing HTTP headers
 */
export type OutgoingHttpHeaders = Record<string, string | number | string[] | undefined>;

/**
 * IncomingMessage - represents an incoming HTTP request/response
 */
export class IncomingMessage extends Readable {
  httpVersion: string = '1.1';
  httpVersionMajor: number = 1;
  httpVersionMinor: number = 1;
  headers: IncomingHttpHeaders = {};
  rawHeaders: string[] = [];
  trailers: Record<string, string> = {};
  rawTrailers: string[] = [];
  method?: string;
  url?: string;
  statusCode?: number;
  statusMessage?: string;
  socket: unknown = null;
  aborted: boolean = false;
  complete: boolean = false;

  constructor() {
    super();
  }

  /**
   * Set headers from Response or headers object
   */
  _setHeaders(headers: Headers | Record<string, string>): void {
    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        this.headers[key.toLowerCase()] = value;
        this.rawHeaders.push(key, value);
      });
    } else {
      for (const [key, value] of Object.entries(headers)) {
        this.headers[key.toLowerCase()] = value;
        this.rawHeaders.push(key, value);
      }
    }
  }

  /**
   * Abort the request
   */
  abort(): void {
    this.aborted = true;
    this.emit('aborted');
    this.destroy();
  }

  setTimeout(msecs: number, callback?: () => void): this {
    if (callback) {
      this.once('timeout', callback);
    }

    setTimeout(() => {
      this.emit('timeout');
    }, msecs);

    return this;
  }
}

/**
 * ServerResponse - represents an HTTP response from the server
 */
export class ServerResponse extends Writable {
  statusCode: number = 200;
  statusMessage: string = 'OK';
  headers: OutgoingHttpHeaders = {};
  headersSent: boolean = false;
  finished: boolean = false;
  sendDate: boolean = true;

  private _chunks: Buffer[] = [];

  constructor() {
    super();
  }

  /**
   * Write status line
   */
  writeHead(statusCode: number, statusMessage?: string | OutgoingHttpHeaders, headers?: OutgoingHttpHeaders): this {
    if (this.headersSent) {
      throw new Error('Headers already sent');
    }

    this.statusCode = statusCode;

    if (typeof statusMessage === 'string') {
      this.statusMessage = statusMessage;

      if (headers) {
        Object.assign(this.headers, headers);
      }
    } else if (typeof statusMessage === 'object') {
      this.statusMessage = STATUS_CODES[statusCode] || 'Unknown';
      Object.assign(this.headers, statusMessage);
    }

    return this;
  }

  /**
   * Set a header
   */
  setHeader(name: string, value: string | number | string[]): this {
    if (this.headersSent) {
      throw new Error('Headers already sent');
    }

    this.headers[name.toLowerCase()] = value;
    return this;
  }

  /**
   * Get a header
   */
  getHeader(name: string): string | number | string[] | undefined {
    return this.headers[name.toLowerCase()];
  }

  /**
   * Get all header names
   */
  getHeaderNames(): string[] {
    return Object.keys(this.headers);
  }

  /**
   * Get all headers
   */
  getHeaders(): OutgoingHttpHeaders {
    return { ...this.headers };
  }

  /**
   * Check if header exists
   */
  hasHeader(name: string): boolean {
    return name.toLowerCase() in this.headers;
  }

  /**
   * Remove a header
   */
  removeHeader(name: string): void {
    if (this.headersSent) {
      throw new Error('Headers already sent');
    }

    delete this.headers[name.toLowerCase()];
  }

  /**
   * Write chunk
   */
  _write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (!this.headersSent) {
      this.headersSent = true;
    }

    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding);
    this._chunks.push(buf);
    callback();
  }

  /**
   * Get the response body
   */
  _getBody(): Buffer {
    return Buffer.concat(this._chunks);
  }

  /**
   * Write and end
   */
  end(chunk?: unknown, encoding?: BufferEncoding | (() => void), callback?: () => void): this {
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }

    if (chunk !== undefined) {
      this.write(chunk, encoding);
    }

    if (!this.headersSent) {
      this.headersSent = true;
    }

    this.finished = true;
    this.emit('finish');

    if (callback) callback();

    return this;
  }

  /**
   * Flush headers
   */
  flushHeaders(): void {
    if (!this.headersSent) {
      this.headersSent = true;
      this.emit('headers');
    }
  }

  /**
   * Add trailing headers
   */
  addTrailers(headers: Record<string, string>): void {
    // Not supported in browser
  }

  /**
   * Write continue
   */
  writeContinue(): void {
    // Not supported in browser
  }

  /**
   * Write early hints
   */
  writeEarlyHints(hints: Record<string, string | string[]>): void {
    // Not supported in browser
  }

  /**
   * Write processing
   */
  writeProcessing(): void {
    // Not supported in browser
  }
}

/**
 * ClientRequest - represents an outgoing HTTP request
 */
export class ClientRequest extends Writable {
  method: string;
  path: string;
  host: string;
  protocol: string;
  port: number;
  headers: OutgoingHttpHeaders = {};
  headersSent: boolean = false;
  finished: boolean = false;
  aborted: boolean = false;
  reusedSocket: boolean = false;
  maxHeadersCount: number = 2000;

  private _chunks: Buffer[] = [];
  private _response?: IncomingMessage;
  private _controller?: AbortController;
  private _timeout?: ReturnType<typeof setTimeout>;

  constructor(url: string | URL | RequestOptions, callback?: (res: IncomingMessage) => void) {
    super();

    if (callback) {
      this.once('response', (...args: unknown[]) => callback(args[0] as IncomingMessage));
    }

    // Parse URL or options
    if (typeof url === 'string') {
      const parsed = new URL(url);
      this.protocol = parsed.protocol;
      this.host = parsed.hostname;
      this.port = parseInt(parsed.port) || (parsed.protocol === 'https:' ? 443 : 80);
      this.path = parsed.pathname + parsed.search;
      this.method = 'GET';
    } else if (url instanceof URL) {
      this.protocol = url.protocol;
      this.host = url.hostname;
      this.port = parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80);
      this.path = url.pathname + url.search;
      this.method = 'GET';
    } else {
      const opts = url;
      this.protocol = opts.protocol || 'http:';
      this.host = opts.hostname || opts.host || 'localhost';
      this.port = typeof opts.port === 'string' ? parseInt(opts.port) : opts.port || 80;
      this.path = opts.path || '/';
      this.method = opts.method || 'GET';

      if (opts.headers) {
        Object.assign(this.headers, opts.headers);
      }

      if (opts.signal) {
        opts.signal.addEventListener('abort', () => this.abort());
      }
    }

    this._controller = new AbortController();
  }

  /**
   * Set a header
   */
  setHeader(name: string, value: string | number | string[]): this {
    if (this.headersSent) {
      throw new Error('Headers already sent');
    }

    this.headers[name.toLowerCase()] = value;
    return this;
  }

  /**
   * Get a header
   */
  getHeader(name: string): string | number | string[] | undefined {
    return this.headers[name.toLowerCase()];
  }

  /**
   * Remove a header
   */
  removeHeader(name: string): void {
    if (this.headersSent) {
      throw new Error('Headers already sent');
    }

    delete this.headers[name.toLowerCase()];
  }

  /**
   * Set timeout
   */
  setTimeout(msecs: number, callback?: () => void): this {
    if (callback) {
      this.once('timeout', callback);
    }

    this._timeout = setTimeout(() => {
      this.emit('timeout');
      this.abort();
    }, msecs);

    return this;
  }

  /**
   * Set no delay (no-op in browser)
   */
  setNoDelay(noDelay?: boolean): this {
    return this;
  }

  /**
   * Set socket keep alive (no-op in browser)
   */
  setSocketKeepAlive(enable?: boolean, initialDelay?: number): this {
    return this;
  }

  /**
   * Flush headers
   */
  flushHeaders(): void {
    if (!this.headersSent) {
      this.headersSent = true;
    }
  }

  /**
   * Write chunk
   */
  _write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    if (!this.headersSent) {
      this.headersSent = true;
    }

    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk), encoding);
    this._chunks.push(buf);
    callback();
  }

  /**
   * End the request and send
   */
  end(chunk?: unknown, encoding?: BufferEncoding | (() => void), callback?: () => void): this {
    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }

    if (chunk !== undefined) {
      this.write(chunk, encoding);
    }

    if (!this.headersSent) {
      this.headersSent = true;
    }

    this.finished = true;

    // Execute the request using fetch
    this._executeRequest()
      .then((response) => {
        if (callback) callback();
        this.emit('response', response);
      })
      .catch((err) => {
        this.emit('error', err);
      });

    return this;
  }

  /**
   * Abort the request
   */
  abort(): void {
    if (this.aborted) return;

    this.aborted = true;
    this._controller?.abort();

    if (this._timeout) {
      clearTimeout(this._timeout);
    }

    this.emit('abort');
    this.destroy();
  }

  private async _executeRequest(): Promise<IncomingMessage> {
    const url = `${this.protocol}//${this.host}:${this.port}${this.path}`;

    // Build headers
    const headers: Record<string, string> = {};

    for (const [key, value] of Object.entries(this.headers)) {
      if (value !== undefined) {
        headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
      }
    }

    // Build body
    const body = this._chunks.length > 0 ? Buffer.concat(this._chunks) : undefined;

    try {
      const response = await fetch(url, {
        method: this.method,
        headers,
        body: body && this.method !== 'GET' && this.method !== 'HEAD' ? body : undefined,
        signal: this._controller?.signal,
      });

      // Create IncomingMessage
      const msg = new IncomingMessage();
      msg.statusCode = response.status;
      msg.statusMessage = response.statusText;
      msg._setHeaders(response.headers);

      // Read body
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      msg.push(buffer);
      msg.push(null);
      msg.complete = true;

      this._response = msg;
      return msg;
    } catch (err) {
      if (this._timeout) {
        clearTimeout(this._timeout);
      }

      throw err;
    }
  }
}

/**
 * Agent - manages connection pooling (simplified for browser)
 */
export class Agent extends EventEmitter {
  defaultPort: number = 80;
  protocol: string = 'http:';
  options: Record<string, unknown>;
  requests: Map<string, ClientRequest[]> = new Map();
  sockets: Map<string, unknown[]> = new Map();
  freeSockets: Map<string, unknown[]> = new Map();
  maxSockets: number;
  maxFreeSockets: number;
  maxTotalSockets: number;
  keepAlive: boolean;
  keepAliveMsecs: number;
  timeout: number;
  scheduling: 'fifo' | 'lifo';

  constructor(options?: {
    keepAlive?: boolean;
    keepAliveMsecs?: number;
    maxSockets?: number;
    maxFreeSockets?: number;
    maxTotalSockets?: number;
    timeout?: number;
    scheduling?: 'fifo' | 'lifo';
  }) {
    super();

    this.options = options || {};
    this.keepAlive = options?.keepAlive ?? false;
    this.keepAliveMsecs = options?.keepAliveMsecs ?? 1000;
    this.maxSockets = options?.maxSockets ?? Infinity;
    this.maxFreeSockets = options?.maxFreeSockets ?? 256;
    this.maxTotalSockets = options?.maxTotalSockets ?? Infinity;
    this.timeout = options?.timeout ?? 0;
    this.scheduling = options?.scheduling ?? 'lifo';
  }

  createConnection(options: RequestOptions, callback?: (err: Error | null, socket: unknown) => void): unknown {
    // Not implemented - browser uses fetch
    return null;
  }

  getName(options: RequestOptions): string {
    const host = options.hostname || options.host || 'localhost';
    const port = options.port || 80;
    return `${host}:${port}`;
  }

  destroy(): void {
    this.requests.clear();
    this.sockets.clear();
    this.freeSockets.clear();
  }
}

/**
 * Global agent
 */
export const globalAgent = new Agent({ keepAlive: true });

/**
 * Server - HTTP server implementation (mock for browser)
 */
export class Server extends EventEmitter {
  listening: boolean = false;
  maxHeadersCount: number = 2000;
  timeout: number = 0;
  headersTimeout: number = 60000;
  keepAliveTimeout: number = 5000;
  requestTimeout: number = 0;
  maxConnections: number = 0;

  private _port: number = 0;
  private _hostname: string = 'localhost';
  private _handlers: Map<string, (req: IncomingMessage, res: ServerResponse) => void> = new Map();

  constructor(options?: ServerOptions | ((req: IncomingMessage, res: ServerResponse) => void), requestListener?: (req: IncomingMessage, res: ServerResponse) => void) {
    super();

    if (typeof options === 'function') {
      requestListener = options;
    }

    if (requestListener) {
      this.on('request', (...args: unknown[]) => requestListener(args[0] as IncomingMessage, args[1] as ServerResponse));
    }
  }

  /**
   * Start listening
   */
  listen(port?: number, hostname?: string | (() => void), backlog?: number | (() => void), callback?: () => void): this {
    if (typeof hostname === 'function') {
      callback = hostname;
      hostname = undefined;
    }

    if (typeof backlog === 'function') {
      callback = backlog;
      backlog = undefined;
    }

    this._port = port || 0;
    this._hostname = (hostname as string) || 'localhost';
    this.listening = true;

    // Emit listening event
    queueMicrotask(() => {
      this.emit('listening');

      if (callback) callback();
    });

    return this;
  }

  /**
   * Close the server
   */
  close(callback?: (error?: Error) => void): this {
    this.listening = false;
    this.emit('close');

    if (callback) callback();

    return this;
  }

  /**
   * Get address
   */
  address(): { port: number; family: string; address: string } | null {
    if (!this.listening) return null;

    return {
      port: this._port,
      family: 'IPv4',
      address: this._hostname,
    };
  }

  /**
   * Set timeout
   */
  setTimeout(msecs?: number, callback?: () => void): this {
    this.timeout = msecs ?? 0;

    if (callback) {
      this.on('timeout', callback);
    }

    return this;
  }

  /**
   * Close all connections
   */
  closeAllConnections(): void {
    // Not applicable in browser mock
  }

  /**
   * Close idle connections
   */
  closeIdleConnections(): void {
    // Not applicable in browser mock
  }

  /**
   * Handle a request (for testing/mocking)
   */
  _handleRequest(method: string, url: string, headers: Record<string, string>, body?: Buffer): Promise<{ statusCode: number; headers: OutgoingHttpHeaders; body: Buffer }> {
    return new Promise((resolve, reject) => {
      const req = new IncomingMessage();
      req.method = method;
      req.url = url;
      req._setHeaders(headers);

      if (body) {
        req.push(body);
      }

      req.push(null);
      req.complete = true;

      const res = new ServerResponse();

      res.on('finish', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.getHeaders(),
          body: res._getBody(),
        });
      });

      this.emit('request', req, res);
    });
  }
}

/**
 * Create an HTTP server
 */
export function createServer(options?: ServerOptions | ((req: IncomingMessage, res: ServerResponse) => void), requestListener?: (req: IncomingMessage, res: ServerResponse) => void): Server {
  return new Server(options, requestListener);
}

/**
 * Make an HTTP request
 */
export function request(url: string | URL | RequestOptions, options?: RequestOptions | ((res: IncomingMessage) => void), callback?: (res: IncomingMessage) => void): ClientRequest {
  if (typeof options === 'function') {
    callback = options;
    options = undefined;
  }

  const opts: RequestOptions = typeof url === 'string' || url instanceof URL ? { ...options } : { ...url, ...options };

  if (typeof url === 'string') {
    const parsed = new URL(url);
    opts.protocol = parsed.protocol;
    opts.hostname = parsed.hostname;
    opts.port = parsed.port;
    opts.path = parsed.pathname + parsed.search;
  } else if (url instanceof URL) {
    opts.protocol = url.protocol;
    opts.hostname = url.hostname;
    opts.port = url.port;
    opts.path = url.pathname + url.search;
  }

  return new ClientRequest(opts, callback);
}

/**
 * Make an HTTP GET request
 */
export function get(url: string | URL | RequestOptions, options?: RequestOptions | ((res: IncomingMessage) => void), callback?: (res: IncomingMessage) => void): ClientRequest {
  const req = request(url, options, callback);
  req.end();
  return req;
}

/**
 * Validate header name
 */
export function validateHeaderName(name: string): void {
  if (typeof name !== 'string' || name.length === 0) {
    throw new TypeError('Header name must be a non-empty string');
  }

  if (!/^[\^_`a-zA-Z\-0-9!#$%&'*+.|~]+$/.test(name)) {
    throw new TypeError(`Invalid header name: "${name}"`);
  }
}

/**
 * Validate header value
 */
export function validateHeaderValue(name: string, value: unknown): void {
  if (value === undefined) {
    throw new TypeError(`Invalid header value for "${name}"`);
  }
}

/**
 * Set max header size
 */
export let maxHeaderSize = 16 * 1024; // 16KB

export function setMaxIdleHTTPParsers(count: number): void {
  // Not applicable in browser
}

/**
 * Default export
 */
export default {
  METHODS,
  STATUS_CODES,
  Agent,
  ClientRequest,
  IncomingMessage,
  Server,
  ServerResponse,
  createServer,
  get,
  globalAgent,
  maxHeaderSize,
  request,
  setMaxIdleHTTPParsers,
  validateHeaderName,
  validateHeaderValue,
};
