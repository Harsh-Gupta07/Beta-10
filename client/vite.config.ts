import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Proxy API calls so the browser always talks to its own origin: no CORS, and the
  // session cookie stays first-party whether the app is opened via localhost, 127.0.0.1 or a LAN IP.
  // changeOrigin must stay false (the string shorthand turns it on): the API's CSRF check compares
  // the browser's Origin with the Host header, so the proxy has to pass the original Host through.
  // strictPort: Google sign-in only accepts the exact origins registered for the client ID (http://localhost:5173),
  // so fail loudly instead of silently moving to 5174 where the Google button would be refused.
  server: { port: 5173, strictPort: true, proxy: { '/api': { target: 'http://localhost:4000', changeOrigin: false } } },
})
