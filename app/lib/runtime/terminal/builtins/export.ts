/**
 * export - Set environment variables
 */

import type { BuiltinCommand, CommandContext, CommandResult, ShellEnv } from '../types';

export const exportCommand: BuiltinCommand = {
  name: 'export',
  description: 'Set environment variables',
  usage: 'export [NAME=value...]',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    if (args.length === 0) {
      // Show all exported variables
      const env = context.state.env;
      for (const [key, value] of Object.entries(env)) {
        if (value !== undefined) {
          context.stdout(`export ${key}="${value}"\n`);
        }
      }
      return { exitCode: 0 };
    }

    const envUpdates: ShellEnv = {};

    for (const arg of args) {
      // Parse NAME=value format
      const eqIndex = arg.indexOf('=');

      if (eqIndex === -1) {
        // Just a name, export existing variable (no-op in our simple shell)
        continue;
      }

      const name = arg.substring(0, eqIndex);
      let value = arg.substring(eqIndex + 1);

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      // Validate name (must be valid identifier)
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
        context.stderr(`export: '${name}': not a valid identifier\n`);
        return { exitCode: 1 };
      }

      envUpdates[name] = value;
    }

    return {
      exitCode: 0,
      stateUpdates: { env: envUpdates },
    };
  },
};
