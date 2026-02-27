/**
 * WebSocket URL helper.
 * 
 * Vercel rewrites don't support WebSocket upgrades, so we connect
 * directly to the Railway backend for all WS connections.
 * In local dev, we use the Vite proxy (same host).
 */

const WS_BACKEND = import.meta.env.VITE_WS_URL || (
  import.meta.env.DEV
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
    : 'wss://rat-backend-production.up.railway.app'
)

export function getWsUrl(path: string): string {
  return `${WS_BACKEND}${path}`
}
