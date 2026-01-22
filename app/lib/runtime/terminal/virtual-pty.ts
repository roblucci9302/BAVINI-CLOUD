/**
 * =============================================================================
 * BAVINI Container - Virtual PTY
 * =============================================================================
 * Handles terminal input/output, line editing, and command dispatch.
 * =============================================================================
 */

import type {
  VirtualPTY,
  PTYDimensions,
  PTYCallbacks,
  ShellState,
  CommandContext,
  ParsedCommand,
} from './types';
import { ANSI, KeyCodes, TermFormat } from './types';
import {
  createShellState,
  updateCwd,
  addToHistory,
  applyStateUpdates,
  expandEnvVars,
  getPromptString,
} from './shell-state';
import { CommandExecutor } from './command-executor';
// FIX 3.2: Import pipe parser and executor
import { parsePipeline, hasPipeOperators } from './pipe-parser';
import { PipeExecutor } from './pipe-executor';
import type { MountManager } from '../filesystem';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('VirtualPTY');

/**
 * Configuration for VirtualPTY
 */
export interface VirtualPTYConfig {
  /** Filesystem access */
  fs: MountManager;
  /** Initial shell state */
  initialState?: Partial<ShellState>;
  /** Initial dimensions */
  dimensions?: PTYDimensions;
}

/**
 * Virtual PTY implementation
 */
export class VirtualPTYImpl implements VirtualPTY {
  private _fs: MountManager;
  private _state: ShellState;
  private _dimensions: PTYDimensions;
  private _callbacks: PTYCallbacks | null = null;
  private _executor: CommandExecutor;
  // FIX 3.2: Add pipe executor
  private _pipeExecutor: PipeExecutor;

  // Line editing state
  private _lineBuffer: string = '';
  private _cursorPosition: number = 0;
  private _historyIndex: number = -1;
  private _savedLine: string = '';
  private _abortController: AbortController | null = null;
  private _isExecuting: boolean = false;

  constructor(config: VirtualPTYConfig) {
    this._fs = config.fs;
    this._state = createShellState(config.initialState);
    this._dimensions = config.dimensions ?? { cols: 80, rows: 24 };
    this._executor = new CommandExecutor();
    // FIX 3.2: Initialize pipe executor
    this._pipeExecutor = new PipeExecutor();
  }

  async init(callbacks: PTYCallbacks): Promise<void> {
    this._callbacks = callbacks;

    // Validate and set initial cwd
    const cwdExists = await this._fs.exists(this._state.cwd);
    if (!cwdExists) {
      this._state = updateCwd(this._state, '/');
    }

    // Show welcome message
    this._output('stdout', TermFormat.cyan('BAVINI Container Terminal\n'));
    this._output('stdout', TermFormat.gray('Type "help" for available commands.\n\n'));

    // Show initial prompt
    this._showPrompt();

    logger.info('VirtualPTY initialized');
  }

  destroy(): void {
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this._callbacks = null;
    logger.info('VirtualPTY destroyed');
  }

  write(data: string): void {
    // Process input character by character
    for (let i = 0; i < data.length; i++) {
      const char = data[i];

      // Check for escape sequences
      if (char === '\x1b' && i + 2 < data.length && data[i + 1] === '[') {
        const seq = data.substring(i, i + 3);
        this._handleEscapeSequence(seq);
        i += 2; // Skip the escape sequence
        continue;
      }

      this._handleChar(char);
    }
  }

  resize(dimensions: PTYDimensions): void {
    this._dimensions = dimensions;
    logger.debug('PTY resized to', dimensions.cols, 'x', dimensions.rows);
  }

  getDimensions(): PTYDimensions {
    return { ...this._dimensions };
  }

  getState(): ShellState {
    return { ...this._state };
  }

  private _output(type: 'stdout' | 'stderr' | 'prompt', data: string): void {
    this._callbacks?.onOutput({ type, data });
  }

  private _notifyStateChange(): void {
    this._callbacks?.onStateChange?.(this._state);
  }

  private _showPrompt(): void {
    const prompt = getPromptString(this._state);
    this._output('prompt', prompt);
  }

  private _handleChar(char: string): void {
    if (this._isExecuting) {
      // Handle Ctrl+C during execution
      if (char === KeyCodes.CTRL_C) {
        this._abortController?.abort();
        this._output('stdout', '^C\n');
        return;
      }
      // Ignore other input during execution
      return;
    }

    switch (char) {
      case KeyCodes.ENTER:
        this._handleEnter();
        break;

      case KeyCodes.BACKSPACE:
        this._handleBackspace();
        break;

      case KeyCodes.CTRL_C:
        this._handleCtrlC();
        break;

      case KeyCodes.CTRL_D:
        this._handleCtrlD();
        break;

      case KeyCodes.CTRL_L:
        this._handleCtrlL();
        break;

      case KeyCodes.CTRL_U:
        this._handleCtrlU();
        break;

      case KeyCodes.CTRL_W:
        this._handleCtrlW();
        break;

      case KeyCodes.CTRL_A:
        this._moveCursorToStart();
        break;

      case KeyCodes.CTRL_E:
        this._moveCursorToEnd();
        break;

      case KeyCodes.CTRL_K:
        this._killToEnd();
        break;

      case KeyCodes.TAB:
        this._handleTab();
        break;

      default:
        // Printable character
        if (char >= ' ' && char <= '~') {
          this._insertChar(char);
        }
    }
  }

  private _handleEscapeSequence(seq: string): void {
    if (this._isExecuting) {
      return;
    }

    switch (seq) {
      case KeyCodes.ARROW_UP:
        this._historyUp();
        break;

      case KeyCodes.ARROW_DOWN:
        this._historyDown();
        break;

      case KeyCodes.ARROW_LEFT:
        this._moveCursorLeft();
        break;

      case KeyCodes.ARROW_RIGHT:
        this._moveCursorRight();
        break;

      case KeyCodes.HOME:
        this._moveCursorToStart();
        break;

      case KeyCodes.END:
        this._moveCursorToEnd();
        break;
    }
  }

  private _insertChar(char: string): void {
    // Insert at cursor position
    this._lineBuffer =
      this._lineBuffer.slice(0, this._cursorPosition) + char + this._lineBuffer.slice(this._cursorPosition);
    this._cursorPosition++;

    // Redraw from cursor
    this._redrawLine();
  }

  private _handleBackspace(): void {
    if (this._cursorPosition > 0) {
      this._lineBuffer =
        this._lineBuffer.slice(0, this._cursorPosition - 1) + this._lineBuffer.slice(this._cursorPosition);
      this._cursorPosition--;
      this._redrawLine();
    }
  }

  private _handleEnter(): void {
    this._output('stdout', '\n');

    const command = this._lineBuffer.trim();
    this._lineBuffer = '';
    this._cursorPosition = 0;
    this._historyIndex = -1;

    if (command) {
      this._executeCommand(command);
    } else {
      this._showPrompt();
    }
  }

  private _handleCtrlC(): void {
    this._output('stdout', '^C\n');
    this._lineBuffer = '';
    this._cursorPosition = 0;
    this._historyIndex = -1;
    this._showPrompt();
  }

  private _handleCtrlD(): void {
    if (this._lineBuffer.length === 0) {
      this._output('stdout', '\nexit\n');
      // Could emit exit event here
    }
  }

  private _handleCtrlL(): void {
    // Clear screen
    this._output('stdout', ANSI.ERASE_SCREEN + ANSI.CURSOR_POSITION(1, 1));
    this._showPrompt();
    this._output('stdout', this._lineBuffer);
    // Reposition cursor
    if (this._cursorPosition < this._lineBuffer.length) {
      this._output('stdout', ANSI.CURSOR_BACK(this._lineBuffer.length - this._cursorPosition));
    }
  }

  private _handleCtrlU(): void {
    // Clear line before cursor
    if (this._cursorPosition > 0) {
      this._lineBuffer = this._lineBuffer.slice(this._cursorPosition);
      this._cursorPosition = 0;
      this._redrawLine();
    }
  }

  private _handleCtrlW(): void {
    // Delete word before cursor
    if (this._cursorPosition > 0) {
      const beforeCursor = this._lineBuffer.slice(0, this._cursorPosition);
      const afterCursor = this._lineBuffer.slice(this._cursorPosition);

      // Find word boundary
      let newPos = this._cursorPosition - 1;
      while (newPos > 0 && beforeCursor[newPos - 1] === ' ') {
        newPos--;
      }
      while (newPos > 0 && beforeCursor[newPos - 1] !== ' ') {
        newPos--;
      }

      this._lineBuffer = beforeCursor.slice(0, newPos) + afterCursor;
      this._cursorPosition = newPos;
      this._redrawLine();
    }
  }

  private _killToEnd(): void {
    // Delete from cursor to end
    this._lineBuffer = this._lineBuffer.slice(0, this._cursorPosition);
    this._redrawLine();
  }

  private _handleTab(): void {
    // Basic tab completion - could be enhanced
    // For now, just insert spaces
    const spaces = '    ';
    this._lineBuffer =
      this._lineBuffer.slice(0, this._cursorPosition) + spaces + this._lineBuffer.slice(this._cursorPosition);
    this._cursorPosition += spaces.length;
    this._redrawLine();
  }

  private _moveCursorLeft(): void {
    if (this._cursorPosition > 0) {
      this._cursorPosition--;
      this._output('stdout', ANSI.CURSOR_BACK(1));
    }
  }

  private _moveCursorRight(): void {
    if (this._cursorPosition < this._lineBuffer.length) {
      this._cursorPosition++;
      this._output('stdout', ANSI.CURSOR_FORWARD(1));
    }
  }

  private _moveCursorToStart(): void {
    if (this._cursorPosition > 0) {
      this._output('stdout', ANSI.CURSOR_BACK(this._cursorPosition));
      this._cursorPosition = 0;
    }
  }

  private _moveCursorToEnd(): void {
    if (this._cursorPosition < this._lineBuffer.length) {
      this._output('stdout', ANSI.CURSOR_FORWARD(this._lineBuffer.length - this._cursorPosition));
      this._cursorPosition = this._lineBuffer.length;
    }
  }

  private _historyUp(): void {
    if (this._state.history.length === 0) {
      return;
    }

    if (this._historyIndex === -1) {
      this._savedLine = this._lineBuffer;
      this._historyIndex = this._state.history.length - 1;
    } else if (this._historyIndex > 0) {
      this._historyIndex--;
    }

    this._lineBuffer = this._state.history[this._historyIndex];
    this._cursorPosition = this._lineBuffer.length;
    this._redrawLine();
  }

  private _historyDown(): void {
    if (this._historyIndex === -1) {
      return;
    }

    if (this._historyIndex < this._state.history.length - 1) {
      this._historyIndex++;
      this._lineBuffer = this._state.history[this._historyIndex];
    } else {
      this._historyIndex = -1;
      this._lineBuffer = this._savedLine;
    }

    this._cursorPosition = this._lineBuffer.length;
    this._redrawLine();
  }

  private _redrawLine(): void {
    // Move to start of line
    this._output('stdout', '\r');
    // Erase line
    this._output('stdout', ANSI.ERASE_LINE);
    // Show prompt
    const prompt = getPromptString(this._state);
    this._output('stdout', prompt);
    // Show line buffer
    this._output('stdout', this._lineBuffer);
    // Move cursor to correct position
    const backAmount = this._lineBuffer.length - this._cursorPosition;
    if (backAmount > 0) {
      this._output('stdout', ANSI.CURSOR_BACK(backAmount));
    }
  }

  private async _executeCommand(input: string): Promise<void> {
    // Add to history
    this._state = addToHistory(this._state, input);
    this._notifyStateChange();

    // Expand environment variables
    const expandedInput = expandEnvVars(input, this._state.env);

    // FIX 3.2: Check for pipes and redirections
    if (hasPipeOperators(expandedInput)) {
      await this._executePipeline(expandedInput);
      return;
    }

    // Parse command (simple, no pipes)
    const parsed = this._parseCommand(input);

    if (!parsed) {
      this._showPrompt();
      return;
    }

    // Execute command
    this._isExecuting = true;
    this._abortController = new AbortController();

    const context: CommandContext = {
      fs: this._fs,
      state: this._state,
      stdout: (data) => this._output('stdout', data),
      stderr: (data) => this._output('stderr', TermFormat.red(data)),
      dimensions: this._dimensions,
      signal: this._abortController.signal,
    };

    try {
      const result = await this._executor.execute(parsed, context);

      // Apply state updates
      if (result.stateUpdates) {
        this._state = applyStateUpdates(this._state, result.stateUpdates);
        this._notifyStateChange();
      }

      // Update exit code
      this._state = applyStateUpdates(this._state, { lastExitCode: result.exitCode });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._output('stderr', TermFormat.red(`Error: ${errorMessage}\n`));
      this._state = applyStateUpdates(this._state, { lastExitCode: 1 });
    } finally {
      this._isExecuting = false;
      this._abortController = null;
      this._showPrompt();
    }
  }

  /**
   * FIX 3.2: Execute a pipeline with pipes and/or redirections
   */
  private async _executePipeline(input: string): Promise<void> {
    this._isExecuting = true;
    this._abortController = new AbortController();

    const context: CommandContext = {
      fs: this._fs,
      state: this._state,
      stdout: (data) => this._output('stdout', data),
      stderr: (data) => this._output('stderr', TermFormat.red(data)),
      dimensions: this._dimensions,
      signal: this._abortController.signal,
    };

    try {
      // Parse the pipeline
      const pipeline = parsePipeline(input);
      logger.debug('Executing pipeline:', pipeline);

      // Execute through pipe executor
      const result = await this._pipeExecutor.execute(pipeline, context);

      // Apply state updates
      if (result.stateUpdates) {
        this._state = applyStateUpdates(this._state, result.stateUpdates as Partial<ShellState>);
        this._notifyStateChange();
      }

      // Update exit code
      this._state = applyStateUpdates(this._state, { lastExitCode: result.exitCode });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this._output('stderr', TermFormat.red(`Pipeline error: ${errorMessage}\n`));
      this._state = applyStateUpdates(this._state, { lastExitCode: 1 });
    } finally {
      this._isExecuting = false;
      this._abortController = null;
      this._showPrompt();
    }
  }

  private _parseCommand(input: string): ParsedCommand | null {
    // Expand environment variables
    const expanded = expandEnvVars(input, this._state.env);

    // Simple parsing - split by whitespace respecting quotes
    const tokens = this._tokenize(expanded);

    if (tokens.length === 0) {
      return null;
    }

    const [command, ...args] = tokens;

    return {
      command,
      args,
      raw: input,
    };
  }

  private _tokenize(input: string): string[] {
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
}

/**
 * Create a new VirtualPTY instance
 */
export function createVirtualPTY(config: VirtualPTYConfig): VirtualPTY {
  return new VirtualPTYImpl(config);
}
