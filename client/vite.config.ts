import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Proxy API calls so the browser always talks to its own origin: no CORS, and the
  // session cookie stays first-party whether the app is opened via localhost, 127.0.0.1 or a LAN IP.
  server: { port: 5173, proxy: { '/api': 'http://localhost:4000' } },
})
