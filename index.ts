import type { Server } from 'http'
import { WebSocketServer, type WebSocket } from 'ws'

interface wsWithData extends WebSocket {
  isAlive: boolean
}

const wsClients: Map<string, wsWithData> = new Map()

function setAlive(ws: wsWithData) {
  ws.isAlive = true
}

export default function (server: Server) {
  const wss = new WebSocketServer({ server })

  wss.on('connection', function connection(ws: wsWithData) {
    ws.on('pong', () => setAlive(ws))
    ws.on('ping', () => setAlive(ws))

    ws.on('message', (data) => {
      setAlive(ws)
      console.log('received: %s', data)
    })

    const interval = setInterval(function ping() {
      for (const c of wsClients.values()) {
        if (!c.isAlive) {
          return c.terminate()
        }
        c.isAlive = false
        c.ping(() => {})
      }
    }, 30000)
    wss.on('close', function close() {
      clearInterval(interval)
    })
  })
}
