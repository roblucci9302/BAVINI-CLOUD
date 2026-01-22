/**
 * touch - Create empty files
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';
import { normalizePath, TextUtils } from '../../filesystem';

export const touchCommand: BuiltinCommand = {
  name: 'touch',
  description: 'Create empty files or update timestamps',
  usage: 'touch <file...>',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    // Filter out flags (we don't support any for basic touch)
    const paths = args.filter((arg) => !arg.startsWith('-'));

    if (paths.length === 0) {
      context.stderr('touch: missing file operand\n');
      return { exitCode: 1 };
    }

    let exitCode = 0;

    for (const path of paths) {
      const resolvedPath = normalizePath(path, context.state.cwd);

      try {
        const exists = await context.fs.exists(resolvedPath);

        if (exists) {
          // File exists, read and rewrite to update timestamp
          const data = await context.fs.readFile(resolvedPath);
          await context.fs.writeFile(resolvedPath, data);
        } else {
          // Create empty file
          await context.fs.writeFile(resolvedPath, TextUtils.encode(''), { createParents: false });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('ENOENT')) {
          context.stderr(`touch: ${path}: No such file or directory\n`);
        } else {
          context.stderr(`touch: ${path}: ${msg}\n`);
        }
        exitCode = 1;
      }
    }

    return { exitCode };
  },
};
