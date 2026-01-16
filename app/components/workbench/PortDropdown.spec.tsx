import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Mock IconButton
vi.mock('~/components/ui/IconButton', () => ({
  IconButton: ({ icon, title, onClick }: any) => (
    <button onClick={onClick} title={title} data-testid="icon-button">
      <span className={icon} />
    </button>
  ),
}));

// Import after mocks
import { PortDropdown } from './PortDropdown';
import type { PreviewInfo } from '~/lib/stores/previews';

describe('PortDropdown', () => {
  const mockSetActivePreviewIndex = vi.fn();
  const mockSetIsDropdownOpen = vi.fn();
  const mockSetHasSelectedPreview = vi.fn();

  const defaultPreviews: PreviewInfo[] = [
    { port: 3000, baseUrl: 'http://localhost:3000', ready: true },
    { port: 5173, baseUrl: 'http://localhost:5173', ready: true },
    { port: 8080, baseUrl: 'http://localhost:8080', ready: false },
  ];

  const defaultProps = {
    activePreviewIndex: 0,
    setActivePreviewIndex: mockSetActivePreviewIndex,
    isDropdownOpen: false,
    setIsDropdownOpen: mockSetIsDropdownOpen,
    setHasSelectedPreview: mockSetHasSelectedPreview,
    previews: defaultPreviews,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('should render toggle button', () => {
      render(<PortDropdown {...defaultProps} />);

      expect(screen.getByTitle('Sélectionner un port')).toBeInTheDocument();
    });

    it('should not show dropdown when closed', () => {
      render(<PortDropdown {...defaultProps} isDropdownOpen={false} />);

      expect(screen.queryByText('Ports')).not.toBeInTheDocument();
    });

    it('should show dropdown when open', () => {
      render(<PortDropdown {...defaultProps} isDropdownOpen={true} />);

      expect(screen.getByText('Ports')).toBeInTheDocument();
    });
  });

  describe('dropdown content', () => {
    it('should show all port options', () => {
      render(<PortDropdown {...defaultProps} isDropdownOpen={true} />);

      expect(screen.getByText('3000')).toBeInTheDocument();
      expect(screen.getByText('5173')).toBeInTheDocument();
      expect(screen.getByText('8080')).toBeInTheDocument();
    });

    it('should sort ports by port number', () => {
      const unsortedPreviews: PreviewInfo[] = [
        { port: 8080, baseUrl: 'http://localhost:8080', ready: true },
        { port: 3000, baseUrl: 'http://localhost:3000', ready: true },
        { port: 5173, baseUrl: 'http://localhost:5173', ready: true },
      ];

      render(<PortDropdown {...defaultProps} previews={unsortedPreviews} isDropdownOpen={true} />);

      const portElements = screen.getAllByText(/^\d+$/);
      const ports = portElements.map((el) => el.textContent);

      expect(ports).toEqual(['3000', '5173', '8080']);
    });

    it('should highlight active preview', () => {
      render(<PortDropdown {...defaultProps} activePreviewIndex={0} isDropdownOpen={true} />);

      const activePort = screen.getByText('3000');
      expect(activePort).toHaveClass('text-bolt-elements-item-contentAccent');
    });
  });

  describe('interaction', () => {
    it('should toggle dropdown on button click', () => {
      render(<PortDropdown {...defaultProps} isDropdownOpen={false} />);

      fireEvent.click(screen.getByTestId('icon-button'));

      expect(mockSetIsDropdownOpen).toHaveBeenCalledWith(true);
    });

    it('should close dropdown on button click when open', () => {
      render(<PortDropdown {...defaultProps} isDropdownOpen={true} />);

      fireEvent.click(screen.getByTestId('icon-button'));

      expect(mockSetIsDropdownOpen).toHaveBeenCalledWith(false);
    });

    it('should select preview on port click', () => {
      render(<PortDropdown {...defaultProps} isDropdownOpen={true} />);

      fireEvent.click(screen.getByText('5173'));

      expect(mockSetActivePreviewIndex).toHaveBeenCalledWith(1);
    });

    it('should close dropdown on port select', () => {
      render(<PortDropdown {...defaultProps} isDropdownOpen={true} />);

      fireEvent.click(screen.getByText('5173'));

      expect(mockSetIsDropdownOpen).toHaveBeenCalledWith(false);
    });

    it('should set hasSelectedPreview on port select', () => {
      render(<PortDropdown {...defaultProps} isDropdownOpen={true} />);

      fireEvent.click(screen.getByText('5173'));

      expect(mockSetHasSelectedPreview).toHaveBeenCalledWith(true);
    });
  });

  describe('outside click', () => {
    it('should close dropdown on outside click', () => {
      const { container } = render(
        <div>
          <div data-testid="outside">Outside</div>
          <PortDropdown {...defaultProps} isDropdownOpen={true} />
        </div>,
      );

      // Simulate click outside
      fireEvent.mouseDown(screen.getByTestId('outside'));

      expect(mockSetIsDropdownOpen).toHaveBeenCalledWith(false);
    });

    it('should not close dropdown on inside click', () => {
      render(<PortDropdown {...defaultProps} isDropdownOpen={true} />);

      // Click on dropdown content
      fireEvent.mouseDown(screen.getByText('Ports'));

      // setIsDropdownOpen should not be called with false for inside click
      const calls = mockSetIsDropdownOpen.mock.calls;
      const closeCalls = calls.filter((call) => call[0] === false);
      expect(closeCalls).toHaveLength(0);
    });
  });

  describe('empty state', () => {
    it('should render with empty previews', () => {
      render(<PortDropdown {...defaultProps} previews={[]} isDropdownOpen={true} />);

      expect(screen.getByText('Ports')).toBeInTheDocument();
    });
  });

  describe('single preview', () => {
    it('should show single port', () => {
      const singlePreview: PreviewInfo[] = [{ port: 3000, baseUrl: 'http://localhost:3000', ready: true }];

      render(<PortDropdown {...defaultProps} previews={singlePreview} isDropdownOpen={true} />);

      expect(screen.getByText('3000')).toBeInTheDocument();
    });
  });
});
