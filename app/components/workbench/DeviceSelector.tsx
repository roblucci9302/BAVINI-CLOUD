'use client';

import { memo, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { DEVICE_PRESETS, type DevicePreset } from '~/utils/devices';
import { selectedDeviceId, deviceOrientation } from '~/lib/stores/previews';

export const DeviceSelector = memo(() => {
  const currentDeviceId = useStore(selectedDeviceId);
  const orientation = useStore(deviceOrientation);

  const currentDevice = useMemo(() => DEVICE_PRESETS.find((d) => d.id === currentDeviceId), [currentDeviceId]);
  const showRotation = currentDevice?.type !== 'desktop';

  // Calculate pill position based on selected device index
  const selectedIndex = useMemo(() => DEVICE_PRESETS.findIndex((d) => d.id === currentDeviceId), [currentDeviceId]);

  const handleDeviceSelect = (deviceId: string) => {
    selectedDeviceId.set(deviceId);

    // reset orientation when switching devices
    if (deviceId === 'desktop') {
      deviceOrientation.set('portrait');
    }
  };

  const toggleOrientation = () => {
    deviceOrientation.set(orientation === 'portrait' ? 'landscape' : 'portrait');
  };

  return (
    <div className="flex items-center gap-2">
      {/* Device buttons - clean icons like mockup */}
      <div className="relative flex items-center gap-1">

        {DEVICE_PRESETS.map((device) => (
          <DeviceButton
            key={device.id}
            device={device}
            selected={currentDeviceId === device.id}
            onSelect={() => handleDeviceSelect(device.id)}
          />
        ))}
      </div>

      {/* Rotation button */}
      {showRotation && (
        <button
          onClick={toggleOrientation}
          className={classNames(
            'flex items-center justify-center w-7 h-7 rounded-[8px] transition-all duration-150',
            'bg-transparent border-none',
            'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-[var(--bolt-bg-hover,#1a1a1e)]',
          )}
          title={orientation === 'portrait' ? 'Paysage' : 'Portrait'}
        >
          <span
            className={classNames('i-ph:device-rotate text-base transition-transform duration-200', {
              'rotate-90': orientation === 'landscape',
            })}
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
        'relative flex items-center justify-center w-7 h-7 rounded-[8px] transition-colors duration-150',
        selected
          ? 'text-[#0ea5e9]'
          : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
      )}
      title={device.name}
    >
      <span className={classNames(device.icon, 'text-base')} />
    </button>
  );
});

DeviceSelector.displayName = 'DeviceSelector';
DeviceButton.displayName = 'DeviceButton';
