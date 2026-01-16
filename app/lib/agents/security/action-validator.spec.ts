/**
 * Tests for action-validator security module
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateAction,
  generateActionId,
  generateBatchId,
  createProposedAction,
  createActionBatch,
  getBatchStats,
  formatActionForDisplay,
  getActionIcon,
  type ProposedAction,
  type FileCreateDetails,
  type FileModifyDetails,
  type FileDeleteDetails,
  type ShellCommandDetails,
  type DirectoryCreateDetails,
  type FileMoveDetails,
} from './action-validator';
import { checkCommand } from './command-whitelist';

describe('action-validator', () => {
  describe('validateAction', () => {
    describe('Basic validation', () => {
      it('should reject action with missing id', () => {
        const action = {
          id: '',
          type: 'file_create',
          agent: 'coder',
          description: 'Test',
          details: { type: 'file_create', path: 'test.ts', content: '', lineCount: 1 },
          status: 'pending',
          createdAt: new Date(),
        } as ProposedAction;

        const result = validateAction(action);

        expect(result.valid).toBe(false);
        expect(result.messages).toContain('Action invalide: champs requis manquants');
      });

      it('should reject unknown action type', () => {
        const action = createProposedAction('unknown' as any, 'coder', 'Test', {
          type: 'unknown' as any,
        } as any);

        const result = validateAction(action);

        expect(result.valid).toBe(false);
        expect(result.messages[0]).toContain("Type d'action inconnu");
      });
    });

    describe('file_create validation', () => {
      it('should validate valid file creation', () => {
        const action = createProposedAction('file_create', 'coder', 'Create file', {
          type: 'file_create',
          path: 'src/test.ts',
          content: 'const x = 1;',
          lineCount: 1,
        } as FileCreateDetails);

        const result = validateAction(action, true);

        expect(result.valid).toBe(true);
        expect(result.requiresApproval).toBe(true);
      });

      it('should reject file creation with missing path', () => {
        const action = createProposedAction('file_create', 'coder', 'Create file', {
          type: 'file_create',
          path: '',
          content: '',
          lineCount: 0,
        } as FileCreateDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(false);
        expect(result.messages).toContain('Chemin de fichier requis');
      });

      it('should reject file creation with .. in path', () => {
        const action = createProposedAction('file_create', 'coder', 'Create file', {
          type: 'file_create',
          path: '../outside/file.ts',
          content: '',
          lineCount: 0,
        } as FileCreateDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(false);
        expect(result.messages).toContain('Chemin de fichier invalide ou dangereux');
      });

      it('should reject file creation with absolute path', () => {
        const action = createProposedAction('file_create', 'coder', 'Create file', {
          type: 'file_create',
          path: '/etc/passwd',
          content: '',
          lineCount: 0,
        } as FileCreateDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(false);
        expect(result.messages).toContain('Chemin de fichier invalide ou dangereux');
      });

      it('should warn about sensitive files', () => {
        const sensitiveFiles = ['.env', 'credentials.json', 'secrets.yaml', 'private.key', 'password.txt'];

        sensitiveFiles.forEach((file) => {
          const action = createProposedAction('file_create', 'coder', 'Create file', {
            type: 'file_create',
            path: file,
            content: '',
            lineCount: 0,
          } as FileCreateDetails);

          const result = validateAction(action);

          expect(result.valid).toBe(true);
          expect(result.messages.some((m) => m.includes('sensible'))).toBe(true);
        });
      });

      it('should not require approval in non-strict mode', () => {
        const action = createProposedAction('file_create', 'coder', 'Create file', {
          type: 'file_create',
          path: 'src/test.ts',
          content: '',
          lineCount: 0,
        } as FileCreateDetails);

        const result = validateAction(action, false);

        expect(result.valid).toBe(true);
        expect(result.requiresApproval).toBe(false);
      });
    });

    describe('file_modify validation', () => {
      it('should validate valid file modification', () => {
        const action = createProposedAction('file_modify', 'coder', 'Modify file', {
          type: 'file_modify',
          path: 'src/test.ts',
          oldContent: 'old',
          newContent: 'new',
          linesAdded: 1,
          linesRemoved: 1,
        } as FileModifyDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(true);
      });

      it('should reject modification with missing path', () => {
        const action = createProposedAction('file_modify', 'coder', 'Modify file', {
          type: 'file_modify',
          path: '',
          oldContent: '',
          newContent: '',
          linesAdded: 0,
          linesRemoved: 0,
        } as FileModifyDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(false);
        expect(result.messages).toContain('Chemin de fichier requis');
      });

      it('should reject modification with .. in path', () => {
        const action = createProposedAction('file_modify', 'coder', 'Modify file', {
          type: 'file_modify',
          path: '../etc/passwd',
          oldContent: '',
          newContent: '',
          linesAdded: 0,
          linesRemoved: 0,
        } as FileModifyDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(false);
        expect(result.messages).toContain('Chemin de fichier invalide');
      });

      it('should warn about large modifications', () => {
        const action = createProposedAction('file_modify', 'coder', 'Modify file', {
          type: 'file_modify',
          path: 'src/test.ts',
          oldContent: '',
          newContent: '',
          linesAdded: 150,
          linesRemoved: 10,
        } as FileModifyDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(true);
        expect(result.messages.some((m) => m.includes('importante'))).toBe(true);
      });

      it('should warn about large deletions', () => {
        const action = createProposedAction('file_modify', 'coder', 'Modify file', {
          type: 'file_modify',
          path: 'src/test.ts',
          oldContent: '',
          newContent: '',
          linesAdded: 5,
          linesRemoved: 60,
        } as FileModifyDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(true);
        expect(result.messages.some((m) => m.includes('importante'))).toBe(true);
      });
    });

    describe('file_delete validation', () => {
      it('should always require approval for deletion', () => {
        const action = createProposedAction('file_delete', 'coder', 'Delete file', {
          type: 'file_delete',
          path: 'src/test.ts',
        } as FileDeleteDetails);

        // Even in non-strict mode
        const result = validateAction(action, false);

        expect(result.valid).toBe(true);
        expect(result.requiresApproval).toBe(true);
        expect(result.messages.some((m) => m.includes('irréversible'))).toBe(true);
      });

      it('should reject deletion with missing path', () => {
        const action = createProposedAction('file_delete', 'coder', 'Delete file', {
          type: 'file_delete',
          path: '',
        } as FileDeleteDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(false);
        expect(result.messages).toContain('Chemin de fichier requis');
      });
    });

    describe('shell_command validation', () => {
      it('should block dangerous shell commands', () => {
        const action = createProposedAction('shell_command', 'builder', 'Run command', {
          type: 'shell_command',
          command: 'rm -rf /',
          commandCheck: checkCommand('rm -rf /'),
        } as ShellCommandDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(false);
        expect(result.authorizationLevel).toBe('blocked');
      });

      it('should allow safe commands in non-strict mode', () => {
        const action = createProposedAction('shell_command', 'builder', 'Run command', {
          type: 'shell_command',
          command: 'npm install',
          commandCheck: checkCommand('npm install'),
        } as ShellCommandDetails);

        const result = validateAction(action, false);

        expect(result.valid).toBe(true);
        expect(result.requiresApproval).toBe(false);
      });

      it('should require approval for safe commands in strict mode', () => {
        const action = createProposedAction('shell_command', 'builder', 'Run command', {
          type: 'shell_command',
          command: 'npm install',
          commandCheck: checkCommand('npm install'),
        } as ShellCommandDetails);

        const result = validateAction(action, true);

        expect(result.valid).toBe(true);
        expect(result.requiresApproval).toBe(true);
      });

      it('should always require approval for dangerous but not blocked commands', () => {
        const action = createProposedAction('shell_command', 'builder', 'Run command', {
          type: 'shell_command',
          command: 'git push origin main',
          commandCheck: checkCommand('git push origin main'),
        } as ShellCommandDetails);

        const result = validateAction(action, false);

        expect(result.valid).toBe(true);
        expect(result.requiresApproval).toBe(true);
      });
    });

    describe('directory_create validation', () => {
      it('should validate valid directory creation', () => {
        const action = createProposedAction('directory_create', 'coder', 'Create dir', {
          type: 'directory_create',
          path: 'src/components',
        } as DirectoryCreateDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(true);
      });

      it('should reject directory creation with missing path', () => {
        const action = createProposedAction('directory_create', 'coder', 'Create dir', {
          type: 'directory_create',
          path: '',
        } as DirectoryCreateDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(false);
        expect(result.messages).toContain('Chemin de répertoire requis');
      });

      it('should reject directory creation with .. in path', () => {
        const action = createProposedAction('directory_create', 'coder', 'Create dir', {
          type: 'directory_create',
          path: '../outside',
        } as DirectoryCreateDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(false);
        expect(result.messages).toContain('Chemin de répertoire invalide');
      });
    });

    describe('file_move validation', () => {
      it('should validate valid file move', () => {
        const action = createProposedAction('file_move', 'coder', 'Move file', {
          type: 'file_move',
          oldPath: 'src/old.ts',
          newPath: 'src/new.ts',
        } as FileMoveDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(true);
        expect(result.messages[0]).toContain('src/old.ts');
        expect(result.messages[0]).toContain('src/new.ts');
      });

      it('should reject move with missing paths', () => {
        const action = createProposedAction('file_move', 'coder', 'Move file', {
          type: 'file_move',
          oldPath: '',
          newPath: 'src/new.ts',
        } as FileMoveDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(false);
        expect(result.messages).toContain('Chemins source et destination requis');
      });

      it('should reject move with .. in paths', () => {
        const action = createProposedAction('file_move', 'coder', 'Move file', {
          type: 'file_move',
          oldPath: 'src/file.ts',
          newPath: '../outside/file.ts',
        } as FileMoveDetails);

        const result = validateAction(action);

        expect(result.valid).toBe(false);
        expect(result.messages).toContain('Chemins invalides');
      });
    });
  });

  describe('generateActionId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateActionId();
      const id2 = generateActionId();

      expect(id1).not.toBe(id2);
    });

    it('should start with "action-"', () => {
      const id = generateActionId();

      expect(id.startsWith('action-')).toBe(true);
    });

    it('should contain timestamp', () => {
      const before = Date.now();
      const id = generateActionId();
      const after = Date.now();

      const parts = id.split('-');
      const timestamp = parseInt(parts[1], 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('generateBatchId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateBatchId();
      const id2 = generateBatchId();

      expect(id1).not.toBe(id2);
    });

    it('should start with "batch-"', () => {
      const id = generateBatchId();

      expect(id.startsWith('batch-')).toBe(true);
    });
  });

  describe('createProposedAction', () => {
    it('should create action with correct properties', () => {
      const action = createProposedAction('file_create', 'coder', 'Test action', {
        type: 'file_create',
        path: 'test.ts',
        content: '',
        lineCount: 0,
      } as FileCreateDetails);

      expect(action.id).toBeDefined();
      expect(action.type).toBe('file_create');
      expect(action.agent).toBe('coder');
      expect(action.description).toBe('Test action');
      expect(action.status).toBe('pending');
      expect(action.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('createActionBatch', () => {
    it('should create batch with correct properties', () => {
      const action1 = createProposedAction('file_create', 'coder', 'Create', {
        type: 'file_create',
        path: 'a.ts',
        content: '',
        lineCount: 0,
      } as FileCreateDetails);

      const action2 = createProposedAction('file_modify', 'coder', 'Modify', {
        type: 'file_modify',
        path: 'b.ts',
        oldContent: '',
        newContent: '',
        linesAdded: 0,
        linesRemoved: 0,
      } as FileModifyDetails);

      const batch = createActionBatch('coder', [action1, action2], 'Test batch');

      expect(batch.id.startsWith('batch-')).toBe(true);
      expect(batch.agent).toBe('coder');
      expect(batch.actions).toHaveLength(2);
      expect(batch.description).toBe('Test batch');
      expect(batch.status).toBe('pending');
      expect(batch.createdAt).toBeInstanceOf(Date);
    });
  });

  describe('getBatchStats', () => {
    it('should calculate correct statistics', () => {
      const actions = [
        createProposedAction('file_create', 'coder', '', {
          type: 'file_create',
          path: 'a.ts',
          content: '',
          lineCount: 50,
        } as FileCreateDetails),
        createProposedAction('file_create', 'coder', '', {
          type: 'file_create',
          path: 'b.ts',
          content: '',
          lineCount: 30,
        } as FileCreateDetails),
        createProposedAction('file_modify', 'coder', '', {
          type: 'file_modify',
          path: 'c.ts',
          oldContent: '',
          newContent: '',
          linesAdded: 20,
          linesRemoved: 5,
        } as FileModifyDetails),
        createProposedAction('file_delete', 'coder', '', {
          type: 'file_delete',
          path: 'd.ts',
        } as FileDeleteDetails),
        createProposedAction('shell_command', 'builder', '', {
          type: 'shell_command',
          command: 'npm install',
          commandCheck: checkCommand('npm install'),
        } as ShellCommandDetails),
      ];

      const batch = createActionBatch('coder', actions, 'Test');
      const stats = getBatchStats(batch);

      expect(stats.totalActions).toBe(5);
      expect(stats.fileCreations).toBe(2);
      expect(stats.fileModifications).toBe(1);
      expect(stats.fileDeletions).toBe(1);
      expect(stats.shellCommands).toBe(1);
      expect(stats.totalLinesAdded).toBe(100); // 50 + 30 + 20
      expect(stats.totalLinesRemoved).toBe(5);
    });

    it('should handle empty batch', () => {
      const batch = createActionBatch('coder', [], 'Empty');
      const stats = getBatchStats(batch);

      expect(stats.totalActions).toBe(0);
      expect(stats.fileCreations).toBe(0);
      expect(stats.totalLinesAdded).toBe(0);
    });
  });

  describe('formatActionForDisplay', () => {
    it('should format file_create action', () => {
      const action = createProposedAction('file_create', 'coder', '', {
        type: 'file_create',
        path: 'src/test.ts',
        content: '',
        lineCount: 25,
      } as FileCreateDetails);

      const display = formatActionForDisplay(action);

      expect(display).toBe('Créer src/test.ts (25 lignes)');
    });

    it('should format file_modify action', () => {
      const action = createProposedAction('file_modify', 'coder', '', {
        type: 'file_modify',
        path: 'src/test.ts',
        oldContent: '',
        newContent: '',
        linesAdded: 10,
        linesRemoved: 5,
      } as FileModifyDetails);

      const display = formatActionForDisplay(action);

      expect(display).toBe('Modifier src/test.ts (+10/-5)');
    });

    it('should format file_delete action', () => {
      const action = createProposedAction('file_delete', 'coder', '', {
        type: 'file_delete',
        path: 'src/test.ts',
      } as FileDeleteDetails);

      const display = formatActionForDisplay(action);

      expect(display).toBe('Supprimer src/test.ts');
    });

    it('should format shell_command action', () => {
      const action = createProposedAction('shell_command', 'builder', '', {
        type: 'shell_command',
        command: 'npm install lodash',
        commandCheck: checkCommand('npm install lodash'),
      } as ShellCommandDetails);

      const display = formatActionForDisplay(action);

      expect(display).toBe('Exécuter: npm install lodash');
    });

    it('should format directory_create action', () => {
      const action = createProposedAction('directory_create', 'coder', '', {
        type: 'directory_create',
        path: 'src/components',
      } as DirectoryCreateDetails);

      const display = formatActionForDisplay(action);

      expect(display).toBe('Créer dossier src/components');
    });

    it('should format file_move action', () => {
      const action = createProposedAction('file_move', 'coder', '', {
        type: 'file_move',
        oldPath: 'src/old.ts',
        newPath: 'src/new.ts',
      } as FileMoveDetails);

      const display = formatActionForDisplay(action);

      expect(display).toContain('src/old.ts');
      expect(display).toContain('src/new.ts');
    });

    it('should return description for unknown type', () => {
      const action = createProposedAction('unknown' as any, 'coder', 'Custom description', {
        type: 'unknown' as any,
      } as any);

      const display = formatActionForDisplay(action);

      expect(display).toBe('Custom description');
    });
  });

  describe('getActionIcon', () => {
    it('should return correct icons for each action type', () => {
      expect(getActionIcon('file_create')).toBe('i-ph:file-plus');
      expect(getActionIcon('file_modify')).toBe('i-ph:pencil-simple');
      expect(getActionIcon('file_delete')).toBe('i-ph:trash');
      expect(getActionIcon('shell_command')).toBe('i-ph:terminal');
      expect(getActionIcon('directory_create')).toBe('i-ph:folder-plus');
      expect(getActionIcon('file_move')).toBe('i-ph:arrows-left-right');
    });

    it('should return default icon for unknown type', () => {
      const icon = getActionIcon('unknown' as any);

      expect(icon).toBeDefined();
    });
  });
});
