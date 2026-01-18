'use client';

import { memo, type ReactNode } from 'react';
import { useStore } from '@nanostores/react';
import { selectedDeviceId, deviceOrientation } from '~/lib/stores/previews';
import './DeviceFrame.css';

interface DeviceFrameProps {
  children: ReactNode;
}

/**
 * DeviceFrame - Smooth morphing device preview
 *
 * Uses pure CSS transitions for smooth animations:
 * - Class-based state changes (no React re-renders during animation)
 * - Fixed visual sizes defined in CSS
 * - Easing: cubic-bezier(0.22, 1, 0.36, 1) for organic feel
 */
export const DeviceFrame = memo(({ children }: DeviceFrameProps) => {
  const currentDeviceId = useStore(selectedDeviceId);
  const orientation = useStore(deviceOrientation);

  // Build class string
  const isLandscape = orientation === 'landscape';
  const containerClass = `device-frame-container ${currentDeviceId}${isLandscape ? ' landscape' : ''}`;

  return (
    <div className="device-frame-wrapper">
      <div className={containerClass}>
        <div className="device-frame-shell">
          <div className="device-frame-screen">
            {children}
          </div>
          <div className="device-frame-notch" />
          <div className="device-frame-home-bar" />
        </div>
      </div>
    </div>
  );
});

DeviceFrame.displayName = 'DeviceFrame';
