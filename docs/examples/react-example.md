# React Example with BAVINI Runtime

This example demonstrates how to use the BAVINI Runtime to build and run a React application.

## Project Structure

```
my-react-app/
├── package.json
├── src/
│   ├── index.tsx
│   ├── App.tsx
│   └── components/
│       └── Counter.tsx
└── public/
    └── index.html
```

## Files

### package.json

```json
{
  "name": "my-react-app",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.0.0"
  }
}
```

### src/index.tsx

```tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
```

### src/App.tsx

```tsx
import React from 'react';
import Counter from './components/Counter';

export default function App() {
  return (
    <div className="app">
      <h1>My React App</h1>
      <Counter initialCount={0} />
    </div>
  );
}
```

### src/components/Counter.tsx

```tsx
import React, { useState } from 'react';

interface CounterProps {
  initialCount: number;
}

export default function Counter({ initialCount }: CounterProps) {
  const [count, setCount] = useState(initialCount);

  return (
    <div className="counter">
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c - 1)}>-</button>
      <button onClick={() => setCount(c => c + 1)}>+</button>
    </div>
  );
}
```

### public/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My React App</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      padding: 2rem;
    }
    .counter {
      display: flex;
      gap: 1rem;
      align-items: center;
      margin-top: 1rem;
    }
    button {
      padding: 0.5rem 1rem;
      font-size: 1.2rem;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/index.tsx"></script>
</body>
</html>
```

## Using with BAVINI Runtime

```typescript
import {
  MountManager,
  OPFSBackend,
  PackageManager,
  DevServer,
} from '~/lib/runtime';

// Initialize filesystem
const fs = new MountManager();
await fs.mount('/', new OPFSBackend());

// Write project files
await fs.writeFile('/package.json', JSON.stringify(packageJson));
await fs.writeFile('/src/index.tsx', indexContent);
await fs.writeFile('/src/App.tsx', appContent);
await fs.writeFile('/src/components/Counter.tsx', counterContent);
await fs.writeFile('/public/index.html', htmlContent);

// Install dependencies
const pm = new PackageManager(fs);
await pm.install(['react', 'react-dom']);

// Start dev server with HMR
const devServer = new DevServer(fs, {
  port: 3000,
  plugins: [reactRefreshPlugin()],
});

await devServer.start();

// Preview URL is now available
console.log('Preview at:', devServer.getPreviewUrl());
```

## HMR Support

The React example supports Hot Module Replacement with React Fast Refresh:

1. Component state is preserved during updates
2. Syntax errors show an error overlay
3. Only changed components are re-rendered

```tsx
// Changes to this component will hot-reload
export default function Counter({ initialCount }: CounterProps) {
  const [count, setCount] = useState(initialCount);

  // Edit this and see it update without losing count state
  return (
    <div className="counter">
      <p>Current count: {count}</p>
      {/* ... */}
    </div>
  );
}
```
