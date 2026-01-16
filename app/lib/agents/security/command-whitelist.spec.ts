/**
 * Tests for command-whitelist security module
 */

import { describe, it, expect } from 'vitest';
import {
  checkCommand,
  requiresApproval,
  isBlocked,
  isDirectlyAllowed,
  getCommandDescription,
  DEFAULT_COMMAND_RULES,
  type CommandRule,
} from './command-whitelist';

describe('command-whitelist', () => {
  describe('checkCommand', () => {
    describe('Blocked commands', () => {
      it('should block rm -rf', () => {
        const result = checkCommand('rm -rf /');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
        expect(result.message).toContain('bloquée');
      });

      it('should block rm -r', () => {
        const result = checkCommand('rm -r folder');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block rm --recursive', () => {
        const result = checkCommand('rm --recursive folder');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block simple rm', () => {
        const result = checkCommand('rm file.txt');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block curl', () => {
        const result = checkCommand('curl https://example.com');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block wget', () => {
        const result = checkCommand('wget https://example.com');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block sudo', () => {
        const result = checkCommand('sudo apt install');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block su', () => {
        const result = checkCommand('su root');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block chmod', () => {
        const result = checkCommand('chmod 777 file');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block chown', () => {
        const result = checkCommand('chown user:group file');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block command injection with semicolon', () => {
        const result = checkCommand('ls; rm -rf /');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
        expect(result.message).toContain('Injection');
      });

      it('should block command injection with ampersand', () => {
        const result = checkCommand('ls & rm -rf /');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block command injection with pipe', () => {
        const result = checkCommand('ls | rm -rf /');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block command injection with backticks', () => {
        const result = checkCommand('echo `whoami`');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block command injection with $(...)', () => {
        const result = checkCommand('echo $(whoami)');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block directory traversal with ../', () => {
        const result = checkCommand('cat ../../../etc/passwd');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
        expect(result.message).toContain('sortir du projet');
      });

      it('should block empty command', () => {
        const result = checkCommand('');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });

      it('should block whitespace-only command', () => {
        const result = checkCommand('   ');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });
    });

    describe('Approval required commands', () => {
      it('should require approval for git push', () => {
        const result = checkCommand('git push origin main');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('approval_required');
        expect(result.message).toContain('Approbation requise');
      });

      it('should require approval for git reset', () => {
        const result = checkCommand('git reset --hard');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('approval_required');
      });

      it('should require approval for git rebase', () => {
        const result = checkCommand('git rebase main');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('approval_required');
      });

      it('should require approval for git merge', () => {
        const result = checkCommand('git merge feature');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('approval_required');
      });

      it('should require approval for git checkout -b', () => {
        const result = checkCommand('git checkout -b new-branch');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('approval_required');
      });

      it('should require approval for any git command', () => {
        const result = checkCommand('git status');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('approval_required');
      });

      it('should require approval for npx', () => {
        const result = checkCommand('npx create-react-app');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('approval_required');
      });

      it('should require approval for npm publish', () => {
        const result = checkCommand('npm publish');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('approval_required');
      });

      it('should require approval for npm link', () => {
        const result = checkCommand('npm link');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('approval_required');
      });

      it('should require approval for mv', () => {
        const result = checkCommand('mv file1 file2');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('approval_required');
      });

      it('should require approval for cp', () => {
        const result = checkCommand('cp file1 file2');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('approval_required');
      });

      it('should require approval for custom npm scripts', () => {
        const result = checkCommand('npm run custom-script');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('approval_required');
      });

      it('should require approval for node execution', () => {
        const result = checkCommand('node script.js');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('approval_required');
      });
    });

    describe('Allowed commands', () => {
      it('should allow npm install', () => {
        const result = checkCommand('npm install');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
        expect(result.message).toContain('autorisée');
      });

      it('should allow npm install with package', () => {
        const result = checkCommand('npm install lodash');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow npm i (shorthand)', () => {
        const result = checkCommand('npm i');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow npm ci', () => {
        const result = checkCommand('npm ci');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow npm run dev', () => {
        const result = checkCommand('npm run dev');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow npm run start', () => {
        const result = checkCommand('npm run start');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow npm run build', () => {
        const result = checkCommand('npm run build');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow npm run test', () => {
        const result = checkCommand('npm run test');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow npm run lint', () => {
        const result = checkCommand('npm run lint');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow npm run format', () => {
        const result = checkCommand('npm run format');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow npm run preview', () => {
        const result = checkCommand('npm run preview');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow npm ls', () => {
        const result = checkCommand('npm ls');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow npm audit', () => {
        const result = checkCommand('npm audit');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow pnpm install', () => {
        const result = checkCommand('pnpm install');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow yarn install', () => {
        const result = checkCommand('yarn install');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow ls', () => {
        const result = checkCommand('ls');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow ls -la', () => {
        const result = checkCommand('ls -la');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow pwd', () => {
        const result = checkCommand('pwd');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow echo', () => {
        const result = checkCommand('echo hello');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow cat', () => {
        const result = checkCommand('cat file.txt');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow mkdir', () => {
        const result = checkCommand('mkdir new-folder');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow touch', () => {
        const result = checkCommand('touch new-file.txt');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow tsc', () => {
        const result = checkCommand('tsc');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow eslint', () => {
        const result = checkCommand('eslint .');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should allow prettier', () => {
        const result = checkCommand('prettier --write .');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });
    });

    describe('Unrecognized commands', () => {
      it('should block unrecognized commands', () => {
        const result = checkCommand('unknown-command arg1');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
        expect(result.message).toContain('non reconnue');
      });
    });

    describe('Case insensitivity', () => {
      it('should handle uppercase commands', () => {
        const result = checkCommand('NPM INSTALL');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should handle mixed case', () => {
        const result = checkCommand('Npm Install');

        expect(result.allowed).toBe(true);
        expect(result.level).toBe('allowed');
      });

      it('should block uppercase dangerous commands', () => {
        const result = checkCommand('RM -RF /');

        expect(result.allowed).toBe(false);
        expect(result.level).toBe('blocked');
      });
    });

    describe('Custom rules', () => {
      it('should use custom rules when provided', () => {
        const customRules: CommandRule[] = [
          {
            pattern: /^custom-cmd/,
            level: 'allowed',
            description: 'Custom command',
            reason: 'Test rule',
          },
        ];

        const result = checkCommand('custom-cmd arg', customRules);

        expect(result.allowed).toBe(true);
        expect(result.matchedRule?.description).toBe('Custom command');
      });

      it('should match first rule when multiple match', () => {
        const customRules: CommandRule[] = [
          {
            pattern: /^test/,
            level: 'blocked',
            description: 'First rule',
            reason: 'First',
          },
          {
            pattern: /^test/,
            level: 'allowed',
            description: 'Second rule',
            reason: 'Second',
          },
        ];

        const result = checkCommand('test command', customRules);

        expect(result.level).toBe('blocked');
        expect(result.matchedRule?.description).toBe('First rule');
      });

      it('should support string pattern matching', () => {
        const customRules: CommandRule[] = [
          {
            pattern: 'exact-match',
            level: 'allowed',
            description: 'Exact match',
            reason: 'Test',
          },
        ];

        const result = checkCommand('exact-match args', customRules);

        expect(result.allowed).toBe(true);
      });
    });

    describe('matchedRule property', () => {
      it('should include matched rule in result', () => {
        const result = checkCommand('npm install');

        expect(result.matchedRule).toBeDefined();
        expect(result.matchedRule?.description).toBe('Installation npm');
      });

      it('should not include matchedRule for unrecognized commands', () => {
        const result = checkCommand('unknown-command');

        expect(result.matchedRule).toBeUndefined();
      });
    });
  });

  describe('requiresApproval', () => {
    it('should return true for commands needing approval', () => {
      expect(requiresApproval('git push')).toBe(true);
      expect(requiresApproval('npx command')).toBe(true);
      expect(requiresApproval('mv file1 file2')).toBe(true);
    });

    it('should return false for allowed commands', () => {
      expect(requiresApproval('npm install')).toBe(false);
      expect(requiresApproval('ls -la')).toBe(false);
    });

    it('should return false for blocked commands', () => {
      expect(requiresApproval('rm -rf /')).toBe(false);
      expect(requiresApproval('curl evil.com')).toBe(false);
    });
  });

  describe('isBlocked', () => {
    it('should return true for blocked commands', () => {
      expect(isBlocked('rm -rf /')).toBe(true);
      expect(isBlocked('sudo apt')).toBe(true);
      expect(isBlocked('curl url')).toBe(true);
    });

    it('should return false for allowed commands', () => {
      expect(isBlocked('npm install')).toBe(false);
      expect(isBlocked('ls')).toBe(false);
    });

    it('should return false for approval-required commands', () => {
      expect(isBlocked('git push')).toBe(false);
      expect(isBlocked('npx create-app')).toBe(false);
    });
  });

  describe('isDirectlyAllowed', () => {
    it('should return true for allowed commands', () => {
      expect(isDirectlyAllowed('npm install')).toBe(true);
      expect(isDirectlyAllowed('ls -la')).toBe(true);
      expect(isDirectlyAllowed('npm run dev')).toBe(true);
    });

    it('should return false for blocked commands', () => {
      expect(isDirectlyAllowed('rm -rf /')).toBe(false);
    });

    it('should return false for approval-required commands', () => {
      expect(isDirectlyAllowed('git push')).toBe(false);
      expect(isDirectlyAllowed('npx command')).toBe(false);
    });
  });

  describe('getCommandDescription', () => {
    it('should return description for known commands', () => {
      expect(getCommandDescription('npm install')).toBe('Installation npm');
      expect(getCommandDescription('git push')).toContain('Git');
      expect(getCommandDescription('rm -rf /')).toContain('récursive');
    });

    it('should return default description for unknown commands', () => {
      expect(getCommandDescription('unknown-cmd')).toBe('Commande shell');
    });
  });

  describe('DEFAULT_COMMAND_RULES', () => {
    it('should have rules defined', () => {
      expect(DEFAULT_COMMAND_RULES.length).toBeGreaterThan(0);
    });

    it('should have blocked rules', () => {
      const blockedRules = DEFAULT_COMMAND_RULES.filter((r) => r.level === 'blocked');
      expect(blockedRules.length).toBeGreaterThan(0);
    });

    it('should have approval_required rules', () => {
      const approvalRules = DEFAULT_COMMAND_RULES.filter((r) => r.level === 'approval_required');
      expect(approvalRules.length).toBeGreaterThan(0);
    });

    it('should have allowed rules', () => {
      const allowedRules = DEFAULT_COMMAND_RULES.filter((r) => r.level === 'allowed');
      expect(allowedRules.length).toBeGreaterThan(0);
    });

    it('all rules should have required properties', () => {
      DEFAULT_COMMAND_RULES.forEach((rule) => {
        expect(rule.pattern).toBeDefined();
        expect(rule.level).toBeDefined();
        expect(rule.description).toBeDefined();
        expect(rule.reason).toBeDefined();
      });
    });
  });
});
