/**
 * pwd - Print working directory
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';

export const pwdCommand: BuiltinCommand = {
  name: 'pwd',
  description: 'Print the current working directory',
  usage: 'pwd',

  async execute(_args: string[], context: CommandContext): Promise<CommandResult> {
    context.stdout(context.state.cwd + '\n');
    return { exitCode: 0 };
  },
};
