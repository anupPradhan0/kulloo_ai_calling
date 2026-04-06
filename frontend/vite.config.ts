import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const DEV_API_PROXY_TARGET = 'http://localhost:5000'

/** Prints local URL, port, and API proxy target when `pnpm dev` starts. */
function kullooDevStartupLog(apiTarget: string): Plugin {
  return {
    name: 'kulloo-dev-startup-log',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const addr = server.httpServer?.address()
        let host = 'localhost'
        let port = 5173
        if (addr && typeof addr === 'object') {
          host = addr.address === '::' || addr.address === '::1' ? 'localhost' : addr.address
          port = addr.port
        }
        const protocol = server.config.server.https ? 'https' : 'http'
        const localUrl = `${protocol}://${host}:${port}/`
        console.log(
          `\n[Kulloo] Frontend dev server is running\n` +
            `  Local URL:  ${localUrl}\n` +
            `  Port:       ${port}\n` +
            `  API proxy:  /api -> ${apiTarget}\n`,
        )
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), kullooDevStartupLog(DEV_API_PROXY_TARGET)],
  server: {
    proxy: {
      '/api': {
        target: DEV_API_PROXY_TARGET,
        changeOrigin: true,
      },
    },
  },
})
