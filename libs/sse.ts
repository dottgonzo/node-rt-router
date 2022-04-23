import type { IncomingMessage, Server, ServerResponse } from 'http'
import type { TClient } from '../'
export interface TSseClient extends TClient {
  type: 'sse'
}

export interface ReqWithData extends IncomingMessage, TSseClient {}
export interface TSseClientConnected extends TSseClient {
  send: (data: string) => void
}
function clientFromReq(req: ReqWithData) {
  return { isAlive: req.isAlive, type: 'sse' as 'sse', id: req.id, room: req.room, path: req.path }
}
function sseHandler(req: ReqWithData, res: ServerResponse, onConnecting: TSseEvents['onConnecting']) {
  req.isAlive = true
  req.type = 'sse'
  req.id = 'sse_' + Math.floor(Math.random() * 1000000).toString() + '-' + Date.now()
  req.room = req?.url?.split('room=')[1]?.split('&')[0] || '/'

  const client = Object.assign(clientFromReq(req), {
    send: (data: string) => {
      res.write(`data: ${data}\n\n`)
    },
  })

  if (onConnecting) {
    onConnecting(req, client)
  }
  res.writeHead(200, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
    'Access-Control-Max-Age': 2592000, // 30 days
    'Content-Type': 'text/event-stream',
  })

  return client
}

export type TSseEvents = {
  onConnecting?: (req: IncomingMessage, client: TSseClient) => void
  onConnected?: (req: IncomingMessage, client: TSseClientConnected) => void
  onExit?: (req: IncomingMessage, client: TSseClientConnected) => void
}
export type TSseServers = { clients: TSseClientConnected[] }
export default function (server: Server, events: TSseEvents, options?: { serverPath?: string }) {
  const sseServerClients: TSseServers = { clients: [] }

  function closeClient(req: ReqWithData, onExit?: TSseEvents['onExit']) {
    if (
      sseServerClients.clients.find((f) => {
        f.id === req.id
      })
    ) {
      if (onExit) {
        try {
          onExit(req, req as unknown as TSseClientConnected)
        } catch (err) {
          console.error('sse on exit error', err)
        }
      }
      sseServerClients.clients = sseServerClients.clients.filter((f) => {
        f.id !== req.id
      })
    }
  }

  server.on('request', (req, res) => {
    if (req.url === (options?.serverPath || '/')) {
      const r = req as ReqWithData
      r.path = options?.serverPath || '/'
      const client = sseHandler(r, res, events?.onConnecting)

      sseServerClients.clients.push(client)

      req.on('close', () => {
        closeClient(r, events?.onExit)
      })

      req.on('end', () => {
        closeClient(r, events?.onExit)
      })

      function ping(id: string) {
        setTimeout(() => {
          if (!sseServerClients.clients.find((f) => f.id === id)) return
          try {
            res.write(';p \n')
            ping(id)
          } catch (err) {
            console.error('ping error', err)
          }
        }, 20 * 1000)
      }
      ping(client.id)
      if (events?.onConnected) {
        events?.onConnected(req, client)
      }
    }
  })
  return sseServerClients
}
