import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Use vi.hoisted to define mock functions that are used in vi.mock factories
const { mockApproveAll, mockApproveSelected, mockRejectAll, mockCloseModal, mockUseAgentApproval } = vi.hoisted(() => ({
  mockApproveAll: vi.fn(),
  mockApproveSelected: vi.fn(),
  mockRejectAll: vi.fn(),
  mockCloseModal: vi.fn(),
  mockUseAgentApproval: vi.fn(),
}));

// Mock AgentSystemProvider hooks
vi.mock('./AgentSystemProvider', () => ({
  useAgentApproval: () => mockUseAgentApproval(),
}));

// Mock ActionApprovalModal component
vi.mock('~/components/agent/ActionApprovalModal', () => ({
  ActionApprovalModal: ({
    isOpen,
    batch,
    onApproveAll,
    onApproveSelected,
    onRejectAll,
    onClose,
    isProcessing,
  }: {
    isOpen: boolean;
    batch: unknown;
    onApproveAll: () => void;
    onApproveSelected: (actionIds: string[]) => void;
    onRejectAll: () => void;
    onClose: () => void;
    isProcessing?: boolean;
  }) =>
    isOpen && batch ? (
      <div data-testid="action-approval-modal" data-is-processing={isProcessing}>
        <button data-testid="approve-all" onClick={onApproveAll}>
          Approve All
        </button>
        <button data-testid="approve-selected" onClick={() => onApproveSelected(['action-1', 'action-2'])}>
          Approve Selected
        </button>
        <button data-testid="approve-selected-empty" onClick={() => onApproveSelected([])}>
          Approve None
        </button>
        <button data-testid="reject-all" onClick={onRejectAll}>
          Reject All
        </button>
        <button data-testid="close-modal" onClick={onClose}>
          Close
        </button>
      </div>
    ) : null,
}));

// Import after mocks
import { AgentApprovalWrapper } from './AgentApprovalWrapper';

describe('AgentApprovalWrapper', () => {
  const mockOnBatchProcessed = vi.fn();
  const mockPendingBatch = {
    id: 'batch-1',
    agent: 'coder',
    actions: [
      { id: 'action-1', type: 'file_create', status: 'pending' },
      { id: 'action-2', type: 'file_modify', status: 'pending' },
    ],
    description: 'Test batch',
    status: 'pending',
    createdAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAgentApproval.mockReturnValue({
      pendingBatch: mockPendingBatch,
      isModalOpen: true,
      approveAll: mockApproveAll,
      approveSelected: mockApproveSelected,
      rejectAll: mockRejectAll,
      closeModal: mockCloseModal,
    });
  });

  describe('rendering', () => {
    it('should render modal when isModalOpen is true and batch exists', () => {
      render(<AgentApprovalWrapper />);

      expect(screen.getByTestId('action-approval-modal')).toBeInTheDocument();
    });

    it('should not render modal when isModalOpen is false', () => {
      mockUseAgentApproval.mockReturnValue({
        pendingBatch: mockPendingBatch,
        isModalOpen: false,
        approveAll: mockApproveAll,
        approveSelected: mockApproveSelected,
        rejectAll: mockRejectAll,
        closeModal: mockCloseModal,
      });

      render(<AgentApprovalWrapper />);

      expect(screen.queryByTestId('action-approval-modal')).not.toBeInTheDocument();
    });

    it('should not render modal when pendingBatch is null', () => {
      mockUseAgentApproval.mockReturnValue({
        pendingBatch: null,
        isModalOpen: true,
        approveAll: mockApproveAll,
        approveSelected: mockApproveSelected,
        rejectAll: mockRejectAll,
        closeModal: mockCloseModal,
      });

      render(<AgentApprovalWrapper />);

      expect(screen.queryByTestId('action-approval-modal')).not.toBeInTheDocument();
    });

    it('should render with onBatchProcessed callback', () => {
      render(<AgentApprovalWrapper onBatchProcessed={mockOnBatchProcessed} />);

      expect(screen.getByTestId('action-approval-modal')).toBeInTheDocument();
    });
  });

  describe('approve all functionality', () => {
    it('should call approveAll when approve all button is clicked', () => {
      render(<AgentApprovalWrapper />);

      fireEvent.click(screen.getByTestId('approve-all'));

      expect(mockApproveAll).toHaveBeenCalled();
    });

    it('should call closeModal after approveAll', () => {
      render(<AgentApprovalWrapper />);

      fireEvent.click(screen.getByTestId('approve-all'));

      expect(mockCloseModal).toHaveBeenCalled();
    });

    it('should call onBatchProcessed with true after approveAll', () => {
      render(<AgentApprovalWrapper onBatchProcessed={mockOnBatchProcessed} />);

      fireEvent.click(screen.getByTestId('approve-all'));

      expect(mockOnBatchProcessed).toHaveBeenCalledWith(true);
    });

    it('should handle approveAll without onBatchProcessed callback', () => {
      render(<AgentApprovalWrapper />);

      expect(() => {
        fireEvent.click(screen.getByTestId('approve-all'));
      }).not.toThrow();

      expect(mockApproveAll).toHaveBeenCalled();
      expect(mockCloseModal).toHaveBeenCalled();
    });
  });

  describe('approve selected functionality', () => {
    it('should call approveSelected with action IDs', () => {
      render(<AgentApprovalWrapper />);

      fireEvent.click(screen.getByTestId('approve-selected'));

      expect(mockApproveSelected).toHaveBeenCalledWith(['action-1', 'action-2']);
    });

    it('should call closeModal after approveSelected', () => {
      render(<AgentApprovalWrapper />);

      fireEvent.click(screen.getByTestId('approve-selected'));

      expect(mockCloseModal).toHaveBeenCalled();
    });

    it('should call onBatchProcessed with true when actions are selected', () => {
      render(<AgentApprovalWrapper onBatchProcessed={mockOnBatchProcessed} />);

      fireEvent.click(screen.getByTestId('approve-selected'));

      expect(mockOnBatchProcessed).toHaveBeenCalledWith(true);
    });

    it('should call onBatchProcessed with false when no actions are selected', () => {
      render(<AgentApprovalWrapper onBatchProcessed={mockOnBatchProcessed} />);

      fireEvent.click(screen.getByTestId('approve-selected-empty'));

      expect(mockOnBatchProcessed).toHaveBeenCalledWith(false);
    });

    it('should handle approveSelected without onBatchProcessed callback', () => {
      render(<AgentApprovalWrapper />);

      expect(() => {
        fireEvent.click(screen.getByTestId('approve-selected'));
      }).not.toThrow();

      expect(mockApproveSelected).toHaveBeenCalled();
      expect(mockCloseModal).toHaveBeenCalled();
    });
  });

  describe('reject all functionality', () => {
    it('should call rejectAll when reject all button is clicked', () => {
      render(<AgentApprovalWrapper />);

      fireEvent.click(screen.getByTestId('reject-all'));

      expect(mockRejectAll).toHaveBeenCalled();
    });

    it('should call closeModal after rejectAll', () => {
      render(<AgentApprovalWrapper />);

      fireEvent.click(screen.getByTestId('reject-all'));

      expect(mockCloseModal).toHaveBeenCalled();
    });

    it('should call onBatchProcessed with false after rejectAll', () => {
      render(<AgentApprovalWrapper onBatchProcessed={mockOnBatchProcessed} />);

      fireEvent.click(screen.getByTestId('reject-all'));

      expect(mockOnBatchProcessed).toHaveBeenCalledWith(false);
    });

    it('should handle rejectAll without onBatchProcessed callback', () => {
      render(<AgentApprovalWrapper />);

      expect(() => {
        fireEvent.click(screen.getByTestId('reject-all'));
      }).not.toThrow();

      expect(mockRejectAll).toHaveBeenCalled();
      expect(mockCloseModal).toHaveBeenCalled();
    });
  });

  describe('close functionality', () => {
    it('should call rejectAll when modal is closed', () => {
      render(<AgentApprovalWrapper />);

      fireEvent.click(screen.getByTestId('close-modal'));

      expect(mockRejectAll).toHaveBeenCalled();
    });

    it('should call closeModal when modal is closed', () => {
      render(<AgentApprovalWrapper />);

      fireEvent.click(screen.getByTestId('close-modal'));

      expect(mockCloseModal).toHaveBeenCalled();
    });

    it('should call onBatchProcessed with false when modal is closed', () => {
      render(<AgentApprovalWrapper onBatchProcessed={mockOnBatchProcessed} />);

      fireEvent.click(screen.getByTestId('close-modal'));

      expect(mockOnBatchProcessed).toHaveBeenCalledWith(false);
    });

    it('should handle close without onBatchProcessed callback', () => {
      render(<AgentApprovalWrapper />);

      expect(() => {
        fireEvent.click(screen.getByTestId('close-modal'));
      }).not.toThrow();

      expect(mockRejectAll).toHaveBeenCalled();
      expect(mockCloseModal).toHaveBeenCalled();
    });
  });

  describe('processing state', () => {
    it('should pass isProcessing=false initially', () => {
      render(<AgentApprovalWrapper />);

      const modal = screen.getByTestId('action-approval-modal');
      expect(modal).toHaveAttribute('data-is-processing', 'false');
    });

    it('should reset isProcessing after approve all completes', () => {
      render(<AgentApprovalWrapper />);

      fireEvent.click(screen.getByTestId('approve-all'));

      // After synchronous operation completes, isProcessing should be back to false
      const modal = screen.queryByTestId('action-approval-modal');

      // Modal might be closed, but if visible, should not be processing
      if (modal) {
        expect(modal).toHaveAttribute('data-is-processing', 'false');
      }
    });

    it('should reset isProcessing after approve selected completes', () => {
      render(<AgentApprovalWrapper />);

      fireEvent.click(screen.getByTestId('approve-selected'));

      const modal = screen.queryByTestId('action-approval-modal');
      if (modal) {
        expect(modal).toHaveAttribute('data-is-processing', 'false');
      }
    });

    it('should reset isProcessing after reject all completes', () => {
      render(<AgentApprovalWrapper />);

      fireEvent.click(screen.getByTestId('reject-all'));

      const modal = screen.queryByTestId('action-approval-modal');
      if (modal) {
        expect(modal).toHaveAttribute('data-is-processing', 'false');
      }
    });
  });

  describe('edge cases', () => {
    it('should handle undefined pendingBatch', () => {
      mockUseAgentApproval.mockReturnValue({
        pendingBatch: undefined,
        isModalOpen: true,
        approveAll: mockApproveAll,
        approveSelected: mockApproveSelected,
        rejectAll: mockRejectAll,
        closeModal: mockCloseModal,
      });

      render(<AgentApprovalWrapper />);

      expect(screen.queryByTestId('action-approval-modal')).not.toBeInTheDocument();
    });

    it('should handle empty actions in batch', () => {
      mockUseAgentApproval.mockReturnValue({
        pendingBatch: { ...mockPendingBatch, actions: [] },
        isModalOpen: true,
        approveAll: mockApproveAll,
        approveSelected: mockApproveSelected,
        rejectAll: mockRejectAll,
        closeModal: mockCloseModal,
      });

      render(<AgentApprovalWrapper />);

      expect(screen.getByTestId('action-approval-modal')).toBeInTheDocument();
    });

    it('should handle multiple rapid clicks on approve all', () => {
      render(<AgentApprovalWrapper onBatchProcessed={mockOnBatchProcessed} />);

      fireEvent.click(screen.getByTestId('approve-all'));
      fireEvent.click(screen.getByTestId('approve-all'));
      fireEvent.click(screen.getByTestId('approve-all'));

      // Each click should trigger the handlers
      expect(mockApproveAll).toHaveBeenCalledTimes(3);
      expect(mockCloseModal).toHaveBeenCalledTimes(3);
      expect(mockOnBatchProcessed).toHaveBeenCalledTimes(3);
    });

    it('should handle modal state changes', () => {
      const { rerender } = render(<AgentApprovalWrapper />);
      expect(screen.getByTestId('action-approval-modal')).toBeInTheDocument();

      // Simulate modal closing
      mockUseAgentApproval.mockReturnValue({
        pendingBatch: mockPendingBatch,
        isModalOpen: false,
        approveAll: mockApproveAll,
        approveSelected: mockApproveSelected,
        rejectAll: mockRejectAll,
        closeModal: mockCloseModal,
      });

      rerender(<AgentApprovalWrapper />);
      expect(screen.queryByTestId('action-approval-modal')).not.toBeInTheDocument();

      // Simulate modal reopening
      mockUseAgentApproval.mockReturnValue({
        pendingBatch: mockPendingBatch,
        isModalOpen: true,
        approveAll: mockApproveAll,
        approveSelected: mockApproveSelected,
        rejectAll: mockRejectAll,
        closeModal: mockCloseModal,
      });

      rerender(<AgentApprovalWrapper />);
      expect(screen.getByTestId('action-approval-modal')).toBeInTheDocument();
    });
  });

  describe('callback order', () => {
    it('should call approveAll before closeModal for approve all', () => {
      const callOrder: string[] = [];
      mockApproveAll.mockImplementation(() => callOrder.push('approveAll'));
      mockCloseModal.mockImplementation(() => callOrder.push('closeModal'));

      render(<AgentApprovalWrapper />);
      fireEvent.click(screen.getByTestId('approve-all'));

      expect(callOrder).toEqual(['approveAll', 'closeModal']);
    });

    it('should call approveSelected before closeModal for approve selected', () => {
      const callOrder: string[] = [];
      mockApproveSelected.mockImplementation(() => callOrder.push('approveSelected'));
      mockCloseModal.mockImplementation(() => callOrder.push('closeModal'));

      render(<AgentApprovalWrapper />);
      fireEvent.click(screen.getByTestId('approve-selected'));

      expect(callOrder).toEqual(['approveSelected', 'closeModal']);
    });

    it('should call rejectAll before closeModal for reject all', () => {
      const callOrder: string[] = [];
      mockRejectAll.mockImplementation(() => callOrder.push('rejectAll'));
      mockCloseModal.mockImplementation(() => callOrder.push('closeModal'));

      render(<AgentApprovalWrapper />);
      fireEvent.click(screen.getByTestId('reject-all'));

      expect(callOrder).toEqual(['rejectAll', 'closeModal']);
    });

    it('should call rejectAll before closeModal for close', () => {
      const callOrder: string[] = [];
      mockRejectAll.mockImplementation(() => callOrder.push('rejectAll'));
      mockCloseModal.mockImplementation(() => callOrder.push('closeModal'));

      render(<AgentApprovalWrapper />);
      fireEvent.click(screen.getByTestId('close-modal'));

      expect(callOrder).toEqual(['rejectAll', 'closeModal']);
    });
  });
});
