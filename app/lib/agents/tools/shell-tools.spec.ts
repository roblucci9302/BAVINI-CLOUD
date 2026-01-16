/**
 * Tests for shell-tools with whitelist security
 * @module agents/tools/shell-tools.spec
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  validateCommand,
  setShellSecurityConfig,
  getShellSecurityConfig,
  addToWhitelist,
  removeFromWhitelist,
  isWhitelisted,
  getWhitelistedPrograms,
  type ShellSecurityConfig,
  type CommandValidationResult,
} from './shell-tools';

describe('Shell Security - Command Validation', () => {
  beforeEach(() => {
    // Reset to default config before each test
    setShellSecurityConfig({
      mode: 'strict',
      allowPipes: false,
      allowRedirections: false,
      allowChaining: false,
    });
  });

  describe('Whitelist validation (strict mode)', () => {
    it('should allow whitelisted programs', () => {
      const allowedCommands = [
        'npm install',
        'pnpm run dev',
        'yarn build',
        'node script.js',
        'git status',
        'ls -la',
        'cat file.txt',
        'vitest run',
        'eslint src/',
        'prettier --write .',
      ];

      const config = getShellSecurityConfig();
      for (const cmd of allowedCommands) {
        const result = validateCommand(cmd, config);
        expect(result.safe, `Expected "${cmd}" to be safe`).toBe(true);
      }
    });

    it('should reject non-whitelisted programs in strict mode', () => {
      const config = getShellSecurityConfig();
      const result = validateCommand('unknown_program --flag', config);

      expect(result.safe).toBe(false);
      expect(result.reason).toContain('not in the whitelist');
      expect(result.suggestion).toContain('additionalAllowedPrograms');
    });

    it('should allow non-whitelisted programs in permissive mode', () => {
      setShellSecurityConfig({ mode: 'permissive' });
      const config = getShellSecurityConfig();

      const result = validateCommand('custom_tool --flag', config);

      // Should pass in permissive mode (if not blacklisted)
      expect(result.safe).toBe(true);
    });
  });

  describe('Blacklist validation (always applied)', () => {
    it('should reject blacklisted programs regardless of mode', () => {
      const blacklistedCommands = [
        { cmd: 'rm -rf /tmp', program: 'rm' },
        { cmd: 'sudo apt-get install', program: 'sudo' },
        { cmd: 'chmod 777 file', program: 'chmod' },
        { cmd: 'chown root file', program: 'chown' },
        { cmd: 'dd if=/dev/zero', program: 'dd' },
        { cmd: 'eval "$(cat script)"', program: 'eval' },
      ];

      const config = getShellSecurityConfig();
      for (const { cmd, program } of blacklistedCommands) {
        const result = validateCommand(cmd, config);
        expect(result.safe, `Expected "${cmd}" to be rejected`).toBe(false);
        expect(result.reason).toContain('forbidden');
        expect(result.program).toBe(program);
      }
    });

    it('should reject blacklisted programs even in permissive mode', () => {
      setShellSecurityConfig({ mode: 'permissive' });
      const config = getShellSecurityConfig();

      const result = validateCommand('rm -rf /home/user', config);

      expect(result.safe).toBe(false);
      expect(result.program).toBe('rm');
    });

    it('should provide suggestions for common dangerous commands', () => {
      const config = getShellSecurityConfig();
      const result = validateCommand('rm file.txt', config);

      expect(result.safe).toBe(false);
      expect(result.suggestion).toContain('delete_file tool');
    });
  });

  describe('Dangerous patterns detection', () => {
    it('should reject commands with dangerous patterns', () => {
      const dangerousCommands = [
        { cmd: 'cat $(whoami)', reason: 'Command substitution' },
        { cmd: 'echo `id`', reason: 'Backtick substitution' },
        { cmd: 'node; rm -rf /', reason: 'Hidden rm' },
        { cmd: 'cat file | sh', reason: 'Pipe to shell' },
        { cmd: 'cat file | bash', reason: 'Pipe to bash' },
        { cmd: 'node && rm -rf /', reason: 'rm after &&' },
        { cmd: 'echo > /etc/passwd', reason: 'Write to /etc' },
        { cmd: 'cat > /usr/bin/test', reason: 'Write to /usr' },
      ];

      for (const { cmd, reason } of dangerousCommands) {
        // Use permissive mode to test pattern detection alone
        const config: ShellSecurityConfig = {
          mode: 'permissive',
          allowPipes: true,
          allowRedirections: true,
          allowChaining: true,
        };
        const result = validateCommand(cmd, config);
        expect(result.safe, `Expected "${cmd}" to be rejected (${reason})`).toBe(false);
      }
    });
  });

  describe('Operator restrictions', () => {
    it('should reject pipes in strict mode', () => {
      const config: ShellSecurityConfig = {
        mode: 'strict',
        allowPipes: false,
        allowRedirections: false,
        allowChaining: false,
      };
      const result = validateCommand('ls | grep test', config);

      expect(result.safe).toBe(false);
      expect(result.reason).toContain('Pipes');
    });

    it('should allow pipes when configured', () => {
      const config: ShellSecurityConfig = {
        mode: 'strict',
        allowPipes: true,
        allowRedirections: false,
        allowChaining: false,
      };
      const result = validateCommand('ls | grep test', config);

      expect(result.safe).toBe(true);
    });

    it('should reject redirections in strict mode', () => {
      const config: ShellSecurityConfig = {
        mode: 'strict',
        allowPipes: false,
        allowRedirections: false,
        allowChaining: false,
      };
      const result = validateCommand('echo hello > file.txt', config);

      expect(result.safe).toBe(false);
      expect(result.reason).toContain('Redirections');
    });

    it('should allow redirections when configured', () => {
      const config: ShellSecurityConfig = {
        mode: 'strict',
        allowPipes: false,
        allowRedirections: true,
        allowChaining: false,
      };
      const result = validateCommand('echo hello > file.txt', config);

      expect(result.safe).toBe(true);
    });

    it('should reject command chaining in strict mode', () => {
      const config: ShellSecurityConfig = {
        mode: 'strict',
        allowPipes: false,
        allowRedirections: false,
        allowChaining: false,
      };
      const chainedCommands = ['npm install && npm run build', 'npm install; npm start'];

      for (const cmd of chainedCommands) {
        const result = validateCommand(cmd, config);
        expect(result.safe, `Expected "${cmd}" to be rejected`).toBe(false);

        // May contain 'chaining' or 'Pipes' (since || contains |)
        expect(result.reason).toBeDefined();
      }

      // Test || separately with pipes allowed
      const configWithPipes: ShellSecurityConfig = {
        mode: 'strict',
        allowPipes: true,
        allowRedirections: false,
        allowChaining: false,
      };
      const orResult = validateCommand('npm test || npm run lint', configWithPipes);
      expect(orResult.safe).toBe(false);
      expect(orResult.reason).toContain('chaining');
    });

    it('should allow chaining when configured', () => {
      const config: ShellSecurityConfig = {
        mode: 'strict',
        allowPipes: false,
        allowRedirections: false,
        allowChaining: true,
      };
      const result = validateCommand('npm install && npm run build', config);

      expect(result.safe).toBe(true);
    });
  });

  describe('Environment variable handling', () => {
    it('should correctly identify program with env var prefix', () => {
      const config = getShellSecurityConfig();
      const result = validateCommand('NODE_ENV=production node app.js', config);

      expect(result.safe).toBe(true);
      expect(result.program).toBe('node');
    });

    it('should handle multiple env vars', () => {
      const config = getShellSecurityConfig();
      const result = validateCommand('DEBUG=true NODE_ENV=test npm run test', config);

      expect(result.safe).toBe(true);
      expect(result.program).toBe('npm');
    });
  });

  describe('Case sensitivity', () => {
    it('should handle uppercase program names', () => {
      const config = getShellSecurityConfig();
      const result = validateCommand('NPM install', config);

      expect(result.safe).toBe(true);
      expect(result.program).toBe('npm');
    });

    it('should handle mixed case', () => {
      const config = getShellSecurityConfig();
      const result = validateCommand('Git Status', config);

      expect(result.safe).toBe(true);
      expect(result.program).toBe('git');
    });
  });

  describe('Empty and edge cases', () => {
    it('should reject empty commands', () => {
      const config = getShellSecurityConfig();
      const result = validateCommand('', config);

      expect(result.safe).toBe(false);
      expect(result.reason).toContain('Empty');
    });

    it('should reject whitespace-only commands', () => {
      const config = getShellSecurityConfig();
      const result = validateCommand('   ', config);

      expect(result.safe).toBe(false);
    });

    it('should handle commands with extra whitespace', () => {
      const config = getShellSecurityConfig();
      const result = validateCommand('  npm   install   react  ', config);

      expect(result.safe).toBe(true);
      expect(result.program).toBe('npm');
    });
  });

  describe('Additional forbidden patterns', () => {
    it('should reject commands matching additional patterns', () => {
      const config: ShellSecurityConfig = {
        mode: 'strict',
        allowPipes: false,
        allowRedirections: false,
        allowChaining: false,
        additionalForbiddenPatterns: ['secret', 'password'],
      };

      const result = validateCommand('cat /path/to/secret/file', config);

      expect(result.safe).toBe(false);
      expect(result.reason).toContain('forbidden pattern');
    });
  });
});

describe('Shell Security - Whitelist Management', () => {
  beforeEach(() => {
    // Reset config
    setShellSecurityConfig({ mode: 'strict' });
  });

  describe('getWhitelistedPrograms', () => {
    it('should return sorted list of whitelisted programs', () => {
      const programs = getWhitelistedPrograms();

      expect(Array.isArray(programs)).toBe(true);
      expect(programs.length).toBeGreaterThan(0);

      // Check that it's sorted
      const sorted = [...programs].sort();
      expect(programs).toEqual(sorted);
    });

    it('should include common development tools', () => {
      const programs = getWhitelistedPrograms();

      expect(programs).toContain('npm');
      expect(programs).toContain('pnpm');
      expect(programs).toContain('node');
      expect(programs).toContain('git');
      expect(programs).toContain('vitest');
    });
  });

  describe('isWhitelisted', () => {
    it('should return true for whitelisted programs', () => {
      expect(isWhitelisted('npm')).toBe(true);
      expect(isWhitelisted('git')).toBe(true);
      expect(isWhitelisted('node')).toBe(true);
    });

    it('should return false for non-whitelisted programs', () => {
      expect(isWhitelisted('unknown_program')).toBe(false);
      expect(isWhitelisted('my_custom_tool')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isWhitelisted('NPM')).toBe(true);
      expect(isWhitelisted('Git')).toBe(true);
      expect(isWhitelisted('NODE')).toBe(true);
    });
  });

  describe('addToWhitelist', () => {
    it('should add new program to whitelist', () => {
      const customProgram = 'my_custom_tool_' + Date.now();

      expect(isWhitelisted(customProgram)).toBe(false);

      addToWhitelist(customProgram);

      expect(isWhitelisted(customProgram)).toBe(true);

      // Cleanup
      removeFromWhitelist(customProgram);
    });

    it('should handle uppercase input', () => {
      const customProgram = 'MY_UPPER_TOOL_' + Date.now();

      addToWhitelist(customProgram);

      expect(isWhitelisted(customProgram.toLowerCase())).toBe(true);

      // Cleanup
      removeFromWhitelist(customProgram);
    });
  });

  describe('removeFromWhitelist', () => {
    it('should remove program from whitelist', () => {
      const customProgram = 'temp_tool_' + Date.now();

      addToWhitelist(customProgram);
      expect(isWhitelisted(customProgram)).toBe(true);

      const removed = removeFromWhitelist(customProgram);

      expect(removed).toBe(true);
      expect(isWhitelisted(customProgram)).toBe(false);
    });

    it('should return false when removing non-existent program', () => {
      const removed = removeFromWhitelist('definitely_not_in_whitelist_' + Date.now());

      expect(removed).toBe(false);
    });
  });
});

describe('Shell Security - Configuration', () => {
  afterEach(() => {
    // Reset to defaults
    setShellSecurityConfig({
      mode: 'strict',
      allowPipes: false,
      allowRedirections: false,
      allowChaining: false,
    });
  });

  describe('getShellSecurityConfig', () => {
    it('should return current configuration', () => {
      const config = getShellSecurityConfig();

      expect(config).toHaveProperty('mode');
      expect(config).toHaveProperty('allowPipes');
      expect(config).toHaveProperty('allowRedirections');
      expect(config).toHaveProperty('allowChaining');
    });

    it('should return a copy (immutable)', () => {
      const config1 = getShellSecurityConfig();
      const config2 = getShellSecurityConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('setShellSecurityConfig', () => {
    it('should update configuration', () => {
      setShellSecurityConfig({
        mode: 'permissive',
        allowPipes: true,
      });

      const config = getShellSecurityConfig();

      expect(config.mode).toBe('permissive');
      expect(config.allowPipes).toBe(true);
    });

    it('should merge with defaults', () => {
      setShellSecurityConfig({ allowPipes: true });

      const config = getShellSecurityConfig();

      // Should have default mode but updated allowPipes
      expect(config.mode).toBe('strict');
      expect(config.allowPipes).toBe(true);
    });

    it('should support additional allowed programs', () => {
      const config: ShellSecurityConfig = {
        mode: 'strict',
        allowPipes: false,
        allowRedirections: false,
        allowChaining: false,
        additionalAllowedPrograms: ['custom_tool'],
      };

      const result = validateCommand('custom_tool --flag', config);

      expect(result.safe).toBe(true);
    });
  });
});

describe('Shell Security - Real-world scenarios', () => {
  const strictConfig: ShellSecurityConfig = {
    mode: 'strict',
    allowPipes: false,
    allowRedirections: false,
    allowChaining: false,
  };

  it('should allow typical npm workflow', () => {
    const commands = ['npm install', 'npm run build', 'npm run test', 'npm run lint', 'npm publish'];

    for (const cmd of commands) {
      expect(validateCommand(cmd, strictConfig).safe, `Failed: ${cmd}`).toBe(true);
    }
  });

  it('should allow typical git workflow', () => {
    const commands = [
      'git init',
      'git add .',
      'git commit -m "message"',
      'git push origin main',
      'git pull',
      'git checkout -b feature',
      'git merge main',
      'git status',
      'git log --oneline',
    ];

    for (const cmd of commands) {
      expect(validateCommand(cmd, strictConfig).safe, `Failed: ${cmd}`).toBe(true);
    }
  });

  it('should allow typical node/vitest workflow', () => {
    const commands = [
      'node app.js',
      'vitest run',
      'vitest --coverage',
      'tsc --noEmit',
      'eslint src/',
      'prettier --write .',
    ];

    for (const cmd of commands) {
      expect(validateCommand(cmd, strictConfig).safe, `Failed: ${cmd}`).toBe(true);
    }
  });
});
