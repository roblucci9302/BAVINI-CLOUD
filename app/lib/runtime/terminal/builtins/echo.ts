/**
 * echo - Print text
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';

export const echoCommand: BuiltinCommand = {
  name: 'echo',
  description: 'Display a line of text',
  usage: 'echo [-n] [string...]',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    let noNewline = false;
    let startIndex = 0;

    // Check for -n flag
    if (args.length > 0 && args[0] === '-n') {
      noNewline = true;
      startIndex = 1;
    }

    const output = args.slice(startIndex).join(' ');
    context.stdout(output);

    if (!noNewline) {
      context.stdout('\n');
    }

    return { exitCode: 0 };
  },
};
