# Vue Example with BAVINI Runtime

This example demonstrates how to use the BAVINI Runtime to build and run a Vue 3 application.

## Project Structure

```
my-vue-app/
├── package.json
├── src/
│   ├── main.ts
│   ├── App.vue
│   └── components/
│       └── Counter.vue
└── index.html
```

## Files

### package.json

```json
{
  "name": "my-vue-app",
  "version": "1.0.0",
  "type": "module",
  "dependencies": {
    "vue": "^3.4.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "typescript": "^5.0.0"
  }
}
```

### src/main.ts

```typescript
import { createApp } from 'vue';
import App from './App.vue';

const app = createApp(App);
app.mount('#app');
```

### src/App.vue

```vue
<script setup lang="ts">
import Counter from './components/Counter.vue';
</script>

<template>
  <div class="app">
    <h1>My Vue App</h1>
    <Counter :initial-count="0" />
  </div>
</template>

<style scoped>
.app {
  font-family: system-ui, -apple-system, sans-serif;
  padding: 2rem;
}
</style>
```

### src/components/Counter.vue

```vue
<script setup lang="ts">
import { ref } from 'vue';

interface Props {
  initialCount: number;
}

const props = defineProps<Props>();
const count = ref(props.initialCount);

function increment() {
  count.value++;
}

function decrement() {
  count.value--;
}
</script>

<template>
  <div class="counter">
    <p>Count: {{ count }}</p>
    <button @click="decrement">-</button>
    <button @click="increment">+</button>
  </div>
</template>

<style scoped>
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
```

### index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Vue App</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
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
import { vueHMRPlugin } from '~/lib/runtime/dev-server/plugins/vue-hmr';

// Initialize filesystem
const fs = new MountManager();
await fs.mount('/', new OPFSBackend());

// Write project files
await fs.writeFile('/package.json', JSON.stringify(packageJson));
await fs.writeFile('/src/main.ts', mainContent);
await fs.writeFile('/src/App.vue', appContent);
await fs.writeFile('/src/components/Counter.vue', counterContent);
await fs.writeFile('/index.html', htmlContent);

// Install dependencies
const pm = new PackageManager(fs);
await pm.install(['vue']);

// Start dev server with Vue HMR
const devServer = new DevServer(fs, {
  port: 3000,
  plugins: [vueHMRPlugin()],
});

await devServer.start();

console.log('Preview at:', devServer.getPreviewUrl());
```

## HMR Support

Vue Single File Components (SFCs) support full HMR:

1. **Script changes**: Component is re-rendered
2. **Template changes**: Hot-updated without state loss
3. **Style changes**: CSS is injected without reload

```vue
<script setup lang="ts">
// Changes here trigger a component reload
const count = ref(0);
</script>

<template>
  <!-- Changes here are hot-updated -->
  <div>{{ count }}</div>
</template>

<style scoped>
/* Changes here are injected without reload */
div { color: blue; }
</style>
```

## Composition API Example

```vue
<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';

// Reactive state
const items = ref<string[]>([]);
const newItem = ref('');

// Computed property
const itemCount = computed(() => items.value.length);

// Lifecycle hook
onMounted(() => {
  console.log('Component mounted');
});

// Watcher
watch(items, (newItems) => {
  console.log('Items changed:', newItems);
}, { deep: true });

// Methods
function addItem() {
  if (newItem.value.trim()) {
    items.value.push(newItem.value.trim());
    newItem.value = '';
  }
}

function removeItem(index: number) {
  items.value.splice(index, 1);
}
</script>

<template>
  <div class="todo-list">
    <h2>Todo List ({{ itemCount }} items)</h2>

    <div class="input-group">
      <input
        v-model="newItem"
        @keyup.enter="addItem"
        placeholder="Add new item"
      />
      <button @click="addItem">Add</button>
    </div>

    <ul>
      <li v-for="(item, index) in items" :key="index">
        {{ item }}
        <button @click="removeItem(index)">Remove</button>
      </li>
    </ul>
  </div>
</template>
```
