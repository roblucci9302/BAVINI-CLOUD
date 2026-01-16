import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

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

// Mock devices utility
vi.mock('~/utils/devices', () => ({
  DEVICE_PRESETS: [
    { id: 'desktop', name: 'Bureau', type: 'desktop', icon: 'i-ph:desktop', width: 1920, height: 1080 },
    { id: 'tablet', name: 'Tablette', type: 'tablet', icon: 'i-ph:device-tablet', width: 768, height: 1024 },
    { id: 'mobile', name: 'Mobile', type: 'mobile', icon: 'i-ph:device-mobile', width: 375, height: 812 },
  ],
  getDeviceDimensions: vi.fn((device, orientation) => {
    if (orientation === 'landscape') {
      return { width: device.height, height: device.width };
    }

    return { width: device.width, height: device.height };
  }),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: React.forwardRef(({ children, className, style, ...props }: any, ref: any) => (
      <div ref={ref} className={className} style={style} {...props}>
        {children}
      </div>
    )),
  },
  cubicBezier: () => (t: number) => t,
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
  });

  describe('desktop mode', () => {
    /*
     * Note: DeviceFrame now always renders the same DOM structure to prevent iframe remounting.
     * The frame decorations are hidden with CSS opacity in desktop mode.
     */

    it('should render full width/height container for desktop', () => {
      mockSelectedDeviceId.set('desktop');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('w-full', 'h-full');
    });

    it('should not render device frame decorations for desktop', () => {
      mockSelectedDeviceId.set('desktop');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      // Frame decorations are not rendered at all in desktop mode (simple conditional rendering)
      const frameDecoration = container.querySelector('.rounded-\\[40px\\]');
      expect(frameDecoration).not.toBeInTheDocument();
    });
  });

  describe('tablet mode', () => {
    it('should render device frame for tablet', () => {
      mockSelectedDeviceId.set('tablet');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      // Should have device frame styling
      expect(container.querySelector('.rounded-\\[40px\\]')).toBeInTheDocument();
    });

    it('should set correct dimensions for tablet portrait', () => {
      mockSelectedDeviceId.set('tablet');
      mockDeviceOrientation.set('portrait');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      const screen = container.querySelector('.rounded-\\[28px\\]') as HTMLElement;
      expect(screen?.style.width).toBe('768px');
      expect(screen?.style.height).toBe('1024px');
    });
  });

  describe('mobile mode', () => {
    it('should render device frame for mobile', () => {
      mockSelectedDeviceId.set('mobile');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      expect(container.querySelector('.rounded-\\[40px\\]')).toBeInTheDocument();
    });

    it('should show home indicator for mobile', () => {
      mockSelectedDeviceId.set('mobile');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      // Home indicator styling - uses bg-gray-400 dark:bg-gray-700 rounded-full
      const homeIndicator = container.querySelector('.w-24.h-1.rounded-full');
      expect(homeIndicator).toBeInTheDocument();
    });

    it('should not render home indicator for tablet', () => {
      mockSelectedDeviceId.set('tablet');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      // Home indicator is only rendered for mobile, not tablet (conditional rendering)
      const homeIndicator = container.querySelector('.w-24.h-1.rounded-full');
      expect(homeIndicator).not.toBeInTheDocument();
    });
  });

  describe('orientation', () => {
    it('should swap dimensions in landscape mode', () => {
      mockSelectedDeviceId.set('mobile');
      mockDeviceOrientation.set('landscape');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      const screenEl = container.querySelector('.rounded-\\[28px\\]') as HTMLElement;

      // In landscape, width and height are swapped
      expect(screenEl?.style.width).toBe('812px');
      expect(screenEl?.style.height).toBe('375px');
    });
  });

  describe('unknown device', () => {
    it('should render full width/height for unknown device', () => {
      mockSelectedDeviceId.set('unknown-device');

      const { container } = render(
        <DeviceFrame>
          <div>Content</div>
        </DeviceFrame>,
      );

      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper).toHaveClass('w-full', 'h-full');
    });
  });
});
