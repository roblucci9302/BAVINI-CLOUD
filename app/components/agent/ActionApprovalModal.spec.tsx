import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, className, onClick, ...props }: any, ref: any) => (
      <div ref={ref} className={className} onClick={onClick} {...props}>
        {children}
      </div>
    )),
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock action-validator module
vi.mock('~/lib/agents/security/action-validator', () => ({
  formatActionForDisplay: vi.fn((action) => {
    switch (action.type) {
      case 'file_create':
        return action.details?.path || 'Create file';
      case 'file_modify':
        return action.details?.path || 'Modify file';
      case 'file_delete':
        return action.details?.path || 'Delete file';
      case 'shell_command':
        return action.details?.command || 'Run command';
      default:
        return 'Unknown action';
    }
  }),
  getActionIcon: vi.fn((type) => {
    switch (type) {
      case 'file_create':
        return 'i-ph:file-plus';
      case 'file_modify':
        return 'i-ph:file-text';
      case 'file_delete':
        return 'i-ph:file-minus';
      case 'shell_command':
        return 'i-ph:terminal';
      default:
        return 'i-ph:file';
    }
  }),
  getBatchStats: vi.fn((batch) => ({
    totalActions: batch.actions.length,
    fileCreations: batch.actions.filter((a: any) => a.type === 'file_create').length,
    fileModifications: batch.actions.filter((a: any) => a.type === 'file_modify').length,
    fileDeletions: batch.actions.filter((a: any) => a.type === 'file_delete').length,
    shellCommands: batch.actions.filter((a: any) => a.type === 'shell_command').length,
  })),
}));

// Import after mocks
import { ActionApprovalModal } from './ActionApprovalModal';
import type { PendingActionBatch, ProposedAction } from '~/lib/agents/security/action-validator';

describe('ActionApprovalModal', () => {
  const mockOnApproveAll = vi.fn();
  const mockOnRejectAll = vi.fn();
  const mockOnApproveSelected = vi.fn();
  const mockOnClose = vi.fn();

  const createMockAction = (overrides: Partial<ProposedAction> = {}): ProposedAction => ({
    id: 'action-1',
    type: 'file_create',
    agent: 'coder',
    description: 'Create test file',
    details: {
      type: 'file_create',
      path: '/test/file.ts',
      content: 'const x = 1;',
      lineCount: 1,
    },
    status: 'pending',
    createdAt: new Date(),
    ...overrides,
  });

  const createMockBatch = (actions: ProposedAction[] = [createMockAction()]): PendingActionBatch => ({
    id: 'batch-1',
    agent: 'coder',
    actions,
    description: 'Test batch',
    status: 'pending',
    createdAt: new Date(),
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should not render when isOpen is false', () => {
      render(
        <ActionApprovalModal
          isOpen={false}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      expect(screen.queryByText('Approbation requise')).not.toBeInTheDocument();
    });

    it('should not render when batch is null', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={null}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      expect(screen.queryByText('Approbation requise')).not.toBeInTheDocument();
    });

    it('should render when open with batch', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText('Approbation requise')).toBeInTheDocument();
    });

    it('should show agent name in header', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText("CoderAgent demande l'autorisation")).toBeInTheDocument();
    });

    it('should have displayName set', () => {
      expect(ActionApprovalModal.displayName).toBe('ActionApprovalModal');
    });
  });

  describe('stats display', () => {
    it('should show total actions count', () => {
      const batch = createMockBatch([
        createMockAction({ id: '1' }),
        createMockAction({ id: '2' }),
        createMockAction({ id: '3' }),
      ]);

      render(
        <ActionApprovalModal
          isOpen={true}
          batch={batch}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText('3 actions')).toBeInTheDocument();
    });

    it('should show file creations count', () => {
      const batch = createMockBatch([
        createMockAction({ id: '1', type: 'file_create' }),
        createMockAction({ id: '2', type: 'file_create' }),
      ]);

      render(
        <ActionApprovalModal
          isOpen={true}
          batch={batch}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText('+2 fichiers')).toBeInTheDocument();
    });
  });

  describe('action items', () => {
    it('should render action items', () => {
      const batch = createMockBatch([
        createMockAction({
          id: '1',
          type: 'file_create',
          details: { type: 'file_create', path: '/src/test.ts', content: '', lineCount: 0 },
        }),
      ]);

      render(
        <ActionApprovalModal
          isOpen={true}
          batch={batch}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText('Créer')).toBeInTheDocument();
    });

    it('should show action type badges', () => {
      const batch = createMockBatch([
        createMockAction({ id: '1', type: 'file_create' }),
        createMockAction({ id: '2', type: 'file_modify' }),
        createMockAction({
          id: '3',
          type: 'shell_command',
          details: {
            type: 'shell_command',
            command: 'npm install',
            commandCheck: { command: 'npm install', level: 'allowed', allowed: true, message: 'Command allowed' },
          },
        }),
      ]);

      render(
        <ActionApprovalModal
          isOpen={true}
          batch={batch}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText('Créer')).toBeInTheDocument();
      expect(screen.getByText('Modifier')).toBeInTheDocument();
      expect(screen.getByText('Commande')).toBeInTheDocument();
    });
  });

  describe('selection controls', () => {
    it('should have select all button', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText('Tout sélectionner')).toBeInTheDocument();
    });

    it('should have deselect all button', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText('Tout désélectionner')).toBeInTheDocument();
    });

    it('should show selection count', () => {
      const batch = createMockBatch([createMockAction({ id: '1' }), createMockAction({ id: '2' })]);

      render(
        <ActionApprovalModal
          isOpen={true}
          batch={batch}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      // Initially all selected
      expect(screen.getByText('2/2 sélectionnés')).toBeInTheDocument();
    });
  });

  describe('action buttons', () => {
    it('should have reject all button', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText('Tout refuser')).toBeInTheDocument();
    });

    it('should have approve all button', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText('Tout approuver')).toBeInTheDocument();
    });

    it('should call onApproveAll when approve all clicked', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      fireEvent.click(screen.getByText('Tout approuver'));

      expect(mockOnApproveAll).toHaveBeenCalled();
    });

    it('should call onRejectAll when reject all clicked', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      fireEvent.click(screen.getByText('Tout refuser'));

      expect(mockOnRejectAll).toHaveBeenCalled();
    });
  });

  describe('processing state', () => {
    it('should show processing text when processing', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
          isProcessing={true}
        />,
      );

      expect(screen.getByText('Traitement...')).toBeInTheDocument();
    });

    it('should disable buttons when processing', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
          isProcessing={true}
        />,
      );

      const approveButton = screen.getByText('Traitement...').closest('button');
      expect(approveButton).toBeDisabled();
    });
  });

  describe('close functionality', () => {
    it('should call onClose when close button clicked', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      // Find and click the close button (X icon)
      const closeButtons = screen.getAllByRole('button');
      const closeButton = closeButtons.find((btn) => btn.querySelector('.i-ph\\:x'));

      if (closeButton) {
        fireEvent.click(closeButton);
      }

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when backdrop clicked', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      // Click on the backdrop (first motion.div with bg-black)
      const backdrop = document.querySelector('.bg-black\\/60');

      if (backdrop) {
        fireEvent.click(backdrop);
      }

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('props defaults', () => {
    it('should default isProcessing to false', () => {
      render(
        <ActionApprovalModal
          isOpen={true}
          batch={createMockBatch()}
          onApproveAll={mockOnApproveAll}
          onRejectAll={mockOnRejectAll}
          onApproveSelected={mockOnApproveSelected}
          onClose={mockOnClose}
        />,
      );

      expect(screen.getByText('Tout approuver')).toBeInTheDocument();
      expect(screen.queryByText('Traitement...')).not.toBeInTheDocument();
    });
  });
});
