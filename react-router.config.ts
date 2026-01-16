import type { Config } from '@react-router/dev/config';

export default {
  // Use the app directory for routes and components
  appDirectory: 'app',

  // Enable SSR
  ssr: true,

  // Build output directories
  buildDirectory: 'build',

  // Future flags for forward compatibility
  future: {
    unstable_optimizeDeps: true,
  },
} satisfies Config;
