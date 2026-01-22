/**
 * help - Display help information
 */

import type { BuiltinCommand, CommandContext, CommandResult } from '../types';
import { TermFormat } from '../types';
import { getCommandRegistry } from './index';

export const helpCommand: BuiltinCommand = {
  name: 'help',
  description: 'Display help information',
  usage: 'help [command]',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    const registry = getCommandRegistry();

    if (args.length > 0) {
      // Help for specific command
      const cmdName = args[0];
      const cmd = registry.get(cmdName);

      if (!cmd) {
        context.stderr(`help: no help for '${cmdName}'\n`);
        return { exitCode: 1 };
      }

      context.stdout(`${TermFormat.bold(cmd.name)} - ${cmd.description}\n`);
      context.stdout(`\nUsage: ${cmd.usage}\n`);

      return { exitCode: 0 };
    }

    // List all commands
    context.stdout(TermFormat.bold('BAVINI Container Shell - Available Commands\n'));
    context.stdout(TermFormat.gray('━'.repeat(50) + '\n\n'));

    const commands = registry.list();
    const maxNameLen = Math.max(...commands.map((name) => name.length));

    for (const name of commands) {
      const cmd = registry.get(name)!;
      const padding = ' '.repeat(maxNameLen - name.length + 2);
      context.stdout(`  ${TermFormat.cyan(name)}${padding}${cmd.description}\n`);
    }

    context.stdout(TermFormat.gray('\n━'.repeat(50) + '\n'));
    context.stdout(`\nType ${TermFormat.cyan('help <command>')} for more information.\n`);

    return { exitCode: 0 };
  },
};
