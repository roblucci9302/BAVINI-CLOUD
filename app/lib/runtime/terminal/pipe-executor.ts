/**
 * =============================================================================
 * BAVINI Container - Pipe Executor
 * =============================================================================
 * FIX 3.2: Executes commands in a pipeline with proper I/O handling.
 * Supports pipes (|), output redirection (>, >>), and input redirection (<).
 * =============================================================================
 */

import type { CommandContext, CommandResult, ParsedCommand } from './types';
import type { ParsedPipeline, PipelineCommand } from './pipe-parser';
import { CommandExecutor } from './command-executor';
import type { MountManager } from '../filesystem';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PipeExecutor');

/**
 * Result of a pipeline execution
 */
export interface PipelineResult {
  /** Exit code of the last command */
  exitCode: number;
  /** Combined stdout output */
  stdout: string;
  /** Combined stderr output */
  stderr: string;
  /** State updates from all commands */
  stateUpdates?: Record<string, unknown>;
}

/**
 * Pipeline executor for handling pipes and redirections
 */
export class PipeExecutor {
  private _commandExecutor: CommandExecutor;

  constructor() {
    this._commandExecutor = new CommandExecutor();
  }

  /**
   * Execute a parsed pipeline
   */
  async execute(
    pipeline: ParsedPipeline,
    context: CommandContext
  ): Promise<PipelineResult> {
    const result: PipelineResult = {
      exitCode: 0,
      stdout: '',
      stderr: '',
    };

    if (pipeline.commands.length === 0) {
      return result;
    }

    // Handle input redirection
    let input = '';
    if (pipeline.inputRedirect) {
      try {
        const content = await context.fs.readTextFile(pipeline.inputRedirect.file);
        input = content;
        logger.debug(`Read input from ${pipeline.inputRedirect.file}: ${content.length} chars`);
      } catch (error) {
        const errorMsg = `Cannot read ${pipeline.inputRedirect.file}: ${error instanceof Error ? error.message : error}\n`;
        context.stderr(errorMsg);
        result.stderr = errorMsg;
        result.exitCode = 1;
        return result;
      }
    }

    // Execute pipeline
    let currentInput = input;
    let lastExitCode = 0;
    const stateUpdates: Record<string, unknown> = {};

    for (let i = 0; i < pipeline.commands.length; i++) {
      const cmd = pipeline.commands[i];
      const isLastCommand = i === pipeline.commands.length - 1;

      // Capture stdout for piping
      let cmdStdout = '';
      let cmdStderr = '';

      // Create modified context for this command
      const cmdContext: CommandContext = {
        ...context,
        stdout: (data: string) => {
          cmdStdout += data;
          // Only output to terminal if last command and no output redirect
          if (isLastCommand && !pipeline.outputRedirect) {
            context.stdout(data);
          }
        },
        stderr: (data: string) => {
          cmdStderr += data;
          // Always output stderr to terminal
          context.stderr(data);
        },
        // Provide current input (from previous command or input redirect)
        stdin: currentInput || undefined,
      };

      // Convert PipelineCommand to ParsedCommand
      const parsedCmd: ParsedCommand = {
        command: cmd.command,
        args: cmd.args,
        raw: cmd.raw,
      };

      try {
        const cmdResult = await this._commandExecutor.execute(parsedCmd, cmdContext);
        lastExitCode = cmdResult.exitCode;

        // Merge state updates
        if (cmdResult.stateUpdates) {
          Object.assign(stateUpdates, cmdResult.stateUpdates);
        }

        // Use stdout as input for next command
        currentInput = cmdStdout;

        // If command failed and not in pipeline, stop
        if (lastExitCode !== 0 && pipeline.commands.length === 1) {
          break;
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        cmdStderr += `${cmd.command}: ${errorMsg}\n`;
        context.stderr(`${cmd.command}: ${errorMsg}\n`);
        lastExitCode = 1;
        break;
      }

      result.stdout += cmdStdout;
      result.stderr += cmdStderr;
    }

    // Handle output redirection
    if (pipeline.outputRedirect && currentInput) {
      try {
        const filePath = pipeline.outputRedirect.file;

        if (pipeline.outputRedirect.type === '>>') {
          // Append mode
          let existingContent = '';
          try {
            existingContent = await context.fs.readTextFile(filePath);
          } catch {
            // File doesn't exist, that's fine
          }
          await context.fs.writeTextFile(filePath, existingContent + currentInput);
          logger.debug(`Appended ${currentInput.length} chars to ${filePath}`);
        } else {
          // Overwrite mode
          await context.fs.writeTextFile(filePath, currentInput);
          logger.debug(`Wrote ${currentInput.length} chars to ${filePath}`);
        }
      } catch (error) {
        const errorMsg = `Cannot write to ${pipeline.outputRedirect.file}: ${error instanceof Error ? error.message : error}\n`;
        context.stderr(errorMsg);
        result.stderr += errorMsg;
        lastExitCode = 1;
      }
    }

    result.exitCode = lastExitCode;
    if (Object.keys(stateUpdates).length > 0) {
      result.stateUpdates = stateUpdates;
    }

    return result;
  }

  /**
   * Check if executor has a command
   */
  hasCommand(name: string): boolean {
    return this._commandExecutor.hasCommand(name);
  }

  /**
   * List available commands
   */
  listCommands(): string[] {
    return this._commandExecutor.listCommands();
  }
}

/**
 * Create a new pipe executor
 */
export function createPipeExecutor(): PipeExecutor {
  return new PipeExecutor();
}
