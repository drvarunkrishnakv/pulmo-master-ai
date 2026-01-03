import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: {
        clientPort: 3000
      }
    },
    plugins: [react()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    },
    build: {
      // Increase warning limit since medical content is naturally large
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Vendor chunks - split large libraries
            if (id.includes('node_modules')) {
              if (id.includes('recharts') || id.includes('d3')) {
                return 'vendor-charts';
              }
              if (id.includes('lottie')) {
                return 'vendor-lottie';
              }
              if (id.includes('react')) {
                return 'vendor-react';
              }
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              return 'vendor-misc';
            }

            // Content chunks - each book's MCQs stay separate (already dynamic imports)
            // Services chunk
            if (id.includes('/services/')) {
              return 'services';
            }

            // Components chunk - split large components
            if (id.includes('/components/')) {
              if (id.includes('QuizView') || id.includes('QuizExplanation') || id.includes('SprintResult')) {
                return 'quiz-components';
              }
              if (id.includes('Flashcard')) {
                return 'flashcard-components';
              }
              return 'ui-components';
            }
          }
        }
      },
      // Enable source maps for debugging in production (optional)
      sourcemap: false,
      // Minify with esbuild for speed
      minify: 'esbuild',
      // Target modern browsers
      target: 'es2020'
    }
  };
});
