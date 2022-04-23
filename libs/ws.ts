import type { IncomingMessage, Server } from 'http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { TClient } from '../'

export interface wsWithData extends WebSocket, TClient {
  type: 'websocket'
}

export type WsEvents = {
  onUpgrade?: (server: WebSocketServer, client: wsWithData) => Promise<void>
  onEnter?: (server: WebSocketServer, client: wsWithData) => Promise<void>
  onExit?: (server: WebSocketServer, client: wsWithData) => Promise<void>
  onMessage?: (server: WebSocketServer, client: wsWithData, data: string) => Promise<void>
}

function setAlive(ws: wsWithData) {
  ws.isAlive = true
}
function unsetClient(
  wsServer: WebSocketServer,
  wsClient: wsWithData,
  interval: NodeJS.Timer,
  onExit?: (server: WebSocketServer, client: wsWithData) => Promise<void>
) {
  if (onExit) {
    try {
      onExit(wsServer, wsClient).catch((err) => {
        console.error('ws on exit error', err)
      })
    } catch (err) {
      console.error('onExitError', err)
    }
  }
  clearInterval(interval)
  wsClient.terminate()
}
export default function (server: Server, events: WsEvents, options?: { serverPath?: string; single?: boolean }) {
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
      if (events.onMessage) events.onMessage(wss, ws, data.toString())
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
        events.onEnter(wss, ws as unknown as wsWithData).catch((err) => {
          console.error('ws onEnter error', err)
        })
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
        ;(ws as unknown as wsWithData).id =
          'websocket_' + Math.floor(Math.random() * 1000000).toString() + '-' + Date.now()
        ;(ws as unknown as wsWithData).isAlive = true
        ;(ws as unknown as wsWithData).type = 'websocket'
        ;(ws as unknown as wsWithData).path = options?.serverPath || '/'
        ;(ws as unknown as wsWithData).room = (request.url || 'public').split('room=')[1]?.split('&')[0] || 'public'
        if (events.onUpgrade) {
          try {
            events
              .onUpgrade(wss, ws as unknown as wsWithData)
              .then(() => {
                wss.emit('connection', ws, request)
              })
              .catch((err) => {
                console.error('ws onEnter error', err)
                return socket.destroy()
              })
          } catch (err) {
            return socket.destroy()
          }
        } else {
          wss.emit('connection', ws, request)
        }
      })
    } else if (options?.single) {
      socket.destroy()
    } else {
      return console.log('forward server after wsserver configuration for ' + options?.serverPath)
    }
  })
  return wss
}
