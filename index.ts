import type { IncomingMessage, Server } from 'http'
import path from 'path'
import type { Server as wsDefaultServer } from 'ws'
import sseServer, { type TSseEvents, type TSseServers } from './libs/sse'
import wsServer, { type WsEvents, type WsWithData } from './libs/ws'
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
export type TOnEchoMessage = (obj: TRequestSendWithReq) => Promise<void>

export type TEvents = {
  onConnected?: TOnConnected
  onConnecting?: TOnConnecting
  onMessage?: TOnMessage
  onEcho?: TOnEchoMessage
}

export type TRequestSend = {
  type?: 'websocket' | 'sse'
  id?: string
  room?: string
  path?: string
  msg: any
  req: IncomingMessage
}
export interface TRequestSendWithReq extends TRequestSend {
  req: IncomingMessage
}
export default class RTServer {
  wsServers: wsDefaultServer[] = []
  sseServers: TSseServers[] = []
  constructor(
    server: Server,
    options: { rt: { path: string; type: 'websocket' | 'sse' }[]; rootPath?: string; echoServerPath?: string },
    events: TEvents
  ) {
    if (!options.rootPath) options.rootPath = '/'
    server.on('request', (req, res) => {
      if (req.method === 'GET' && req.url === path.join(options.rootPath || '/', '/ping')) {
        res.setHeader('Content-Type', 'application/json')

        res.writeHead(200)
        console.info('send pong response')
        return res.end(`{pong:true}`)
      } else if (req.method === 'GET' && req.url === path.join(options.rootPath || '/', '/healthz')) {
        res.writeHead(200)
        return res.end()
      } else if (req.method === 'GET' && req.url?.includes(options.rootPath ? options.rootPath + '/api' : '/api')) {
        const apiPageName = req.url.split('/api/')[1].split('?')[0].split('/')[0]
        switch (apiPageName) {
          case 'all':
            res.setHeader('Content-Type', 'application/json')
            res.writeHead(200)

            return res.end(JSON.stringify(this.getAllClients()))
          default:
            break
        }
      } else if (
        options.echoServerPath &&
        req.method === 'POST' &&
        events.onEcho &&
        req.url === path.join(options.rootPath || '/', options?.echoServerPath || '/echo')
      ) {
        try {
          console.info('echo server request')
          let data = ''
          let obj: TRequestSend
          req.on('data', (chunk) => {
            data += chunk
          })
          req.on('end', () => {
            try {
              obj = JSON.parse(data)
              events.onEcho?.(Object.assign(obj, { req })).catch((err) => {
                console.error('onEcho error:', err)
              })
            } catch (err) {
              res.writeHead(500)
            } finally {
              return res.end()
            }
          })
        } catch (err) {
          console.error('echo err:', err)
          return res.end()
        }
        //
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
  sendBy(obj: TRequestSend, channel?: string) {
    if (obj.id && obj.type) {
      if (obj.type === 'websocket') {
        this.sendToWsById(obj.id, obj.msg)
      } else if (obj.type === 'sse') {
        this.sendToSseById(obj.id, obj.msg, channel)
      }
    } else if (obj.room && obj.path && obj.type) {
      if (obj.type === 'websocket') {
        this.sendToWsGroup(obj.room, obj.path, obj.msg)
      } else if (obj.type === 'sse') {
        this.sendToSseGroup(obj.room, obj.path, obj.msg, channel)
      }
    } else if (obj.path && obj.type) {
      if (obj.type === 'websocket') {
        this.sendToWsPath(obj.path, obj.msg)
      } else if (obj.type === 'sse') {
        this.sendToSsePath(obj.path, obj.path, channel)
      }
    } else if (obj.room && obj.type) {
      if (obj.type === 'websocket') {
        this.sendToWsRoom(obj.room, obj.msg)
      } else if (obj.type === 'sse') {
        this.sendToSseRoom(obj.room, obj.room, channel)
      }
    } else if (obj.room && obj.path) {
      this.sendToGroup(obj.room, obj.path, obj.msg)
    } else if (obj.room) {
      this.sendToRoom(obj.room, obj.msg)
    } else if (obj.path) {
      this.sendToPath(obj.path, obj.msg)
    } else if (obj.id) {
      this.send(obj.id, obj.msg)
    }
  }
  sendToWsById(id: string, msg: string) {
    if (!id) throw new Error('id is required')
    for (const ws of this.wsServers) {
      ;(ws.clients as unknown as WsWithData[]).forEach((client) => {
        if (client.id === id) {
          client.send(msg)
          return true
        }
      })
    }
    throw new Error(`client ${id} not found`)
  }
  sendToSseById(id: string, msg: string, channel?: string) {
    if (!id) throw new Error('id is required')
    for (const ws of this.sseServers) {
      ws.clients.forEach((client) => {
        if (client.id === id) {
          client.send(msg, channel)
          return true
        }
      })
    }
    throw new Error(`client ${id} not found`)
  }
  sendToWsByMetaId(id: string, msg: string) {
    if (!id) throw new Error('id is required')
    for (const ws of this.wsServers) {
      ;(ws.clients as unknown as WsWithData[]).forEach((client) => {
        if (client?.meta?._id === id) {
          client.send(msg)
        }
      })
    }
    throw new Error(`client ${id} not found`)
  }
  sendToSseByMetaId(id: string, msg: string, channel?: string) {
    if (!id) throw new Error('id is required')
    for (const ws of this.sseServers) {
      ws.clients.forEach((client) => {
        if (client?.meta?._id === id) {
          client.send(msg, channel)
          return true
        }
      })
    }
    throw new Error(`client ${id} not found`)
  }
  sendByMetaId(id: string, msg: string) {
    try {
      this.sendToWsByMetaId(id, msg)
    } catch (err) {
      try {
        this.sendToSseByMetaId(id, msg)
      } catch (err) {
        throw new Error(`client ${id} not found`)
      }
    }
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
  sendToSseRoom(room: string, msg: string, channel?: string) {
    for (const se of this.sseServers) {
      se.clients.forEach((client) => {
        if (client.room === room) {
          client.send(msg, channel)
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
      ;(ws.clients as unknown as WsWithData[]).forEach((client) => {
        if (client.path === wspath) {
          client.send(msg)
        }
      })
    }
  }
  sendToSsePath(wspath: string, msg: string, channel?: string) {
    for (const se of this.sseServers) {
      se.clients.forEach((client) => {
        if (client.path === wspath) {
          client.send(msg, channel)
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
      ;(ws.clients as unknown as WsWithData[]).forEach((client) => {
        if (client.path === wspath && client.room === room) {
          client.send(msg)
        }
      })
    }
  }
  sendToSseGroup(room: string, wspath: string, msg: string, channel?: string) {
    for (const se of this.sseServers) {
      se.clients.forEach((client) => {
        if (client.path === wspath && client.room === room) {
          client.send(msg, channel)
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
  broadcastSse(msg: string) {
    for (const se of this.sseServers) {
      se.clients.forEach((client) => {
        client.send(msg)
      })
    }
  }
  broadcast(msg: string) {
    this.broadcastWs(msg)
    this.broadcastSse(msg)
  }
  closeWsById(id: string) {
    if (!id) throw new Error('id is required')
    for (const ws of this.wsServers) {
      ;(ws.clients as unknown as WsWithData[]).forEach((client) => {
        if (client.id === id) {
          client.close()
          return true
        }
      })
    }
    throw new Error(`client ${id} not found`)
  }
  closeSseById(id: string) {
    if (!id) throw new Error('id is required')
    for (const se of this.sseServers) {
      se.clients.forEach((client) => {
        if (client.id === id) {
          client.close()
          return true
        }
      })
    }
    throw new Error(`client ${id} not found`)
  }
  closeById(id: string) {
    try {
      this.closeWsById(id)
    } catch (err) {
      try {
        this.closeSseById(id)
      } catch (err) {
        throw new Error(`client ${id} not found`)
      }
    }
  }
  getWsClients() {
    let clients: TClient[] = []
    for (const ws of this.wsServers) {
      ;(ws.clients as unknown as TClient[]).forEach((client) => {
        clients.push(client)
      })
    }
    return clients
  }
  getSSeClients() {
    let clients: TClient[] = []
    for (const ws of this.sseServers) {
      ;(ws.clients as unknown as TClient[]).forEach((client) => {
        clients.push(client)
      })
    }
    return clients
  }
  getAllClients() {
    return this.getSSeClients().concat(this.getWsClients())
  }
}
