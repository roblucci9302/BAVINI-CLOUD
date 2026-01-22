# Astro Example with BAVINI Runtime

This example demonstrates how to use the BAVINI Runtime to build and run an Astro application with islands architecture.

## Project Structure

```
my-astro-app/
├── package.json
├── astro.config.mjs
├── src/
│   ├── pages/
│   │   ├── index.astro
│   │   └── about.astro
│   ├── layouts/
│   │   └── Layout.astro
│   └── components/
│       ├── Header.astro
│       └── Counter.tsx
└── public/
    └── favicon.svg
```

## Files

### package.json

```json
{
  "name": "my-astro-app",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "astro": "^4.0.0",
    "@astrojs/react": "^3.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  }
}
```

### astro.config.mjs

```javascript
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  integrations: [react()],
});
```

### src/layouts/Layout.astro

```astro
---
interface Props {
  title: string;
}

const { title } = Astro.props;
---

<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style is:global>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }
  </style>
</head>
<body>
  <slot />
</body>
</html>
```

### src/components/Header.astro

```astro
---
const links = [
  { href: '/', text: 'Home' },
  { href: '/about', text: 'About' },
];
---

<header>
  <nav>
    {links.map(link => (
      <a href={link.href}>{link.text}</a>
    ))}
  </nav>
</header>

<style>
  header {
    background: #1a1a2e;
    padding: 1rem 2rem;
  }
  nav {
    display: flex;
    gap: 1rem;
    max-width: 800px;
    margin: 0 auto;
  }
  a {
    color: white;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
</style>
```

### src/components/Counter.tsx

```tsx
import { useState } from 'react';

interface Props {
  initialCount?: number;
}

export default function Counter({ initialCount = 0 }: Props) {
  const [count, setCount] = useState(initialCount);

  return (
    <div className="counter">
      <p>Count: {count}</p>
      <button onClick={() => setCount(c => c - 1)}>-</button>
      <button onClick={() => setCount(c => c + 1)}>+</button>
      <style>{`
        .counter {
          display: flex;
          gap: 1rem;
          align-items: center;
          padding: 1rem;
          background: #f0f0f0;
          border-radius: 8px;
          margin: 1rem 0;
        }
        .counter button {
          padding: 0.5rem 1rem;
          font-size: 1.2rem;
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}
```

### src/pages/index.astro

```astro
---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
import Counter from '../components/Counter.tsx';
---

<Layout title="Home | My Astro App">
  <Header />
  <main class="container">
    <h1>Welcome to Astro</h1>
    <p>This is a static page with an interactive island below:</p>

    <!-- This React component is an "island" - it hydrates on the client -->
    <Counter client:load initialCount={5} />

    <p>The counter above is a React component that hydrates on load.</p>
  </main>
</Layout>
```

### src/pages/about.astro

```astro
---
import Layout from '../layouts/Layout.astro';
import Header from '../components/Header.astro';
---

<Layout title="About | My Astro App">
  <Header />
  <main class="container">
    <h1>About</h1>
    <p>This is a fully static page with no JavaScript.</p>
    <p>Astro ships zero JavaScript by default, only hydrating interactive islands.</p>
  </main>
</Layout>
```

## Using with BAVINI Runtime

```typescript
import {
  MountManager,
  OPFSBackend,
  PackageManager,
  DevServer,
} from '~/lib/runtime';
import { AstroCompiler } from '~/lib/runtime/compilers/astro-compiler';

// Initialize filesystem
const fs = new MountManager();
await fs.mount('/', new OPFSBackend());

// Write project files
await fs.writeFile('/package.json', JSON.stringify(packageJson));
await fs.writeFile('/astro.config.mjs', astroConfig);
await fs.writeFile('/src/layouts/Layout.astro', layoutContent);
await fs.writeFile('/src/components/Header.astro', headerContent);
await fs.writeFile('/src/components/Counter.tsx', counterContent);
await fs.writeFile('/src/pages/index.astro', indexContent);
await fs.writeFile('/src/pages/about.astro', aboutContent);

// Install dependencies
const pm = new PackageManager(fs);
await pm.install(['astro', '@astrojs/react', 'react', 'react-dom']);

// Build with Astro compiler
const compiler = new AstroCompiler(fs);
const buildResult = await compiler.build({
  input: '/src/pages',
  output: '/dist',
});

// Start dev server
const devServer = new DevServer(fs, {
  port: 3000,
  root: '/dist',
});

await devServer.start();
console.log('Preview at:', devServer.getPreviewUrl());
```

## Islands Architecture

Astro's islands architecture allows you to control how and when components hydrate:

```astro
---
import Interactive from './Interactive.tsx';
---

<!-- No hydration - static HTML only -->
<Interactive />

<!-- Hydrate on page load -->
<Interactive client:load />

<!-- Hydrate when component is visible -->
<Interactive client:visible />

<!-- Hydrate when browser is idle -->
<Interactive client:idle />

<!-- Only hydrate on specific media query -->
<Interactive client:media="(max-width: 600px)" />
```

## Multi-Page Routing

BAVINI Runtime supports Astro's file-based routing:

```
src/pages/
├── index.astro      → /
├── about.astro      → /about
├── blog/
│   ├── index.astro  → /blog
│   └── [slug].astro → /blog/:slug
└── api/
    └── hello.ts     → /api/hello
```

## Content Collections

```typescript
// src/content/config.ts
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.date(),
    author: z.string(),
  }),
});

export const collections = { blog };
```

```astro
---
// src/pages/blog/[slug].astro
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const posts = await getCollection('blog');
  return posts.map(post => ({
    params: { slug: post.slug },
    props: { post },
  }));
}

const { post } = Astro.props;
const { Content } = await post.render();
---

<Layout title={post.data.title}>
  <article>
    <h1>{post.data.title}</h1>
    <time>{post.data.date.toLocaleDateString()}</time>
    <Content />
  </article>
</Layout>
```
