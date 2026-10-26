import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    allowedHosts: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // The strategy engine is shared with the Supabase Edge Functions (Deno).
      '@engine': fileURLToPath(new URL('./supabase/functions/_shared/engine.ts', import.meta.url)),
    },
  },
});
