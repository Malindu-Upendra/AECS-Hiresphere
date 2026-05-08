import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/auth': { target: 'http://localhost:3001', rewrite: (path) => path.replace(/^\/api/, '') },
      '/api/users': { target: 'http://localhost:3002', rewrite: (path) => path.replace(/^\/api/, '') },
      '/api/bookings': { target: 'http://localhost:3003', rewrite: (path) => path.replace(/^\/api/, '') },
      '/api/messages': { target: 'http://localhost:3004', rewrite: (path) => path.replace(/^\/api/, '') },
      '/api/submissions': { target: 'http://localhost:3005', rewrite: (path) => path.replace(/^\/api/, '') },
      '/api/tasks': { target: 'http://localhost:3005', rewrite: (path) => path.replace(/^\/api/, '') },
      '/api/sessions': { target: 'http://localhost:3006', rewrite: (path) => path.replace(/^\/api/, '') },
    },
  },
});
