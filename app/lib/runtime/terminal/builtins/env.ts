/**
 * env - Display environment variables
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';

export const envCommand: BuiltinCommand = {
  name: 'env',
  description: 'Display environment variables',
  usage: 'env',

  async execute(_args: string[], context: CommandContext): Promise<CommandResult> {
    const env = context.state.env;

    for (const [key, value] of Object.entries(env)) {
      if (value !== undefined) {
        context.stdout(`${key}=${value}\n`);
      }
    }

    return { exitCode: 0 };
  },
};
