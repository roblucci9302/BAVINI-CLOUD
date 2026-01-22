/**
 * cp - Copy files
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';
import { normalizePath, basename } from '../../filesystem';

export const cpCommand: BuiltinCommand = {
  name: 'cp',
  description: 'Copy files and directories',
  usage: 'cp [-r] <source> <dest>',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    // Parse flags
    let recursive = false;
    const paths: string[] = [];

    for (const arg of args) {
      if (arg === '-r' || arg === '-R') {
        recursive = true;
      } else if (!arg.startsWith('-')) {
        paths.push(arg);
      }
    }

    if (paths.length < 2) {
      context.stderr('cp: missing destination file operand\n');
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
      context.stderr(`cp: target '${dest}' is not a directory\n`);
      return { exitCode: 1 };
    }

    let exitCode = 0;

    for (const source of sources) {
      const sourcePath = normalizePath(source, context.state.cwd);

      try {
        const sourceStat = await context.fs.stat(sourcePath);

        let targetPath: string;
        if (destIsDir) {
          targetPath = `${destPath}/${basename(sourcePath)}`;
        } else {
          targetPath = destPath;
        }

        if (sourceStat.isDirectory) {
          if (!recursive) {
            context.stderr(`cp: -r not specified; omitting directory '${source}'\n`);
            exitCode = 1;
            continue;
          }
          await copyDirectory(context.fs, sourcePath, targetPath);
        } else {
          await context.fs.copyFile(sourcePath, targetPath);
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('ENOENT')) {
          context.stderr(`cp: ${source}: No such file or directory\n`);
        } else {
          context.stderr(`cp: ${source}: ${msg}\n`);
        }
        exitCode = 1;
      }
    }

    return { exitCode };
  },
};

async function copyDirectory(
  fs: { readdir: (path: string) => Promise<string[]>; stat: (path: string) => Promise<{ isDirectory: boolean }>; copyFile: (src: string, dest: string) => Promise<void>; mkdir: (path: string, opts?: { recursive?: boolean }) => Promise<void> },
  src: string,
  dest: string,
): Promise<void> {
  await fs.mkdir(dest, { recursive: true });

  const entries = await fs.readdir(src);

  for (const entry of entries) {
    const srcPath = `${src}/${entry}`;
    const destPath = `${dest}/${entry}`;
    const stat = await fs.stat(srcPath);

    if (stat.isDirectory) {
      await copyDirectory(fs, srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}
