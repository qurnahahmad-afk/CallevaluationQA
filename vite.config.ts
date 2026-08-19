import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import dyadComponentTagger from '@dyad-sh/react-vite-component-tagger';

export default defineConfig({
  plugins: [dyadComponentTagger(), react()],
  optimizeDeps: { exclude: ['lucide-react'] },
});
