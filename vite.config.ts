import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Todas las claves que lee src/utils/constants.ts tienen que estar definidas: si una queda
    // sin reemplazar, el bundle evalua `process` y falla al cargar en el navegador.
    define: {
      'process.env.FRONTEND_URL': JSON.stringify(env.FRONTEND_URL ?? 'http://localhost:5173'),
      'process.env.BACKEND_URL': JSON.stringify(env.BACKEND_URL ?? '/api'),
      // Credenciales de prueba de Cypress: nunca van al bundle.
      'process.env.AUTH0_USERNAME': JSON.stringify(''),
      'process.env.AUTH0_PASSWORD': JSON.stringify(''),
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
