/**
 * mv - Move/rename files
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';
import { normalizePath, basename } from '../../filesystem';

export const mvCommand: BuiltinCommand = {
  name: 'mv',
  description: 'Move or rename files',
  usage: 'mv <source> <dest>',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    // Filter out flags (we don't support any for basic mv)
    const paths = args.filter((arg) => !arg.startsWith('-'));

    if (paths.length < 2) {
      context.stderr('mv: missing destination file operand\n');
      return { exitCode: 1 };
    }

    const dest = paths.pop()!;
    const sources = paths;
    const destPath = normalizePath(dest, context.state.cwd);

    // Check if dest exists and is a directory
    let destIsDir = false;
    try {
      const destStat = await context.fs.stat(destPath);
      destIsDir = destStat.isDirectory;
    } catch {
      // Dest doesn't exist
    }

    // If multiple sources, dest must be a directory
    if (sources.length > 1 && !destIsDir) {
      context.stderr(`mv: target '${dest}' is not a directory\n`);
      return { exitCode: 1 };
    }

    let exitCode = 0;

    for (const source of sources) {
      const sourcePath = normalizePath(source, context.state.cwd);

      try {
        // Check source exists
        await context.fs.stat(sourcePath);

        let targetPath: string;
        if (destIsDir) {
          targetPath = `${destPath}/${basename(sourcePath)}`;
        } else {
          targetPath = destPath;
        }

        await context.fs.rename(sourcePath, targetPath);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('ENOENT')) {
          context.stderr(`mv: ${source}: No such file or directory\n`);
        } else {
          context.stderr(`mv: ${source}: ${msg}\n`);
        }
        exitCode = 1;
      }
    }

    return { exitCode };
  },
};
