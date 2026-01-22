/**
 * ls - List directory contents
 * FIX 1.4: Added path traversal security validation
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';
import { TermFormat } from '../types';
import { normalizePath, basename, validatePath, SecurityError } from '../../filesystem';

export const lsCommand: BuiltinCommand = {
  name: 'ls',
  description: 'List directory contents',
  usage: 'ls [-la] [path...]',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    // Parse flags
    let showAll = false;
    let longFormat = false;
    const paths: string[] = [];

    for (const arg of args) {
      if (arg.startsWith('-')) {
        if (arg.includes('a')) showAll = true;
        if (arg.includes('l')) longFormat = true;
      } else {
        paths.push(arg);
      }
    }

    // Default to current directory
    if (paths.length === 0) {
      paths.push('.');
    }

    let exitCode = 0;

    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];

      try {
        // FIX 1.4: Validate path to prevent traversal attacks
        const resolvedPath = validatePath(
          path.startsWith('/') ? path : `${context.state.cwd}/${path}`,
          '/'
        );

        const stat = await context.fs.stat(resolvedPath);

        // Show directory name if multiple paths
        if (paths.length > 1) {
          if (i > 0) context.stdout('\n');
          context.stdout(`${path}:\n`);
        }

        if (!stat.isDirectory) {
          // Single file
          if (longFormat) {
            context.stdout(formatLongEntry(basename(resolvedPath), stat));
          } else {
            context.stdout(basename(resolvedPath) + '\n');
          }
          continue;
        }

        // List directory contents
        const entries = await context.fs.readdirWithTypes(resolvedPath);

        // Sort entries (directories first, then alphabetically)
        entries.sort((a, b) => {
          if (a.isDirectory !== b.isDirectory) {
            return a.isDirectory ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        // Filter hidden files unless -a
        const filteredEntries = showAll ? entries : entries.filter((e) => !e.name.startsWith('.'));

        if (longFormat) {
          // Long format output
          for (const entry of filteredEntries) {
            const entryPath = resolvedPath === '/' ? `/${entry.name}` : `${resolvedPath}/${entry.name}`;
            const entryStat = await context.fs.stat(entryPath);
            context.stdout(formatLongEntry(entry.name, entryStat, entry.isDirectory));
          }
        } else {
          // Simple format
          const output = filteredEntries
            .map((e) => {
              if (e.isDirectory) {
                return TermFormat.blue(TermFormat.bold(e.name));
              }
              return e.name;
            })
            .join('  ');

          if (output) {
            context.stdout(output + '\n');
          }
        }
      } catch (error) {
        // FIX 1.4: Handle security errors specifically
        if (error instanceof SecurityError) {
          context.stderr(`ls: ${path}: Permission denied\n`);
          exitCode = 1;
          continue;
        }

        const msg = error instanceof Error ? error.message : String(error);
        context.stderr(`ls: ${path}: ${msg}\n`);
        exitCode = 1;
      }
    }

    return { exitCode };
  },
};

function formatLongEntry(
  name: string,
  stat: { isDirectory: boolean; size: number; mtime: number; mode: number },
  isDirectory?: boolean,
): string {
  const isDir = isDirectory ?? stat.isDirectory;
  const typeChar = isDir ? 'd' : '-';
  const perms = formatPermissions(stat.mode);
  const size = stat.size.toString().padStart(8);
  const date = formatDate(stat.mtime);
  const displayName = isDir ? TermFormat.blue(TermFormat.bold(name)) : name;

  return `${typeChar}${perms}  ${size}  ${date}  ${displayName}\n`;
}

function formatPermissions(mode: number): string {
  const r = (mode & 0o400) ? 'r' : '-';
  const w = (mode & 0o200) ? 'w' : '-';
  const x = (mode & 0o100) ? 'x' : '-';
  const rg = (mode & 0o040) ? 'r' : '-';
  const wg = (mode & 0o020) ? 'w' : '-';
  const xg = (mode & 0o010) ? 'x' : '-';
  const ro = (mode & 0o004) ? 'r' : '-';
  const wo = (mode & 0o002) ? 'w' : '-';
  const xo = (mode & 0o001) ? 'x' : '-';

  return `${r}${w}${x}${rg}${wg}${xg}${ro}${wo}${xo}`;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getMonth()];
  const day = date.getDate().toString().padStart(2);
  const hours = date.getHours().toString().padStart(2, '0');
  const mins = date.getMinutes().toString().padStart(2, '0');

  return `${month} ${day} ${hours}:${mins}`;
}
