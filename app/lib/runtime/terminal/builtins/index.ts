/**
 * =============================================================================
 * BAVINI Container - Builtin Commands Registry
 * =============================================================================
 * Registry of all builtin shell commands.
 * =============================================================================
 */

import type { BuiltinCommand, CommandRegistry } from '../types';
import { cdCommand } from './cd';
import { lsCommand } from './ls';
import { catCommand } from './cat';
import { pwdCommand } from './pwd';
import { echoCommand } from './echo';
import { mkdirCommand } from './mkdir';
import { rmCommand } from './rm';
import { cpCommand } from './cp';
import { mvCommand } from './mv';
import { touchCommand } from './touch';
import { clearCommand } from './clear';
import { envCommand } from './env';
import { exportCommand } from './export';
import { helpCommand } from './help';
import { npmCommand } from './npm';
import { npxCommand } from './npx';

/**
 * All builtin commands
 */
const builtinCommands: BuiltinCommand[] = [
  cdCommand,
  lsCommand,
  catCommand,
  pwdCommand,
  echoCommand,
  mkdirCommand,
  rmCommand,
  cpCommand,
  mvCommand,
  touchCommand,
  clearCommand,
  envCommand,
  exportCommand,
  helpCommand,
  npmCommand,
  npxCommand,
];

/**
 * Command registry implementation
 */
class BuiltinCommandRegistry implements CommandRegistry {
  private _commands: Map<string, BuiltinCommand> = new Map();

  constructor() {
    for (const cmd of builtinCommands) {
      this._commands.set(cmd.name, cmd);
    }
  }

  get(name: string): BuiltinCommand | undefined {
    return this._commands.get(name);
  }

  has(name: string): boolean {
    return this._commands.has(name);
  }

  list(): string[] {
    return Array.from(this._commands.keys()).sort();
  }

  register(command: BuiltinCommand): void {
    this._commands.set(command.name, command);
  }
}

/**
 * Singleton registry instance
 */
let _registry: BuiltinCommandRegistry | null = null;

/**
 * Get the builtin command registry
 */
export function getCommandRegistry(): CommandRegistry {
  if (!_registry) {
    _registry = new BuiltinCommandRegistry();
  }
  return _registry;
}

// Export individual commands for testing
export {
  cdCommand,
  lsCommand,
  catCommand,
  pwdCommand,
  echoCommand,
  mkdirCommand,
  rmCommand,
  cpCommand,
  mvCommand,
  touchCommand,
  clearCommand,
  envCommand,
  exportCommand,
  helpCommand,
  npmCommand,
  npxCommand,
};
