// Vite reemplaza `process.env.<CLAVE>` por un literal en dev y en build (ver `define` en
// vite.config.ts). La sintaxis tiene que ser exactamente esa: con optional chaining el
// reemplazo no ocurre en el build de produccion y `process` no existe en el navegador.
// Fuera de Vite (Cypress corriendo en Node) se lee el entorno real.
export const FRONTEND_URL = process.env.FRONTEND_URL ?? "http://localhost:5173"
// Misma origin que la UI: NGINX enruta /api/* a los servicios. Sobreescribible con BACKEND_URL.
export const BACKEND_URL = process.env.BACKEND_URL ?? "/api"
// Solo para Cypress; en el bundle del navegador siempre quedan vacias.
export const AUTH0_USERNAME = process.env.AUTH0_USERNAME ?? ""
export const AUTH0_PASSWORD = process.env.AUTH0_PASSWORD ?? ""
