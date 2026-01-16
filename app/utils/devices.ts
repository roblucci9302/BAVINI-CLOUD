export type DeviceType = 'desktop' | 'tablet' | 'mobile';
export type Orientation = 'portrait' | 'landscape';

export interface DevicePreset {
  id: string;
  name: string;
  type: DeviceType;
  width: number;
  height: number;
  icon: string;
}

export const DEVICE_PRESETS: DevicePreset[] = [
  {
    id: 'desktop',
    name: 'Desktop',
    type: 'desktop',
    width: 1280,
    height: 800,
    icon: 'i-ph:desktop',
  },
  {
    id: 'tablet',
    name: 'Tablet',
    type: 'tablet',
    width: 768,
    height: 1024,
    icon: 'i-ph:device-tablet',
  },
  {
    id: 'mobile',
    name: 'Mobile',
    type: 'mobile',
    width: 375,
    height: 812,
    icon: 'i-ph:device-mobile',
  },
];

export const DEFAULT_DEVICE_ID = 'desktop';

export function getDeviceById(id: string): DevicePreset | undefined {
  return DEVICE_PRESETS.find((device) => device.id === id);
}

export function getDeviceDimensions(device: DevicePreset, orientation: Orientation): { width: number; height: number } {
  if (device.type === 'desktop' || orientation === 'portrait') {
    return { width: device.width, height: device.height };
  }

  // landscape: swap width and height
  return { width: device.height, height: device.width };
}
