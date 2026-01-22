/**
 * cat - Display file contents
 * FIX 1.4: Added path traversal security validation
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';
import { normalizePath, validatePath, SecurityError } from '../../filesystem';

export const catCommand: BuiltinCommand = {
  name: 'cat',
  description: 'Display file contents',
  usage: 'cat <file...>',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    if (args.length === 0) {
      context.stderr('cat: missing file operand\n');
      return { exitCode: 1 };
    }

    let exitCode = 0;

    for (const file of args) {
      try {
        // FIX 1.4: Validate path before any operation to prevent traversal attacks
        const resolvedPath = validatePath(
          file.startsWith('/') ? file : `${context.state.cwd}/${file}`,
          '/'
        );

        const stat = await context.fs.stat(resolvedPath);

        if (stat.isDirectory) {
          context.stderr(`cat: ${file}: Is a directory\n`);
          exitCode = 1;
          continue;
        }

        const content = await context.fs.readTextFile(resolvedPath);
        context.stdout(content);

        // Ensure newline at end
        if (!content.endsWith('\n')) {
          context.stdout('\n');
        }
      } catch (error) {
        // FIX 1.4: Handle security errors specifically
        if (error instanceof SecurityError) {
          context.stderr(`cat: ${file}: Permission denied\n`);
          exitCode = 1;
          continue;
        }

        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('ENOENT')) {
          context.stderr(`cat: ${file}: No such file or directory\n`);
        } else {
          context.stderr(`cat: ${file}: ${msg}\n`);
        }
        exitCode = 1;
      }
    }

    return { exitCode };
  },
};
