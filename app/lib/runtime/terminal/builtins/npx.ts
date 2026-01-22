/**
 * =============================================================================
 * BAVINI Container - npx Command
 * =============================================================================
 * npx builtin command for running package binaries.
 * =============================================================================
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';
import { BaviniPM } from '../../package-manager';
import { ANSI } from '../types';

/**
 * npx command - execute package binaries
 */
export const npxCommand: BuiltinCommand = {
  name: 'npx',
  description: 'Execute package binaries',
  usage: 'npx <command> [args...]',

  async execute(args: string[], ctx: CommandContext): Promise<CommandResult> {
    if (args.length === 0) {
      ctx.stdout(`${ANSI.BOLD}npx - Execute package binaries${ANSI.RESET}\n\n`);
      ctx.stdout('Usage: npx <command> [args...]\n\n');
      ctx.stdout('Options:\n');
      ctx.stdout('  -p, --package  Specify package to install\n');
      ctx.stdout('  -y, --yes      Skip confirmation\n');
      ctx.stdout('\n');
      ctx.stdout('Examples:\n');
      ctx.stdout('  npx create-react-app my-app\n');
      ctx.stdout('  npx -p typescript tsc --init\n');
      return { exitCode: 0 };
    }

    // Parse options
    let packageName: string | null = null;
    let skipConfirm = false;
    const commandArgs: string[] = [];
    let i = 0;

    while (i < args.length) {
      const arg = args[i];

      if (arg === '-p' || arg === '--package') {
        packageName = args[++i];
      } else if (arg === '-y' || arg === '--yes') {
        skipConfirm = true;
      } else if (!arg.startsWith('-')) {
        // Rest are command and its args
        commandArgs.push(...args.slice(i));
        break;
      }

      i++;
    }

    if (commandArgs.length === 0) {
      ctx.stdout(`${ANSI.RED}Error: Please specify a command to run${ANSI.RESET}\n`);
      return { exitCode: 1 };
    }

    const command = commandArgs[0];
    const cmdArgs = commandArgs.slice(1);

    // If no explicit package, use command name as package
    if (!packageName) {
      packageName = command;
    }

    // Check if package is installed locally
    const localBinPath = `${ctx.state.cwd}/node_modules/.bin/${command}`;
    let isInstalled = false;

    try {
      await ctx.fs.stat(localBinPath);
      isInstalled = true;
    } catch {
      // Not installed locally
    }

    if (!isInstalled) {
      // Need to install the package first
      ctx.stdout(`${ANSI.DIM}Need to install ${packageName}...${ANSI.RESET}\n`);

      const pm = new BaviniPM({
        filesystem: ctx.fs,
        projectRoot: ctx.state.cwd,
      });

      try {
        const result = await pm.install([packageName], {
          noSave: true,
          onProgress: (progress) => {
            if (progress.package) {
              ctx.stdout(`${ANSI.DIM}${progress.phase}: ${progress.package}${ANSI.RESET}\r`);
            }
          },
        });

        ctx.stdout('\n');

        if (!result.success) {
          ctx.stdout(`${ANSI.RED}Failed to install ${packageName}${ANSI.RESET}\n`);

          for (const error of result.errors) {
            ctx.stdout(`  ${ANSI.RED}${error}${ANSI.RESET}\n`);
          }

          return { exitCode: 1 };
        }
      } catch (error) {
        ctx.stdout(`${ANSI.RED}Error: ${error instanceof Error ? error.message : String(error)}${ANSI.RESET}\n`);
        return { exitCode: 1 };
      }
    }

    // Try to run the command
    ctx.stdout(`${ANSI.DIM}> ${command} ${cmdArgs.join(' ')}${ANSI.RESET}\n`);

    // In a browser environment, we can't actually execute binaries
    // This would need to be integrated with a JavaScript runtime or bundler
    // For now, we'll indicate that the command was "scheduled"

    ctx.stdout(`${ANSI.YELLOW}Note: Binary execution requires runtime integration.${ANSI.RESET}\n`);
    ctx.stdout(`Package ${ANSI.CYAN}${packageName}${ANSI.RESET} is available in node_modules.\n`);

    // If it's a common tool, provide helpful information
    if (command === 'tsc' || command === 'typescript') {
      ctx.stdout(`${ANSI.DIM}Tip: TypeScript compilation is handled by the build system.${ANSI.RESET}\n`);
    } else if (command === 'eslint') {
      ctx.stdout(`${ANSI.DIM}Tip: ESLint can be run via the editor integration.${ANSI.RESET}\n`);
    } else if (command === 'prettier') {
      ctx.stdout(`${ANSI.DIM}Tip: Prettier can be run via the editor's format command.${ANSI.RESET}\n`);
    } else if (command.startsWith('create-')) {
      ctx.stdout(`${ANSI.DIM}Tip: Project scaffolding tools will create files in node_modules.${ANSI.RESET}\n`);
      ctx.stdout(`${ANSI.DIM}Check the package documentation for usage.${ANSI.RESET}\n`);
    }

    return { exitCode: 0 };
  },
};
