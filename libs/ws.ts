import type { IncomingMessage, Server } from 'http'
import { WebSocketServer, type WebSocket } from 'ws'
import type { TClient } from '../'

export interface WsWithData extends WebSocket, TClient {
  type: 'websocket'
}

export type WsEvents = {
  onUpgrade?: (server: WebSocketServer, client: WsWithData) => Promise<any>
  onEnter?: (server: WebSocketServer, client: WsWithData) => Promise<void>
  onExit?: (server: WebSocketServer, client: WsWithData) => Promise<void>
  onMessage?: (server: WebSocketServer, client: WsWithData, data: string) => Promise<void>
}

function setAlive(ws: WsWithData) {
  ws.isAlive = true
}
function unsetClient(
  wsServer: WebSocketServer,
  wsClient: WsWithData,
  interval: NodeJS.Timer,
  onExit?: (server: WebSocketServer, client: WsWithData) => Promise<void>
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
  console.info(
    `ws client disconnected ${wsClient.id} ws clients now are ${wsServer.clients.values.length}`,
    wsClient?.meta
  )
  clearInterval(interval)
  wsClient.terminate()
}
export default function (server: Server, events: WsEvents, options?: { serverPath?: string; single?: boolean }) {
  if (!options) options = {}
  if (!options.serverPath) options.serverPath = '/'
  const wss = new WebSocketServer({ noServer: true })

  wss.on('connection', function connection(ws: WsWithData) {
    console.info(`ws client connected ${ws.id} ws clients now are ${wss.clients.values.length}`, ws.meta)

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
      for (const c of wss.clients as unknown as WsWithData[]) {
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
        events.onEnter(wss, ws as unknown as WsWithData).catch((err) => {
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
        ;(ws as unknown as WsWithData).id =
          'websocket_' + Math.floor(Math.random() * 1000000).toString() + '-' + Date.now()
        ;(ws as unknown as WsWithData).isAlive = true
        ;(ws as unknown as WsWithData).type = 'websocket'
        ;(ws as unknown as WsWithData).path = options?.serverPath || '/'
        ;(ws as unknown as WsWithData).room = (request.url || 'public').split('room=')[1]?.split('&')[0] || 'public'
        ;(ws as unknown as WsWithData).key = (request.url || 'public').split('key=')[1]?.split('&')[0] || 'public'

        if (events.onUpgrade) {
          try {
            events
              .onUpgrade(wss, ws as unknown as WsWithData)
              .then((meta) => {
                ;(ws as unknown as WsWithData).meta = meta
                wss.emit('connection', ws, request)
              })
              .catch((err) => {
                console.error('ws onUpgrade error', err)
                return socket.destroy()
              })
          } catch (err) {
            return socket.destroy()
          }
        } else {
          ;(ws as unknown as WsWithData).meta = {}

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
