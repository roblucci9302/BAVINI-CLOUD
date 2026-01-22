/**
 * =============================================================================
 * BAVINI Container - Stream Module
 * =============================================================================
 * Node.js stream module implementation.
 * Provides Readable, Writable, Duplex, Transform, and PassThrough streams.
 * =============================================================================
 */

import { EventEmitter } from './events';
import { Buffer } from '../globals/buffer';

/**
 * Stream options
 */
export interface StreamOptions {
  highWaterMark?: number;
  encoding?: BufferEncoding;
  objectMode?: boolean;
  autoDestroy?: boolean;
}

export interface ReadableOptions extends StreamOptions {
  read?(this: Readable, size: number): void;
}

export interface WritableOptions extends StreamOptions {
  write?(
    this: Writable,
    chunk: unknown,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void;
  writev?(
    this: Writable,
    chunks: Array<{ chunk: unknown; encoding: BufferEncoding }>,
    callback: (error?: Error | null) => void,
  ): void;
  final?(this: Writable, callback: (error?: Error | null) => void): void;
  destroy?(this: Writable, error: Error | null, callback: (error?: Error | null) => void): void;
}

export interface DuplexOptions extends ReadableOptions, WritableOptions {}

export interface TransformOptions extends DuplexOptions {
  transform?(
    this: Transform,
    chunk: unknown,
    encoding: BufferEncoding,
    callback: (error?: Error | null, data?: unknown) => void,
  ): void;
  flush?(this: Transform, callback: (error?: Error | null, data?: unknown) => void): void;
}

/**
 * Internal state for streams
 */
interface ReadableState {
  buffer: unknown[];
  length: number;
  flowing: boolean | null;
  ended: boolean;
  endEmitted: boolean;
  reading: boolean;
  highWaterMark: number;
  encoding: BufferEncoding | null;
  objectMode: boolean;
  destroyed: boolean;
  pipes: Writable[];
}

interface WritableState {
  buffer: Array<{ chunk: unknown; encoding: BufferEncoding; callback: (error?: Error | null) => void }>;
  length: number;
  writing: boolean;
  ended: boolean;
  finished: boolean;
  highWaterMark: number;
  objectMode: boolean;
  destroyed: boolean;
  corked: number;
  finalCalled: boolean;
}

/**
 * Readable stream
 */
export class Readable extends EventEmitter {
  readonly readable: boolean = true;
  readableHighWaterMark: number;
  readableLength: number = 0;
  readableFlowing: boolean | null = null;
  readableEnded: boolean = false;
  readableObjectMode: boolean;

  protected _readableState: ReadableState;

  constructor(options?: ReadableOptions) {
    super();

    const highWaterMark = options?.highWaterMark ?? 16 * 1024;
    const objectMode = options?.objectMode ?? false;

    this._readableState = {
      buffer: [],
      length: 0,
      flowing: null,
      ended: false,
      endEmitted: false,
      reading: false,
      highWaterMark,
      encoding: options?.encoding ?? null,
      objectMode,
      destroyed: false,
      pipes: [],
    };

    this.readableHighWaterMark = highWaterMark;
    this.readableObjectMode = objectMode;

    if (options?.read) {
      this._read = options.read;
    }
  }

  /**
   * Override this method to implement custom read logic
   */
  _read(_size: number): void {
    // Default implementation does nothing
  }

  /**
   * Push data to the readable buffer
   */
  push(chunk: unknown, encoding?: BufferEncoding): boolean {
    const state = this._readableState;

    if (state.destroyed) return false;

    if (chunk === null) {
      // End of stream
      state.ended = true;
      this._maybeReadMore();

      if (state.length === 0) {
        this._emitEnd();
      }

      return false;
    }

    // Convert to buffer if not in object mode
    if (!state.objectMode && typeof chunk === 'string') {
      chunk = Buffer.from(chunk, encoding || 'utf8');
    }

    state.buffer.push(chunk);
    state.length += state.objectMode ? 1 : (chunk as Buffer).length;
    this.readableLength = state.length;

    // Emit data if flowing
    if (state.flowing) {
      this._emitData();
    }

    return state.length < state.highWaterMark;
  }

  /**
   * Read data from the stream
   */
  read(size?: number): unknown {
    const state = this._readableState;

    if (state.destroyed) return null;

    // Start flowing
    if (state.flowing === null) {
      state.flowing = false;
    }

    if (state.length === 0) {
      if (state.ended) {
        this._emitEnd();
      }

      return null;
    }

    // Read all if no size specified or in object mode
    if (size === undefined || size === 0 || state.objectMode) {
      const result = state.objectMode ? state.buffer.shift() : Buffer.concat(state.buffer as Buffer[]);

      if (state.objectMode) {
        state.length = state.buffer.length;
      } else {
        state.buffer = [];
        state.length = 0;
      }

      this.readableLength = state.length;
      this._maybeReadMore();

      return result;
    }

    // Read specific size
    if (state.objectMode) {
      return state.buffer.shift();
    }

    const result: Buffer[] = [];
    let remaining = size;

    while (remaining > 0 && state.buffer.length > 0) {
      const chunk = state.buffer[0] as Buffer;

      if (chunk.length <= remaining) {
        result.push(chunk);
        remaining -= chunk.length;
        state.buffer.shift();
      } else {
        result.push(chunk.slice(0, remaining) as Buffer);
        state.buffer[0] = chunk.slice(remaining);
        remaining = 0;
      }
    }

    const output = Buffer.concat(result);
    state.length -= output.length;
    this.readableLength = state.length;
    this._maybeReadMore();

    return output;
  }

  /**
   * Pipe to writable stream
   */
  pipe<T extends Writable>(destination: T, options?: { end?: boolean }): T {
    const state = this._readableState;
    const endOnEnd = options?.end !== false;

    state.pipes.push(destination);

    // Start flowing
    this.resume();

    // Handle data
    const ondata = (chunk: unknown) => {
      const ret = destination.write(chunk);

      if (!ret) {
        this.pause();
        destination.once('drain', () => this.resume());
      }
    };

    this.on('data', ondata);

    // Handle end
    if (endOnEnd) {
      this.once('end', () => destination.end());
    }

    // Handle unpipe
    const cleanup = () => {
      this.off('data', ondata);
      const idx = state.pipes.indexOf(destination);

      if (idx !== -1) {
        state.pipes.splice(idx, 1);
      }
    };

    destination.on('unpipe', cleanup);

    destination.emit('pipe', this);

    return destination;
  }

  /**
   * Unpipe from destination
   */
  unpipe(destination?: Writable): this {
    const state = this._readableState;

    if (destination) {
      const idx = state.pipes.indexOf(destination);

      if (idx !== -1) {
        state.pipes.splice(idx, 1);
        destination.emit('unpipe', this);
      }
    } else {
      for (const dest of state.pipes) {
        dest.emit('unpipe', this);
      }

      state.pipes = [];
    }

    return this;
  }

  /**
   * Pause the stream
   */
  pause(): this {
    const state = this._readableState;

    if (state.flowing !== false) {
      state.flowing = false;
      this.emit('pause');
    }

    return this;
  }

  /**
   * Resume the stream
   */
  resume(): this {
    const state = this._readableState;

    if (!state.flowing) {
      state.flowing = true;
      this.readableFlowing = true;
      this.emit('resume');
      this._emitData();
    }

    return this;
  }

  /**
   * Set encoding
   */
  setEncoding(encoding: BufferEncoding): this {
    this._readableState.encoding = encoding;
    return this;
  }

  /**
   * Destroy the stream
   */
  destroy(error?: Error): this {
    const state = this._readableState;

    if (state.destroyed) return this;

    state.destroyed = true;

    if (error) {
      this.emit('error', error);
    }

    this.emit('close');
    return this;
  }

  /**
   * Check if stream is destroyed
   */
  get destroyed(): boolean {
    return this._readableState.destroyed;
  }

  /**
   * Async iterator support
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<unknown> {
    const state = this._readableState;

    while (!state.ended || state.length > 0) {
      const chunk = this.read();

      if (chunk !== null) {
        yield chunk;
      } else {
        await new Promise<void>((resolve) => {
          const onResolve = () => resolve();
          this.once('readable', onResolve);
          this.once('end', onResolve);
        });
      }
    }
  }

  protected _maybeReadMore(): void {
    const state = this._readableState;

    if (!state.reading && !state.ended && state.length < state.highWaterMark) {
      state.reading = true;
      this._read(state.highWaterMark - state.length);
      state.reading = false;
    }
  }

  protected _emitData(): void {
    const state = this._readableState;

    while (state.flowing && state.buffer.length > 0) {
      const chunk = state.objectMode ? state.buffer.shift() : this.read();

      if (chunk === null) break;

      this.emit('data', chunk);
    }

    if (state.ended && state.length === 0) {
      this._emitEnd();
    }
  }

  protected _emitEnd(): void {
    const state = this._readableState;

    if (!state.endEmitted) {
      state.endEmitted = true;
      this.emit('end');
    }
  }
}

/**
 * Writable stream
 */
export class Writable extends EventEmitter {
  readonly writable: boolean = true;
  writableHighWaterMark: number;
  writableLength: number = 0;
  writableFinished: boolean = false;
  writableObjectMode: boolean;

  protected _writableState: WritableState;

  constructor(options?: WritableOptions) {
    super();

    const highWaterMark = options?.highWaterMark ?? 16 * 1024;
    const objectMode = options?.objectMode ?? false;

    this._writableState = {
      buffer: [],
      length: 0,
      writing: false,
      ended: false,
      finished: false,
      highWaterMark,
      objectMode,
      destroyed: false,
      corked: 0,
      finalCalled: false,
    };

    this.writableHighWaterMark = highWaterMark;
    this.writableObjectMode = objectMode;

    if (options?.write) {
      this._write = options.write;
    }

    if (options?.writev) {
      this._writev = options.writev;
    }

    if (options?.final) {
      this._final = options.final;
    }

    if (options?.destroy) {
      this._destroy = options.destroy;
    }
  }

  /**
   * Override this method to implement custom write logic
   */
  _write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    callback();
  }

  /**
   * Override for batched writes
   */
  _writev?(
    chunks: Array<{ chunk: unknown; encoding: BufferEncoding }>,
    callback: (error?: Error | null) => void,
  ): void;

  /**
   * Override for final cleanup
   */
  _final(callback: (error?: Error | null) => void): void {
    callback();
  }

  /**
   * Override for destroy cleanup
   */
  _destroy(error: Error | null, callback: (error?: Error | null) => void): void {
    callback(error);
  }

  /**
   * Write data to the stream
   */
  write(chunk: unknown, encoding?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void): boolean {
    const state = this._writableState;

    if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }

    if (state.destroyed) {
      const err = new Error('Stream destroyed');

      if (callback) callback(err);
      this.emit('error', err);

      return false;
    }

    if (state.ended) {
      const err = new Error('Write after end');

      if (callback) callback(err);
      this.emit('error', err);

      return false;
    }

    const enc = (encoding ?? 'utf8') as BufferEncoding;

    // Convert to buffer if not in object mode
    if (!state.objectMode && typeof chunk === 'string') {
      chunk = Buffer.from(chunk, enc);
    }

    const len = state.objectMode ? 1 : (chunk as Buffer).length;

    state.buffer.push({ chunk, encoding: enc, callback: callback ?? (() => {}) });
    state.length += len;
    this.writableLength = state.length;

    // Process if not corked
    if (state.corked === 0) {
      this._processBuffer();
    }

    return state.length < state.highWaterMark;
  }

  /**
   * End the stream
   */
  end(chunk?: unknown, encoding?: BufferEncoding | (() => void), callback?: () => void): this {
    const state = this._writableState;

    if (typeof chunk === 'function') {
      callback = chunk as () => void;
      chunk = undefined;
    } else if (typeof encoding === 'function') {
      callback = encoding;
      encoding = undefined;
    }

    if (chunk !== undefined) {
      this.write(chunk, encoding as BufferEncoding);
    }

    state.ended = true;

    // Process remaining buffer
    this._processBuffer();

    // Call final
    if (!state.finalCalled) {
      state.finalCalled = true;
      this._final((err) => {
        if (err) {
          this.emit('error', err);
        } else {
          state.finished = true;
          this.writableFinished = true;
          this.emit('finish');

          if (callback) callback();
        }
      });
    }

    return this;
  }

  /**
   * Cork the stream (buffer writes)
   */
  cork(): void {
    this._writableState.corked++;
  }

  /**
   * Uncork the stream (flush buffered writes)
   */
  uncork(): void {
    const state = this._writableState;

    if (state.corked > 0) {
      state.corked--;

      if (state.corked === 0) {
        this._processBuffer();
      }
    }
  }

  /**
   * Set default encoding
   */
  setDefaultEncoding(encoding: BufferEncoding): this {
    // Store for future writes
    return this;
  }

  /**
   * Destroy the stream
   */
  destroy(error?: Error): this {
    const state = this._writableState;

    if (state.destroyed) return this;

    state.destroyed = true;

    this._destroy(error ?? null, (err) => {
      if (err) {
        this.emit('error', err);
      }

      this.emit('close');
    });

    return this;
  }

  /**
   * Check if stream is destroyed
   */
  get destroyed(): boolean {
    return this._writableState.destroyed;
  }

  protected _processBuffer(): void {
    const state = this._writableState;

    if (state.writing || state.destroyed) return;

    if (state.buffer.length === 0) {
      if (state.ended && !state.finished) {
        this.emit('drain');
      }

      return;
    }

    state.writing = true;

    // Use writev if available and multiple chunks
    if (this._writev && state.buffer.length > 1) {
      const chunks = state.buffer.splice(0);
      state.length = 0;
      this.writableLength = 0;

      this._writev(chunks, (err) => {
        state.writing = false;
        chunks.forEach((c) => c.callback(err));

        if (err) {
          this.emit('error', err);
        } else {
          this._processBuffer();
        }
      });
    } else {
      const { chunk, encoding, callback } = state.buffer.shift()!;
      const len = state.objectMode ? 1 : (chunk as Buffer).length;
      state.length -= len;
      this.writableLength = state.length;

      this._write(chunk, encoding, (err) => {
        state.writing = false;
        callback(err);

        if (err) {
          this.emit('error', err);
        } else {
          this._processBuffer();
        }
      });
    }
  }
}

/**
 * Duplex stream (both readable and writable)
 */
export class Duplex extends Readable {
  readonly writable: boolean = true;
  writableHighWaterMark: number;
  writableLength: number = 0;
  writableFinished: boolean = false;
  writableObjectMode: boolean;

  protected _writableState: WritableState;

  constructor(options?: DuplexOptions) {
    super(options);

    const highWaterMark = options?.highWaterMark ?? 16 * 1024;
    const objectMode = options?.objectMode ?? false;

    this._writableState = {
      buffer: [],
      length: 0,
      writing: false,
      ended: false,
      finished: false,
      highWaterMark,
      objectMode,
      destroyed: false,
      corked: 0,
      finalCalled: false,
    };

    this.writableHighWaterMark = highWaterMark;
    this.writableObjectMode = objectMode;

    if (options?.write) {
      this._write = options.write;
    }

    if (options?.final) {
      this._final = options.final;
    }
  }

  _write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    callback();
  }

  _final(callback: (error?: Error | null) => void): void {
    callback();
  }

  write(chunk: unknown, encoding?: BufferEncoding | ((error?: Error | null) => void), callback?: (error?: Error | null) => void): boolean {
    return Writable.prototype.write.call(this, chunk, encoding as BufferEncoding, callback);
  }

  end(chunk?: unknown, encoding?: BufferEncoding | (() => void), callback?: () => void): this {
    Writable.prototype.end.call(this, chunk, encoding as BufferEncoding, callback);
    return this;
  }

  cork(): void {
    this._writableState.corked++;
  }

  uncork(): void {
    Writable.prototype.uncork.call(this);
  }
}

/**
 * Transform stream (transform data as it passes through)
 */
export class Transform extends Duplex {
  constructor(options?: TransformOptions) {
    super(options);

    if (options?.transform) {
      this._transform = options.transform;
    }

    if (options?.flush) {
      this._flush = options.flush;
    }
  }

  /**
   * Override to implement transform logic
   */
  _transform(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null, data?: unknown) => void): void {
    callback(null, chunk);
  }

  /**
   * Override for final flush
   */
  _flush(callback: (error?: Error | null, data?: unknown) => void): void {
    callback();
  }

  _write(chunk: unknown, encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this._transform(chunk, encoding, (err, data) => {
      if (err) {
        callback(err);
        return;
      }

      if (data !== undefined) {
        this.push(data);
      }

      callback();
    });
  }

  _final(callback: (error?: Error | null) => void): void {
    this._flush((err, data) => {
      if (err) {
        callback(err);
        return;
      }

      if (data !== undefined) {
        this.push(data);
      }

      this.push(null);
      callback();
    });
  }
}

/**
 * PassThrough stream (data passes through unchanged)
 */
export class PassThrough extends Transform {
  constructor(options?: TransformOptions) {
    super(options);
  }

  _transform(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null, data?: unknown) => void): void {
    callback(null, chunk);
  }
}

/**
 * Finished helper - calls callback when stream is finished
 */
export function finished(
  stream: Readable | Writable,
  callback: (error?: Error | null) => void,
): () => void;
export function finished(
  stream: Readable | Writable,
  options: { error?: boolean; readable?: boolean; writable?: boolean },
  callback: (error?: Error | null) => void,
): () => void;
export function finished(
  stream: Readable | Writable,
  optionsOrCallback: { error?: boolean; readable?: boolean; writable?: boolean } | ((error?: Error | null) => void),
  maybeCallback?: (error?: Error | null) => void,
): () => void {
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!;

  let called = false;

  const done = (err?: Error | null) => {
    if (!called) {
      called = true;
      callback(err);
    }
  };

  const onError = (...args: unknown[]) => done(args[0] as Error);
  const onEnd = () => done();
  const onFinish = () => done();
  const onClose = () => done();

  stream.on('error', onError);

  if ('readable' in stream && stream.readable) {
    stream.on('end', onEnd);
  }

  if ('writable' in stream && stream.writable) {
    stream.on('finish', onFinish);
  }

  stream.on('close', onClose);

  // Return cleanup function
  return () => {
    stream.off('error', onError);
    stream.off('end', onEnd);
    stream.off('finish', onFinish);
    stream.off('close', onClose);
  };
}

/**
 * Pipeline helper - pipe streams together with error handling
 */
export function pipeline<T extends Writable>(
  ...streams: [...(Readable | Transform)[], T]
): T;
export function pipeline<T extends Writable>(
  ...streamsWithCallback: [...(Readable | Transform)[], T, (error?: Error | null) => void]
): T;
export function pipeline(...args: unknown[]): Writable {
  const callback = typeof args[args.length - 1] === 'function' ? (args.pop() as (error?: Error | null) => void) : undefined;

  const streams = args as (Readable | Writable | Transform)[];

  if (streams.length < 2) {
    throw new Error('Pipeline requires at least 2 streams');
  }

  let error: Error | null = null;

  const destroyAll = (...args: unknown[]) => {
    const err = args[0] as Error;
    error = err;

    for (const stream of streams) {
      stream.destroy(err);
    }
  };

  // Pipe all streams together
  for (let i = 0; i < streams.length - 1; i++) {
    const source = streams[i] as Readable;
    const dest = streams[i + 1] as Writable;

    source.pipe(dest);

    source.on('error', destroyAll);
  }

  // Handle last stream
  const lastStream = streams[streams.length - 1] as Writable;

  lastStream.on('error', destroyAll);

  if (callback) {
    finished(lastStream, (err) => {
      callback(error ?? err);
    });
  }

  return lastStream;
}

/**
 * Promises API
 */
export const promises = {
  finished: (stream: Readable | Writable): Promise<void> => {
    return new Promise((resolve, reject) => {
      finished(stream, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  },

  pipeline: (...streams: (Readable | Writable | Transform)[]): Promise<void> => {
    return new Promise((resolve, reject) => {
      const callback = (err?: Error | null) => {
        if (err) reject(err);
        else resolve();
      };
      // Cast to bypass strict overload checking - runtime behavior is correct
      (pipeline as (...args: unknown[]) => Writable)(...streams, callback);
    });
  },
};

/**
 * Default export
 */
export default {
  Readable,
  Writable,
  Duplex,
  Transform,
  PassThrough,
  finished,
  pipeline,
  promises,
};
