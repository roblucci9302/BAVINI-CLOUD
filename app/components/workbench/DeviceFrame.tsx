'use client';

import { memo, type ReactNode, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { DEVICE_PRESETS, getDeviceDimensions } from '~/utils/devices';
import { selectedDeviceId, deviceOrientation } from '~/lib/stores/previews';

interface DeviceFrameProps {
  children: ReactNode;
}

/**
 * DeviceFrame - Wraps content in a device frame for mobile/tablet preview
 *
 * Uses a single DOM structure for all modes to prevent iframe remounting
 * and the flash that comes with it.
 */
export const DeviceFrame = memo(({ children }: DeviceFrameProps) => {
  const currentDeviceId = useStore(selectedDeviceId);
  const orientation = useStore(deviceOrientation);

  const device = useMemo(() => DEVICE_PRESETS.find((d) => d.id === currentDeviceId), [currentDeviceId]);

  const isDesktop = device?.type === 'desktop';

  const dimensions = useMemo(() => {
    if (!device || device.type === 'desktop') {
      return { width: 375, height: 667 };
    }

    return getDeviceDimensions(device, orientation);
  }, [device, orientation]);

  const { width, height } = dimensions;

  // Single DOM structure - only CSS changes between modes
  return (
    <div
      className={classNames(
        'w-full h-full transition-all duration-200',
        isDesktop
          ? 'flex items-stretch'
          : 'flex items-center justify-center bg-bolt-elements-background-depth-3 p-4',
      )}
    >
      <div
        className={classNames(
          'relative transition-all duration-200 overflow-hidden',
          isDesktop
            ? 'w-full h-full rounded-none bg-transparent p-0 border-0 shadow-none'
            : 'rounded-[40px] bg-gray-200 dark:bg-gray-900 p-3 shadow-2xl border-4 border-gray-300 dark:border-gray-800',
        )}
        style={isDesktop ? undefined : { width: width + 24, height: height + 24 }}
      >
        <div
          className={classNames(
            'overflow-hidden bg-white transition-all duration-200',
            isDesktop ? 'w-full h-full rounded-none' : 'rounded-[28px]',
          )}
          style={isDesktop ? undefined : { width, height }}
        >
          {children}
        </div>
        {!isDesktop && device?.type === 'mobile' && (
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-24 h-1 bg-gray-400 dark:bg-gray-700 rounded-full" />
        )}
      </div>
    </div>
  );
});

DeviceFrame.displayName = 'DeviceFrame';
