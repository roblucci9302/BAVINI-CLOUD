'use client';

import { memo, useMemo, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { DEVICE_PRESETS, DEFAULT_DEVICE_ID, type DevicePreset } from '~/utils/devices';
import { selectedDeviceId, deviceOrientation } from '~/lib/stores/previews';

/**
 * DeviceSelector - Option D Style
 * Clean, minimal design with smooth transitions
 */
export const DeviceSelector = memo(() => {
  const currentDeviceId = useStore(selectedDeviceId);
  const orientation = useStore(deviceOrientation);

  const currentDevice = useMemo(() => DEVICE_PRESETS.find((d) => d.id === currentDeviceId), [currentDeviceId]);
  const showRotation = currentDevice?.type !== 'desktop';

  // FIX: Validate that current device exists, reset to default if not
  useEffect(() => {
    if (!currentDevice) {
      selectedDeviceId.set(DEFAULT_DEVICE_ID);
    }
  }, [currentDevice]);

  const handleDeviceSelect = (deviceId: string) => {
    const newDevice = DEVICE_PRESETS.find((d) => d.id === deviceId);

    // FIX: Reset orientation BEFORE changing device to avoid intermediate render state
    // This prevents the visual glitch where tablet briefly shows in landscape mode
    // because the orientation store hadn't updated yet when device changed
    if (newDevice?.type !== currentDevice?.type) {
      deviceOrientation.set('portrait');
    }

    selectedDeviceId.set(deviceId);
  };

  const toggleOrientation = () => {
    deviceOrientation.set(orientation === 'portrait' ? 'landscape' : 'portrait');
  };

  return (
    <div className="flex items-center gap-2">
      {/* Device buttons container */}
      <div className="flex items-center gap-0.5 bg-bolt-elements-background-depth-2 p-1 rounded-xl">
        {DEVICE_PRESETS.map((device) => (
          <DeviceButton
            key={device.id}
            device={device}
            selected={currentDeviceId === device.id}
            onSelect={() => handleDeviceSelect(device.id)}
          />
        ))}
      </div>

      {/* Rotation button - only visible for tablet/mobile */}
      {showRotation && (
        <button
          onClick={toggleOrientation}
          className={classNames(
            'flex items-center justify-center w-8 h-8 rounded-lg',
            'bg-bolt-elements-background-depth-2 border-none',
            'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
            'transition-all duration-[250ms] ease-out',
          )}
          title={orientation === 'portrait' ? 'Paysage' : 'Portrait'}
        >
          <span
            className="i-ph:device-rotate text-base"
            style={{
              transform: orientation === 'landscape' ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        </button>
      )}
    </div>
  );
});

interface DeviceButtonProps {
  device: DevicePreset;
  selected: boolean;
  onSelect: () => void;
}

const DeviceButton = memo(({ device, selected, onSelect }: DeviceButtonProps) => {
  return (
    <button
      onClick={onSelect}
      className={classNames(
        'relative flex items-center justify-center w-9 h-8 rounded-lg',
        'border-none cursor-pointer',
        'transition-all duration-[250ms] ease-out',
        selected
          ? 'text-[#8b5cf6] bg-[rgba(139,92,246,0.15)]'
          : 'text-bolt-elements-textTertiary bg-transparent hover:text-bolt-elements-textSecondary hover:bg-[rgba(139,92,246,0.08)]',
      )}
      title={device.name}
    >
      <span className={classNames(device.icon, 'text-[17px]')} />
    </button>
  );
});

DeviceSelector.displayName = 'DeviceSelector';
DeviceButton.displayName = 'DeviceButton';
