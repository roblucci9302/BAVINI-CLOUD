/**
 * cd - Change directory
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';
import { normalizePath } from '../../filesystem';

export const cdCommand: BuiltinCommand = {
  name: 'cd',
  description: 'Change the current directory',
  usage: 'cd [directory]',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    let targetPath: string;

    if (args.length === 0 || args[0] === '~') {
      // cd with no args goes to HOME
      targetPath = context.state.env.HOME ?? '/home';
    } else if (args[0] === '-') {
      // cd - goes to previous directory
      targetPath = context.state.env.OLDPWD ?? context.state.cwd;
    } else {
      targetPath = args[0];
    }

    // Resolve relative paths
    const resolvedPath = normalizePath(targetPath, context.state.cwd);

    // Check if directory exists
    const exists = await context.fs.exists(resolvedPath);
    if (!exists) {
      context.stderr(`cd: ${args[0]}: No such file or directory\n`);
      return { exitCode: 1 };
    }

    // Check if it's a directory
    const stat = await context.fs.stat(resolvedPath);
    if (!stat.isDirectory) {
      context.stderr(`cd: ${args[0]}: Not a directory\n`);
      return { exitCode: 1 };
    }

    return {
      exitCode: 0,
      stateUpdates: { cwd: resolvedPath },
    };
  },
};
