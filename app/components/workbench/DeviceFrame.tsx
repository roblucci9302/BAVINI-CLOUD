'use client';

import { memo, type ReactNode, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { DEVICE_PRESETS, getDeviceDimensions } from '~/utils/devices';
import { selectedDeviceId, deviceOrientation } from '~/lib/stores/previews';

interface DeviceFrameProps {
  children: ReactNode;
}

// Device display configurations (visual sizes, not viewport)
const DEVICE_CONFIGS = {
  desktop: {
    scale: 1,
    frameRadius: 8,
    screenRadius: 4,
    padding: 0,
    showFrame: false,
  },
  tablet: {
    scale: 0.55,
    frameRadius: 36,
    screenRadius: 24,
    padding: 14,
    showFrame: true,
  },
  mobile: {
    scale: 0.75,
    frameRadius: 44,
    screenRadius: 32,
    padding: 14,
    showFrame: true,
  },
} as const;

/**
 * DeviceFrame - Wraps content in a device frame for mobile/tablet preview
 *
 * Performance optimized:
 * - Uses transform: scale() for GPU-accelerated animations
 * - Avoids animating width/height (causes layout thrashing)
 * - Uses will-change hint for smoother transitions
 */
export const DeviceFrame = memo(({ children }: DeviceFrameProps) => {
  const currentDeviceId = useStore(selectedDeviceId);
  const orientation = useStore(deviceOrientation);

  const device = useMemo(() => DEVICE_PRESETS.find((d) => d.id === currentDeviceId), [currentDeviceId]);

  const deviceType = device?.type || 'desktop';
  const config = DEVICE_CONFIGS[deviceType];
  const isDesktop = deviceType === 'desktop';
  const isMobile = deviceType === 'mobile';

  const dimensions = useMemo(() => {
    if (!device || device.type === 'desktop') {
      return { width: 375, height: 667 };
    }
    return getDeviceDimensions(device, orientation);
  }, [device, orientation]);

  const { width, height } = dimensions;

  // Frame total size including padding
  const frameWidth = width + (config.padding * 2);
  const frameHeight = height + (config.padding * 2);

  return (
    <div
      className={classNames(
        'w-full h-full flex items-center justify-center overflow-hidden',
        !isDesktop && 'bg-bolt-elements-background-depth-3',
      )}
    >
      {/* Scaling container - only transform animates (GPU accelerated) */}
      <div
        style={{
          transform: isDesktop ? 'scale(1)' : `scale(${config.scale})`,
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
          willChange: 'transform',
        }}
      >
        {/* Device Shell - no animation on size, instant change */}
        <div
          className="relative"
          style={{
            width: isDesktop ? '100vw' : frameWidth,
            height: isDesktop ? 'calc(100vh - 120px)' : frameHeight,
            maxWidth: isDesktop ? '100%' : undefined,
            maxHeight: isDesktop ? '100%' : undefined,
            background: isDesktop
              ? 'transparent'
              : 'linear-gradient(145deg, #27272a, #1f1f23)',
            borderRadius: config.frameRadius,
            padding: config.padding,
            border: isDesktop ? '1px solid rgba(255,255,255,0.08)' : '4px solid #3f3f46',
            boxShadow: isDesktop
              ? 'none'
              : '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
          }}
        >
          {/* Screen */}
          <div
            className="overflow-hidden bg-white w-full h-full"
            style={{
              borderRadius: config.screenRadius,
            }}
          >
            {children}
          </div>

          {/* Dynamic Island - Mobile only */}
          {isMobile && (
            <div
              className="absolute left-1/2 -translate-x-1/2 bg-[#18181b]"
              style={{
                top: 18,
                width: 100,
                height: 28,
                borderRadius: 20,
              }}
            />
          )}

          {/* Home Bar - Mobile only */}
          {isMobile && (
            <div
              className="absolute left-1/2 -translate-x-1/2"
              style={{
                bottom: 20,
                width: 100,
                height: 5,
                background: 'rgba(255,255,255,0.35)',
                borderRadius: 3,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
});

DeviceFrame.displayName = 'DeviceFrame';
