/**
 * =============================================================================
 * BAVINI Container - Command Executor
 * =============================================================================
 * Dispatches and executes shell commands.
 * =============================================================================
 */

import type { ParsedCommand, CommandContext, CommandResult } from './types';
import { TermFormat } from './types';
import { getCommandRegistry } from './builtins';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CommandExecutor');

/**
 * Command executor
 */
export class CommandExecutor {
  private _registry = getCommandRegistry();

  /**
   * Execute a parsed command
   */
  async execute(command: ParsedCommand, context: CommandContext): Promise<CommandResult> {
    const startTime = performance.now();

    try {
      // Check for empty command
      if (!command.command) {
        return { exitCode: 0 };
      }

      // Look up builtin command
      const builtin = this._registry.get(command.command);

      if (builtin) {
        const result = await builtin.execute(command.args, context);
        const elapsed = performance.now() - startTime;
        logger.debug(`Command '${command.command}' completed in ${elapsed.toFixed(1)}ms`);
        return result;
      }

      // Command not found
      context.stderr(`${command.command}: command not found\n`);
      context.stdout(TermFormat.gray(`Type 'help' for available commands.\n`));

      return { exitCode: 127 };
    } catch (error) {
      const elapsed = performance.now() - startTime;
      logger.error(`Command '${command.command}' failed after ${elapsed.toFixed(1)}ms:`, error);

      // Check if aborted
      if (error instanceof Error && error.name === 'AbortError') {
        return { exitCode: 130 }; // Ctrl+C exit code
      }

      // Unexpected error
      const message = error instanceof Error ? error.message : String(error);
      context.stderr(`${command.command}: ${message}\n`);

      return { exitCode: 1 };
    }
  }

  /**
   * Check if a command exists
   */
  hasCommand(name: string): boolean {
    return this._registry.has(name);
  }

  /**
   * Get list of available commands
   */
  listCommands(): string[] {
    return this._registry.list();
  }
}
