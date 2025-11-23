import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import commonjs from 'vite-plugin-commonjs'
import path from 'path'

export default defineConfig({
  plugins: [react(), commonjs()],
  server: {
    port: 5002,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    commonjsOptions: {
      include: [/node_modules/],
      transformMixedEsModules: true
    }
  },
  optimizeDeps: {
    include: [
      '@elastic/eui',
      '@emotion/react',
      '@emotion/cache',
      '@dagrejs/dagre',
      '@dagrejs/graphlib'
    ],
    force: true,
    esbuildOptions: {
      target: 'esnext',
      define: {
        global: 'globalThis'
      }
    }
  },
  resolve: {
    alias: {
      '@dagrejs/graphlib': path.resolve(__dirname, 'node_modules/@dagrejs/graphlib/dist/graphlib.min.js')
    }
  }
})
