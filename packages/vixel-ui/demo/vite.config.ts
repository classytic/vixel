import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

const pkg = (p: string) => resolve(__dirname, '..', 'src', p);

// Point the package specifiers at the live source so the demo exercises the
// real public API with HMR (longer subpaths first).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    dedupe: ['react', 'react-dom', 'pixi.js'],
    alias: [
      { find: '@classytic/vixel-ui/preview', replacement: pkg('preview/index.ts') },
      { find: '@classytic/vixel-ui/timeline', replacement: pkg('timeline/index.ts') },
      { find: '@classytic/vixel-ui/transport', replacement: pkg('transport/index.ts') },
      { find: '@classytic/vixel-ui/shared', replacement: pkg('shared/index.ts') },
      { find: '@classytic/vixel-ui', replacement: pkg('index.ts') },
    ],
  },
  server: { port: 5191, open: true },
});
