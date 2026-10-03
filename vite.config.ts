import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: {
      'process.env.FRONTEND_URL': JSON.stringify(env.FRONTEND_URL),
      'process.env.BACKEND_URL': JSON.stringify(env.BACKEND_URL)
    },
    plugins: [react()],
    server: {
      // En desarrollo la UI corre en 5173 y el gateway en 8080: el proxy evita CORS y deja
      // la misma ruta relativa /api que en producción.
      proxy: {
        '/api': env.GATEWAY_URL ?? 'http://localhost:8080',
      },
    },
  }
})
