import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // Use jsdom to simulate a browser environment for component tests
    environment: 'jsdom',
    // Make vitest globals available (describe, it, expect) without imports
    globals: true,
    // Run this file before each test suite to configure matchers etc.
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // Only measure coverage on our source code, not generated files
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/generated/**',
        'src/test/**',
        'src/**/*.d.ts',
        'src/app/**', // Next.js pages — integration tested separately
      ],
    },
  },
  resolve: {
    alias: {
      // Mirror the @/ path alias from tsconfig so imports work in tests
      '@': path.resolve(__dirname, './src'),
    },
  },
});
