import type { Server } from 'http'
import path from 'path'
import { Server as wsDefaultServer } from 'ws'
import sseServer, { TSseEvents, TSseServers } from './libs/sse'
import wsServer, { WsEvents, wsWithData } from './libs/ws'
export type TClient = {
  id: string
  path: string
  room: string
  isAlive: boolean
  type: 'websocket' | 'sse'
  meta: any
  key?: string
}
export interface TClientConnected extends TClient {
  send: (msg: string) => void
}

export type TOnConnected = (client: TClientConnected) => Promise<void>
export type TOnConnecting = (client: TClient) => Promise<any>
export type TOnMessage = (client: TClientConnected, data: string) => Promise<void>

export type TEvents = {
  onConnected?: TOnConnected
  onConnecting?: TOnConnecting
  onMessage?: TOnMessage
}

export default class RTServer {
  wsServers: wsDefaultServer[] = []
  sseServers: TSseServers[] = []
  constructor(
    server: Server,
    options: { rt: { path: string; type: 'websocket' | 'sse' }[]; rootPath?: string },
    events: { onConnected?: TOnConnected; onConnecting?: TOnConnecting; onMessage?: TOnMessage }
  ) {
    if (!options.rootPath) options.rootPath = '/'
    server.on('request', (req, res) => {
      if (req.url === path.join(options.rootPath || '/', 'ping')) {
        res.setHeader('Content-Type', 'application/json')

        res.writeHead(200)
        return res.end(`{pong:true}`)
      }
    })
    for (const rt of options.rt) {
      switch (rt.type) {
        case 'websocket':
          const wsOptions: WsEvents = {}

          if (events?.onConnected) {
            wsOptions.onEnter = (s, c) => (events.onConnected as TOnConnecting)(c)
          }
          if (events?.onConnecting) {
            wsOptions.onUpgrade = (s, c) => (events.onConnecting as TOnConnecting)(c)
          }
          if (events?.onMessage) {
            wsOptions.onMessage = (s, c, data) => (events.onMessage as TOnMessage)(c, data)
          }
          const wss = wsServer(server, wsOptions, { serverPath: path.join(options.rootPath, rt.path) })
          this.wsServers.push(wss)
          break
        case 'sse':
          const sseOptions: TSseEvents = {}

          if (events?.onConnected) {
            sseOptions.onConnected = (s, c) => (events.onConnected as TOnConnecting)(c)
          }
          if (events?.onConnecting) {
            sseOptions.onConnecting = (s, c) => (events.onConnecting as TOnConnecting)(c)
          }

          const sse = sseServer(server, sseOptions, { serverPath: path.join(options.rootPath, rt.path) })
          this.sseServers.push(sse)
          break
        default:
          throw new Error(`unknown rt type: ${rt.type}`)
      }
    }
  }
  send(id: string, msg: string) {
    try {
      this.sendToSseById(id, msg)
    } catch (err) {
      this.sendToWsById(id, msg)
    }
  }
  sendToWsById(id: string, msg: string) {
    if (!id) throw new Error('id is required')
    for (const ws of this.wsServers) {
      ;(ws.clients as unknown as wsWithData[]).forEach((client) => {
        if (client.id === id) {
          client.send(msg)
          return true
        }
      })
    }
    throw new Error(`client ${id} not found`)
  }
  sendToSseById(id: string, msg: string) {
    if (!id) throw new Error('id is required')
    for (const ws of this.sseServers) {
      ws.clients.forEach((client) => {
        if (client.id === id) {
          client.send(msg)
          return true
        }
      })
    }
    throw new Error(`client ${id} not found`)
  }
  sendToWsRoom(room: string, msg: string) {
    for (const se of this.wsServers) {
      se.clients.forEach((client: any) => {
        if (client.room === room) {
          client.send(msg)
        }
      })
    }
  }
  sendToSseRoom(room: string, msg: string) {
    for (const se of this.sseServers) {
      se.clients.forEach((client) => {
        if (client.room === room) {
          client.send(msg)
        }
      })
    }
  }
  sendToRoom(room: string, msg: string) {
    this.sendToSseRoom(room, msg)
    this.sendToWsRoom(room, msg)
  }
  sendToWsPath(wspath: string, msg: string) {
    for (const ws of this.wsServers) {
      ;(ws.clients as unknown as wsWithData[]).forEach((client) => {
        if (client.path === wspath) {
          client.send(msg)
        }
      })
    }
  }
  sendToSsePath(wspath: string, msg: string) {
    for (const se of this.sseServers) {
      se.clients.forEach((client) => {
        if (client.path === wspath) {
          client.send(msg)
        }
      })
    }
  }
  sendToPath(wspath: string, msg: string) {
    this.sendToSsePath(wspath, msg)
    this.sendToWsPath(wspath, msg)
  }
  sendToWsGroup(room: string, wspath: string, msg: string) {
    for (const ws of this.wsServers) {
      ;(ws.clients as unknown as wsWithData[]).forEach((client) => {
        if (client.path === wspath && client.room === room) {
          client.send(msg)
        }
      })
    }
  }
  sendToSseGroup(room: string, wspath: string, msg: string) {
    for (const se of this.sseServers) {
      se.clients.forEach((client) => {
        if (client.path === wspath && client.room === room) {
          client.send(msg)
        }
      })
    }
  }
  sendToGroup(room: string, wspath: string, msg: string) {
    this.sendToSseGroup(room, wspath, msg)
    this.sendToWsGroup(room, wspath, msg)
  }
  broadcastWs(msg: string) {
    for (const ws of this.wsServers) {
      ws.clients.forEach((client) => {
        client.send(msg)
      })
    }
  }
  broadcastSSe(msg: string) {
    for (const se of this.sseServers) {
      se.clients.forEach((client) => {
        client.send(msg)
      })
    }
  }
  broadcast(msg: string) {
    this.broadcastWs(msg)
    this.broadcastSSe(msg)
  }
}
