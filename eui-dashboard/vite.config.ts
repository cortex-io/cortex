import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
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
      '@emotion/cache'
    ],
    exclude: [
      '@dagrejs/dagre',
      '@dagrejs/graphlib'
    ],
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
