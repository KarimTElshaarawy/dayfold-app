import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { loadConfig } from './scripts/config.mjs';

const app = loadConfig();

/** Puts the app name from app.config.json into index.html. */
const appName = (): Plugin => ({
  name: 'app-name',
  transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', app.appName),
});

export default defineConfig({
  plugins: [react(), appName()],
  define: { __APP_NAME__: JSON.stringify(app.appName) },
  resolve: { alias: { '@shared': fileURLToPath(new URL('./shared', import.meta.url)) } },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2020', sourcemap: false },
});
