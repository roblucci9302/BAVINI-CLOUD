'use client';

import { memo, type ReactNode, useMemo, useState, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { DEVICE_PRESETS, getDeviceDimensions } from '~/utils/devices';
import { selectedDeviceId, deviceOrientation } from '~/lib/stores/previews';

interface DeviceFrameProps {
  children: ReactNode;
}

// Target visual widths for each device type
const TARGET_VISUAL_WIDTH = {
  desktop: -1,
  tablet: 450,
  mobile: 360,
} as const;

// Device frame styling
const DEVICE_STYLES = {
  desktop: {
    frameRadius: 8,
    screenRadius: 4,
    padding: 0,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    background: '#18181b',
    shadow: '0 4px 20px rgba(0,0,0,0.3)',
  },
  tablet: {
    frameRadius: 36,
    screenRadius: 24,
    padding: 14,
    borderWidth: 4,
    borderColor: '#3f3f46',
    background: 'linear-gradient(145deg, #27272a, #1f1f23)',
    shadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
  mobile: {
    frameRadius: 44,
    screenRadius: 32,
    padding: 14,
    borderWidth: 4,
    borderColor: '#3f3f46',
    background: 'linear-gradient(145deg, #27272a, #1f1f23)',
    shadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255,255,255,0.05)',
  },
} as const;

// Smooth easing curve - longer duration and softer easing for fluidity
const EASING = 'cubic-bezier(0.25, 0.1, 0.25, 1)';
const DURATION = '0.5s';

/**
 * DeviceFrame - Smooth morphing device preview
 *
 * Animates all properties for organic transitions:
 * - Width/height morph smoothly
 * - Border-radius interpolates
 * - Scale adjusts fluidly
 */
export const DeviceFrame = memo(({ children }: DeviceFrameProps) => {
  const currentDeviceId = useStore(selectedDeviceId);
  const orientation = useStore(deviceOrientation);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  const device = useMemo(() => DEVICE_PRESETS.find((d) => d.id === currentDeviceId), [currentDeviceId]);
  const deviceType = device?.type || 'desktop';
  const style = DEVICE_STYLES[deviceType];
  const isDesktop = deviceType === 'desktop';
  const isMobile = deviceType === 'mobile';

  // Get device dimensions
  const dimensions = useMemo(() => {
    if (!device || device.type === 'desktop') {
      return {
        width: Math.max(containerSize.width - 48, 400),
        height: Math.max(containerSize.height - 24, 300)
      };
    }
    return getDeviceDimensions(device, orientation);
  }, [device, orientation, containerSize]);

  // Track container size
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setContainerSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const { width, height } = dimensions;

  // Calculate visual dimensions
  const visualWidth = useMemo(() => {
    if (isDesktop) return width;
    const target = TARGET_VISUAL_WIDTH[deviceType as keyof typeof TARGET_VISUAL_WIDTH];
    return target > 0 ? target : width;
  }, [isDesktop, deviceType, width]);

  // Scale to achieve target visual width
  const scale = visualWidth / (width + style.padding * 2);

  // Final visual height (maintaining aspect ratio)
  const visualHeight = (height + style.padding * 2) * scale;

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex items-center justify-center overflow-hidden"
      style={{
        background: isDesktop ? 'transparent' : 'var(--bolt-elements-background-depth-3)',
        transition: `background ${DURATION} ${EASING}`,
      }}
    >
      {/* Outer container for visual size */}
      <div
        style={{
          width: visualWidth,
          height: visualHeight,
          transition: `width ${DURATION} ${EASING}, height ${DURATION} ${EASING}`,
          willChange: 'width, height',
        }}
      >
        {/* Scale container */}
        <div
          style={{
            width: '100%',
            height: '100%',
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            transition: `transform ${DURATION} ${EASING}`,
          }}
        >
          {/* Device Shell */}
          <div
            className="relative"
            style={{
              width: width + style.padding * 2,
              height: height + style.padding * 2,
              background: style.background,
              borderRadius: style.frameRadius,
              padding: style.padding,
              borderWidth: style.borderWidth,
              borderStyle: 'solid',
              borderColor: style.borderColor,
              boxShadow: style.shadow,
              overflow: 'hidden',
              contain: 'layout style',
              willChange: 'width, height, border-radius',
              transition: `
                width ${DURATION} ${EASING},
                height ${DURATION} ${EASING},
                border-radius ${DURATION} ${EASING},
                padding ${DURATION} ${EASING},
                background ${DURATION} ${EASING},
                box-shadow ${DURATION} ${EASING}
              `,
            }}
          >
            {/* Screen */}
            <div
              className="overflow-hidden bg-white"
              style={{
                width: width,
                height: height,
                borderRadius: style.screenRadius,
                contain: 'layout style',
                willChange: 'width, height, border-radius',
                transition: `
                  width ${DURATION} ${EASING},
                  height ${DURATION} ${EASING},
                  border-radius ${DURATION} ${EASING}
                `,
              }}
            >
              {children}
            </div>

            {/* Dynamic Island - Mobile only */}
            <div
              className="absolute left-1/2 bg-[#18181b] pointer-events-none"
              style={{
                top: 18,
                width: 100,
                height: 28,
                borderRadius: 20,
                transform: 'translateX(-50%)',
                opacity: isMobile ? 1 : 0,
                transition: `opacity ${DURATION} ${EASING}`,
              }}
            />

            {/* Home Bar - Mobile only */}
            <div
              className="absolute left-1/2 pointer-events-none"
              style={{
                bottom: 20,
                width: 100,
                height: 5,
                background: 'rgba(255,255,255,0.35)',
                borderRadius: 3,
                transform: 'translateX(-50%)',
                opacity: isMobile ? 1 : 0,
                transition: `opacity ${DURATION} ${EASING}`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

DeviceFrame.displayName = 'DeviceFrame';
