/**
 * =============================================================================
 * BAVINI Container - npm Command
 * =============================================================================
 * npm builtin command for package management.
 * =============================================================================
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';
import type { MountManager } from '../../filesystem';
import { BaviniPM } from '../../package-manager';
import { ANSI } from '../types';

/**
 * Global BaviniPM instance (lazy initialized)
 */
let _pm: BaviniPM | null = null;

function getPM(filesystem: MountManager, cwd: string): BaviniPM {
  if (!_pm) {
    _pm = new BaviniPM({
      filesystem,
      projectRoot: cwd,
    });
  }

  return _pm;
}

/**
 * npm install command
 */
export const npmInstallCommand: BuiltinCommand = {
  name: 'npm-install',
  description: 'Install packages',
  usage: 'npm install [packages...] [--save-dev] [--production]',

  async execute(args: string[], ctx: CommandContext): Promise<CommandResult> {
    const packages: string[] = [];
    let saveDev = false;
    let production = false;
    let force = false;

    // Parse arguments
    for (const arg of args) {
      if (arg === '--save-dev' || arg === '-D') {
        saveDev = true;
      } else if (arg === '--production' || arg === '--prod') {
        production = true;
      } else if (arg === '--force' || arg === '-f') {
        force = true;
      } else if (!arg.startsWith('-')) {
        packages.push(arg);
      }
    }

    const pm = getPM(ctx.fs, ctx.state.cwd);

    ctx.stdout(`${ANSI.DIM}Resolving dependencies...${ANSI.RESET}\n`);

    try {
      const result = await pm.install(packages.length > 0 ? packages : undefined, {
        saveDev,
        production,
        force,
        onProgress: (progress) => {
          if (progress.package) {
            ctx.stdout(`${ANSI.DIM}${progress.phase}: ${progress.package}${ANSI.RESET}\r`);
          }
        },
      });

      ctx.stdout('\n');

      if (result.success) {
        ctx.stdout(`${ANSI.GREEN}✓${ANSI.RESET} Installed ${result.installed.length} packages\n`);

        for (const pkg of result.installed.slice(0, 10)) {
          ctx.stdout(`  ${ANSI.DIM}+${ANSI.RESET} ${pkg.name}@${pkg.version}\n`);
        }

        if (result.installed.length > 10) {
          ctx.stdout(`  ${ANSI.DIM}...and ${result.installed.length - 10} more${ANSI.RESET}\n`);
        }
      } else {
        ctx.stdout(`${ANSI.RED}✗${ANSI.RESET} Installation failed\n`);

        for (const error of result.errors) {
          ctx.stdout(`  ${ANSI.RED}${error}${ANSI.RESET}\n`);
        }
      }

      for (const warning of result.warnings) {
        ctx.stdout(`${ANSI.YELLOW}⚠${ANSI.RESET} ${warning}\n`);
      }

      ctx.stdout(`${ANSI.DIM}Done in ${(result.duration / 1000).toFixed(2)}s${ANSI.RESET}\n`);

      return { exitCode: result.success ? 0 : 1 };
    } catch (error) {
      ctx.stdout(`${ANSI.RED}Error: ${error instanceof Error ? error.message : String(error)}${ANSI.RESET}\n`);
      return { exitCode: 1 };
    }
  },
};

/**
 * npm uninstall command
 */
export const npmUninstallCommand: BuiltinCommand = {
  name: 'npm-uninstall',
  description: 'Uninstall packages',
  usage: 'npm uninstall <packages...>',

  async execute(args: string[], ctx: CommandContext): Promise<CommandResult> {
    const packages = args.filter((arg) => !arg.startsWith('-'));

    if (packages.length === 0) {
      ctx.stdout(`${ANSI.RED}Error: Please specify packages to uninstall${ANSI.RESET}\n`);
      return { exitCode: 1 };
    }

    const pm = getPM(ctx.fs, ctx.state.cwd);

    ctx.stdout(`${ANSI.DIM}Removing packages...${ANSI.RESET}\n`);

    try {
      const result = await pm.uninstall(packages);

      if (result.success) {
        ctx.stdout(`${ANSI.GREEN}✓${ANSI.RESET} Removed ${packages.length} package(s)\n`);

        for (const pkg of packages) {
          ctx.stdout(`  ${ANSI.DIM}-${ANSI.RESET} ${pkg}\n`);
        }
      } else {
        for (const error of result.errors) {
          ctx.stdout(`${ANSI.RED}${error}${ANSI.RESET}\n`);
        }
      }

      return { exitCode: result.success ? 0 : 1 };
    } catch (error) {
      ctx.stdout(`${ANSI.RED}Error: ${error instanceof Error ? error.message : String(error)}${ANSI.RESET}\n`);
      return { exitCode: 1 };
    }
  },
};

/**
 * npm run command
 */
export const npmRunCommand: BuiltinCommand = {
  name: 'npm-run',
  description: 'Run a package script',
  usage: 'npm run <script> [-- args...]',

  async execute(args: string[], ctx: CommandContext): Promise<CommandResult> {
    if (args.length === 0) {
      // List available scripts
      try {
        const content = await ctx.fs.readFile(`${ctx.state.cwd}/package.json`);
        const packageJson = JSON.parse(new TextDecoder().decode(content));
        const scripts = packageJson.scripts ?? {};

        if (Object.keys(scripts).length === 0) {
          ctx.stdout(`${ANSI.DIM}No scripts found in package.json${ANSI.RESET}\n`);
        } else {
          ctx.stdout(`${ANSI.BOLD}Available scripts:${ANSI.RESET}\n`);

          for (const [name, cmd] of Object.entries(scripts)) {
            ctx.stdout(`  ${ANSI.CYAN}${name}${ANSI.RESET}\n`);
            ctx.stdout(`    ${ANSI.DIM}${cmd}${ANSI.RESET}\n`);
          }
        }

        return { exitCode: 0 };
      } catch {
        ctx.stdout(`${ANSI.RED}Error: Could not read package.json${ANSI.RESET}\n`);
        return { exitCode: 1 };
      }
    }

    const scriptName = args[0];
    const scriptArgs = args.slice(1).filter((a) => a !== '--');

    const pm = getPM(ctx.fs, ctx.state.cwd);

    try {
      const result = await pm.run(scriptName, scriptArgs);

      if (result.stdout) {
        ctx.stdout(result.stdout);
      }

      if (result.stderr) {
        ctx.stdout(`${ANSI.RED}${result.stderr}${ANSI.RESET}`);
      }

      return { exitCode: result.exitCode };
    } catch (error) {
      ctx.stdout(`${ANSI.RED}Error: ${error instanceof Error ? error.message : String(error)}${ANSI.RESET}\n`);
      return { exitCode: 1 };
    }
  },
};

/**
 * npm list command
 */
export const npmListCommand: BuiltinCommand = {
  name: 'npm-list',
  description: 'List installed packages',
  usage: 'npm list [--depth=n]',

  async execute(args: string[], ctx: CommandContext): Promise<CommandResult> {
    const pm = getPM(ctx.fs, ctx.state.cwd);

    try {
      const packages = await pm.list();

      if (packages.length === 0) {
        ctx.stdout(`${ANSI.DIM}No packages installed${ANSI.RESET}\n`);
      } else {
        ctx.stdout(`${ANSI.BOLD}Installed packages:${ANSI.RESET}\n`);

        for (const pkg of packages) {
          ctx.stdout(`├── ${pkg.name}@${ANSI.CYAN}${pkg.version}${ANSI.RESET}\n`);
        }

        ctx.stdout(`\n${ANSI.DIM}${packages.length} package(s)${ANSI.RESET}\n`);
      }

      return { exitCode: 0 };
    } catch (error) {
      ctx.stdout(`${ANSI.RED}Error: ${error instanceof Error ? error.message : String(error)}${ANSI.RESET}\n`);
      return { exitCode: 1 };
    }
  },
};

/**
 * Main npm command dispatcher
 */
export const npmCommand: BuiltinCommand = {
  name: 'npm',
  description: 'Node package manager',
  usage: 'npm <command> [options]',

  async execute(args: string[], ctx: CommandContext): Promise<CommandResult> {
    if (args.length === 0) {
      ctx.stdout(`${ANSI.BOLD}npm - Node Package Manager${ANSI.RESET}\n\n`);
      ctx.stdout('Usage: npm <command>\n\n');
      ctx.stdout('Commands:\n');
      ctx.stdout('  install, i     Install packages\n');
      ctx.stdout('  uninstall, un  Remove packages\n');
      ctx.stdout('  run            Run a script\n');
      ctx.stdout('  list, ls       List installed packages\n');
      ctx.stdout('\n');
      ctx.stdout('Options:\n');
      ctx.stdout('  --save-dev, -D   Save to devDependencies\n');
      ctx.stdout('  --production     Install production deps only\n');
      ctx.stdout('  --force, -f      Force reinstall\n');
      return { exitCode: 0 };
    }

    const subcommand = args[0];
    const subArgs = args.slice(1);

    switch (subcommand) {
      case 'install':
      case 'i':
      case 'add':
        return npmInstallCommand.execute(subArgs, ctx);

      case 'uninstall':
      case 'un':
      case 'remove':
      case 'rm':
        return npmUninstallCommand.execute(subArgs, ctx);

      case 'run':
      case 'run-script':
        return npmRunCommand.execute(subArgs, ctx);

      case 'list':
      case 'ls':
        return npmListCommand.execute(subArgs, ctx);

      case 'init':
        return npmInit(subArgs, ctx);

      case 'cache':
        return npmCache(subArgs, ctx);

      default:
        ctx.stdout(`${ANSI.RED}Unknown command: ${subcommand}${ANSI.RESET}\n`);
        ctx.stdout('Run `npm` for available commands\n');
        return { exitCode: 1 };
    }
  },
};

/**
 * npm init command
 */
async function npmInit(args: string[], ctx: CommandContext): Promise<CommandResult> {
  const packageJson = {
    name: 'project',
    version: '1.0.0',
    description: '',
    main: 'index.js',
    scripts: {
      test: 'echo "Error: no test specified" && exit 1',
    },
    keywords: [],
    author: '',
    license: 'ISC',
  };

  try {
    const content = JSON.stringify(packageJson, null, 2);
    const data = new TextEncoder().encode(content);
    await ctx.fs.writeFile(`${ctx.state.cwd}/package.json`, data);

    ctx.stdout(`${ANSI.GREEN}✓${ANSI.RESET} Created package.json\n`);
    return { exitCode: 0 };
  } catch (error) {
    ctx.stdout(`${ANSI.RED}Error: ${error instanceof Error ? error.message : String(error)}${ANSI.RESET}\n`);
    return { exitCode: 1 };
  }
}

/**
 * npm cache command
 */
async function npmCache(args: string[], ctx: CommandContext): Promise<CommandResult> {
  const subcommand = args[0];

  if (subcommand === 'clean' || subcommand === 'clear') {
    const pm = getPM(ctx.fs, ctx.state.cwd);
    await pm.clearCache();
    ctx.stdout(`${ANSI.GREEN}✓${ANSI.RESET} Cache cleared\n`);
    return { exitCode: 0 };
  }

  if (subcommand === 'ls' || subcommand === 'list') {
    const pm = getPM(ctx.fs, ctx.state.cwd);
    const stats = pm.getCacheStats();
    ctx.stdout(`Cache: ${stats.packages} packages (${(stats.memorySize / 1024 / 1024).toFixed(2)} MB)\n`);
    return { exitCode: 0 };
  }

  ctx.stdout('Usage: npm cache <clean|ls>\n');
  return { exitCode: 1 };
}
