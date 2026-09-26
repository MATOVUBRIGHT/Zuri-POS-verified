import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['electron']
      },
      lib: {
        entry: resolve('main/index.ts')
      },
      minify: true
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('preload/index.ts')
      },
      minify: true
    }
  },
  renderer: {
    root: resolve('renderer'),
    base: './',
    resolve: {
      alias: {
        '@': resolve('renderer/src')
      },
      dedupe: ['react', 'react-dom']
    },
    server: {
      port: 5176
    },
    plugins: [react()],
    build: {
      target: 'es2020',
      minify: 'esbuild',
      rollupOptions: {
        input: resolve('renderer/index.html'),
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            supabase: ['@supabase/supabase-js'],
            query: ['@tanstack/react-query'],
            ui: ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', 'lucide-react']
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          entryFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash][extname]'
        }
      },
      cssCodeSplit: true,
      reportCompressedSize: true
    },
    optimizeDeps: {
      include: ['react', 'react-dom', '@supabase/supabase-js', '@tanstack/react-query'],
      esbuildOptions: { target: 'es2020' }
    }
  }
})
