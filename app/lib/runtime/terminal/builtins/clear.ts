/**
 * clear - Clear the terminal screen
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';
import { ANSI } from '../types';

export const clearCommand: BuiltinCommand = {
  name: 'clear',
  description: 'Clear the terminal screen',
  usage: 'clear',

  async execute(_args: string[], context: CommandContext): Promise<CommandResult> {
    // Clear screen and move cursor to home
    context.stdout(ANSI.ERASE_SCREEN + ANSI.CURSOR_POSITION(1, 1));
    return { exitCode: 0 };
  },
};
