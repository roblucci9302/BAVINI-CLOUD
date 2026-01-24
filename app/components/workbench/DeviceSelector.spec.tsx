import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  DEFAULT_DEVICE_ID: 'desktop',
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    span: ({ children, className, ...props }: any) => (
      <span className={className} {...props}>
        {children}
      </span>
    ),
  },
  cubicBezier: () => (t: number) => t,
}));

// Import after mocks
import { DeviceSelector } from './DeviceSelector';

describe('DeviceSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectedDeviceId.set('desktop');
    mockDeviceOrientation.set('portrait');
  });

  describe('rendering', () => {
    it('should render device buttons', () => {
      render(<DeviceSelector />);

      expect(screen.getByTitle('Bureau')).toBeInTheDocument();
      expect(screen.getByTitle('Tablette')).toBeInTheDocument();
      expect(screen.getByTitle('Mobile')).toBeInTheDocument();
    });

    it('should have displayName set', () => {
      expect(DeviceSelector.displayName).toBe('DeviceSelector');
    });
  });

  describe('device selection', () => {
    it('should select desktop by default', () => {
      render(<DeviceSelector />);

      const desktopButton = screen.getByTitle('Bureau');

      // Desktop should be selected (has purple accent color)
      expect(desktopButton.className).toContain('text-[#8b5cf6]');
    });

    it('should select device on click', () => {
      render(<DeviceSelector />);

      fireEvent.click(screen.getByTitle('Tablette'));

      expect(mockSelectedDeviceId.get()).toBe('tablet');
    });

    it('should reset orientation when switching to desktop from mobile', () => {
      // Start with mobile selected in landscape
      mockSelectedDeviceId.set('mobile');
      mockDeviceOrientation.set('landscape');

      render(<DeviceSelector />);

      // Click desktop - should reset orientation since type changes
      fireEvent.click(screen.getByTitle('Bureau'));

      expect(mockDeviceOrientation.get()).toBe('portrait');
    });
  });

  describe('rotation button', () => {
    it('should not show rotation button for desktop', () => {
      mockSelectedDeviceId.set('desktop');

      render(<DeviceSelector />);

      expect(screen.queryByTitle('Paysage')).not.toBeInTheDocument();
      expect(screen.queryByTitle('Portrait')).not.toBeInTheDocument();
    });

    it('should show rotation button for tablet', () => {
      mockSelectedDeviceId.set('tablet');

      render(<DeviceSelector />);

      expect(screen.getByTitle('Paysage')).toBeInTheDocument();
    });

    it('should show rotation button for mobile', () => {
      mockSelectedDeviceId.set('mobile');

      render(<DeviceSelector />);

      expect(screen.getByTitle('Paysage')).toBeInTheDocument();
    });

    it('should toggle orientation on click', () => {
      mockSelectedDeviceId.set('tablet');
      mockDeviceOrientation.set('portrait');

      render(<DeviceSelector />);

      fireEvent.click(screen.getByTitle('Paysage'));

      expect(mockDeviceOrientation.get()).toBe('landscape');
    });

    it('should show correct title based on orientation', () => {
      mockSelectedDeviceId.set('tablet');
      mockDeviceOrientation.set('landscape');

      render(<DeviceSelector />);

      expect(screen.getByTitle('Portrait')).toBeInTheDocument();
    });
  });

  describe('visual indicators', () => {
    it('should show selected device with accent color', () => {
      mockSelectedDeviceId.set('tablet');

      render(<DeviceSelector />);

      const tabletButton = screen.getByTitle('Tablette');
      expect(tabletButton.className).toContain('text-[#8b5cf6]');
    });

    it('should show unselected device with default color', () => {
      mockSelectedDeviceId.set('desktop');

      render(<DeviceSelector />);

      const tabletButton = screen.getByTitle('Tablette');
      expect(tabletButton.className).toContain('text-bolt-elements-textTertiary');
    });
  });
});
