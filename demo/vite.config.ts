import { defineConfig } from 'vite';
import preact from '../src/index';

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      'react-dom/test-utils': 'preact/test-utils',
      'react-dom': 'preact/compat',
      react: 'preact/compat',
    },
  },
  plugins: [preact()],
});
