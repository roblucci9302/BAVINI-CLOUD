/**
 * rm - Remove files and directories
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';
import { normalizePath } from '../../filesystem';

export const rmCommand: BuiltinCommand = {
  name: 'rm',
  description: 'Remove files and directories',
  usage: 'rm [-rf] <file...>',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    // Parse flags
    let recursive = false;
    let force = false;
    const paths: string[] = [];

    for (const arg of args) {
      if (arg.startsWith('-')) {
        if (arg.includes('r') || arg.includes('R')) recursive = true;
        if (arg.includes('f')) force = true;
      } else {
        paths.push(arg);
      }
    }

    if (paths.length === 0) {
      context.stderr('rm: missing operand\n');
      return { exitCode: 1 };
    }

    let exitCode = 0;

    for (const path of paths) {
      const resolvedPath = normalizePath(path, context.state.cwd);

      try {
        const exists = await context.fs.exists(resolvedPath);

        if (!exists) {
          if (!force) {
            context.stderr(`rm: ${path}: No such file or directory\n`);
            exitCode = 1;
          }
          continue;
        }

        const stat = await context.fs.stat(resolvedPath);

        if (stat.isDirectory) {
          if (!recursive) {
            context.stderr(`rm: ${path}: is a directory\n`);
            exitCode = 1;
            continue;
          }
          await context.fs.rmdir(resolvedPath, { recursive: true });
        } else {
          await context.fs.unlink(resolvedPath);
        }
      } catch (error) {
        if (!force) {
          const msg = error instanceof Error ? error.message : String(error);
          context.stderr(`rm: ${path}: ${msg}\n`);
          exitCode = 1;
        }
      }
    }

    return { exitCode };
  },
};
