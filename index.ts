import type { IncomingMessage, Server } from 'http'
import { WebSocketServer, type WebSocket } from 'ws'

interface wsWithData extends WebSocket {
  isAlive: boolean
  id: string
  urlParsed: string
}

function setAlive(ws: wsWithData) {
  ws.isAlive = true
}
function unsetClient(
  wsServer: WebSocketServer,
  wsClient: wsWithData,
  interval: NodeJS.Timer,
  onExit?: (server: WebSocketServer, client: wsWithData) => void
) {
  if (onExit) {
    try {
      onExit(wsServer, wsClient)
    } catch (err) {
      console.error('onExitError', err)
    }
  }
  clearInterval(interval)
  wsClient.terminate()
}
export function wsServer(
  server: Server,
  events: {
    onUpgrade?: (server: WebSocketServer, client: wsWithData) => void
    onEnter?: (server: WebSocketServer, client: wsWithData) => void
    onExit?: (server: WebSocketServer, client: wsWithData) => void
    onMessage?: (server: WebSocketServer, client: wsWithData) => void
  },
  options?: { serverPath?: string; single?: boolean }
) {
  if (!options) options = {}
  if (!options.serverPath) options.serverPath = '/'
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', function connection(ws: wsWithData) {
    setAlive(ws)

    ws.on('pong', () => {
      setAlive(ws)
    })
    ws.on('ping', () => {
      setAlive(ws)
    })

    ws.on('message', (data) => {
      setAlive(ws)
      console.log('received: %s', data)
    })

    const interval: NodeJS.Timer = setInterval(function ping() {
      for (const c of wss.clients as unknown as wsWithData[]) {
        if (!c.isAlive) {
          return unsetClient(wss, c, interval, events.onExit)
        }
        c.isAlive = false
        c.ping(() => {})
      }
    }, 30000)
    wss.on('close', () => {
      unsetClient(wss, ws, interval, events.onExit)
    })
    if (events.onEnter) {
      try {
        events.onEnter(wss, ws as unknown as wsWithData)
      } catch (err) {
        unsetClient(wss, ws, interval, events.onExit)
      }
    }
  })
  server.on('upgrade', function upgrade(request, socket, head) {
    let mainUri: string
    if (request?.url) {
      mainUri = request.url.split('?')[0]
    } else {
      mainUri = '/'
    }

    if (mainUri === options?.serverPath) {
      wss.handleUpgrade(request, socket, head, (ws, request: IncomingMessage) => {
        ;(ws as unknown as wsWithData).id = Math.floor(Math.random() * 1000000).toString() + '-' + Date.now()
        ;(ws as unknown as wsWithData).isAlive = true
        ;(ws as unknown as wsWithData).urlParsed = request.url || '/'
        if (events.onUpgrade) {
          try {
            events.onUpgrade(wss, ws as unknown as wsWithData)
            wss.emit('connection', ws, request)
          } catch (err) {
            socket.destroy()
          }
        } else {
          wss.emit('connection', ws, request)
        }
      })
    } else if (options?.single) {
      socket.destroy()
    } else {
      console.log('forward server after wsserver configuration for ' + options?.serverPath)
    }
  })
  return wss
}
