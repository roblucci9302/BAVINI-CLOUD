import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// Create mock stores
const { mockSelectedDeviceId, mockDeviceOrientation } = vi.hoisted(() => {
  const { atom } = require('nanostores');
  return {
    mockSelectedDeviceId: atom('desktop'),
    mockDeviceOrientation: atom('portrait'),
  };
});

// Mock stores
vi.mock('~/lib/stores/previews', () => ({
  selectedDeviceId: mockSelectedDeviceId,
  deviceOrientation: mockDeviceOrientation,
}));

// Import after mocks
import { DeviceFrame } from './DeviceFrame';

describe('DeviceFrame', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedDeviceId.set('desktop');
    mockDeviceOrientation.set('portrait');
  });

  describe('rendering', () => {
    it('should render children', () => {
      render(
        <DeviceFrame>
          <div data-testid="child-content">Child Content</div>
        </DeviceFrame>,
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
    });

    it('should have displayName set', () => {
      expect(DeviceFrame.displayName).toBe('DeviceFrame');
    });

    it('should always render the same DOM structure', () => {
      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      // All elements should always be present (CSS handles visibility)
      expect(container.querySelector('.device-frame-wrapper')).toBeInTheDocument();
      expect(container.querySelector('.device-frame-container')).toBeInTheDocument();
      expect(container.querySelector('.device-frame-shell')).toBeInTheDocument();
      expect(container.querySelector('.device-frame-screen')).toBeInTheDocument();
      expect(container.querySelector('.device-frame-notch')).toBeInTheDocument();
      expect(container.querySelector('.device-frame-home-bar')).toBeInTheDocument();
    });
  });

  describe('desktop mode', () => {
    it('should have desktop class on container', () => {
      mockSelectedDeviceId.set('desktop');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      const frameContainer = container.querySelector('.device-frame-container');
      expect(frameContainer).toHaveClass('desktop');
    });

    it('should not have landscape class in portrait mode', () => {
      mockSelectedDeviceId.set('desktop');
      mockDeviceOrientation.set('portrait');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      const frameContainer = container.querySelector('.device-frame-container');
      expect(frameContainer).not.toHaveClass('landscape');
    });
  });

  describe('tablet mode', () => {
    it('should have tablet class on container', () => {
      mockSelectedDeviceId.set('tablet');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      const frameContainer = container.querySelector('.device-frame-container');
      expect(frameContainer).toHaveClass('tablet');
    });
  });

  describe('mobile mode', () => {
    it('should have mobile class on container', () => {
      mockSelectedDeviceId.set('mobile');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      const frameContainer = container.querySelector('.device-frame-container');
      expect(frameContainer).toHaveClass('mobile');
    });
  });

  describe('orientation', () => {
    it('should have landscape class when orientation is landscape', () => {
      mockSelectedDeviceId.set('mobile');
      mockDeviceOrientation.set('landscape');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      const frameContainer = container.querySelector('.device-frame-container');
      expect(frameContainer).toHaveClass('landscape');
    });

    it('should not have landscape class when orientation is portrait', () => {
      mockSelectedDeviceId.set('mobile');
      mockDeviceOrientation.set('portrait');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      const frameContainer = container.querySelector('.device-frame-container');
      expect(frameContainer).not.toHaveClass('landscape');
    });
  });

  describe('custom device', () => {
    it('should apply custom device id as class', () => {
      mockSelectedDeviceId.set('iphone-15-pro');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      const frameContainer = container.querySelector('.device-frame-container');
      expect(frameContainer).toHaveClass('iphone-15-pro');
    });
  });
});
