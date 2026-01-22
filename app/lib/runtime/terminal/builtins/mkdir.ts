/**
 * mkdir - Make directories
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';
import { normalizePath } from '../../filesystem';

export const mkdirCommand: BuiltinCommand = {
  name: 'mkdir',
  description: 'Create directories',
  usage: 'mkdir [-p] <directory...>',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    // Parse flags
    let recursive = false;
    const paths: string[] = [];

    for (const arg of args) {
      if (arg === '-p') {
        recursive = true;
      } else if (!arg.startsWith('-')) {
        paths.push(arg);
      }
    }

    if (paths.length === 0) {
      context.stderr('mkdir: missing operand\n');
      return { exitCode: 1 };
    }

    let exitCode = 0;

    for (const path of paths) {
      const resolvedPath = normalizePath(path, context.state.cwd);

      try {
        await context.fs.mkdir(resolvedPath, { recursive });
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('EEXIST')) {
          context.stderr(`mkdir: ${path}: File exists\n`);
        } else if (msg.includes('ENOENT')) {
          context.stderr(`mkdir: ${path}: No such file or directory\n`);
        } else {
          context.stderr(`mkdir: ${path}: ${msg}\n`);
        }
        exitCode = 1;
      }
    }

    return { exitCode };
  },
};
