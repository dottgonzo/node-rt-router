import type { IncomingMessage, Server, ServerResponse } from 'http'
import type { TClient } from '../'
export interface TSseClient extends TClient {
  type: 'sse'
}

export interface ReqWithData extends IncomingMessage, TSseClient {}
export interface TSseClientConnected extends TSseClient {
  send: (data: string, channel?: string) => void
  close: () => void
}
function clientFromReq(req: ReqWithData) {
  return {
    isAlive: req.isAlive,
    type: 'sse' as 'sse',
    id: req.id,
    room: req.room,
    path: req.path,
    meta: req.meta,
    key: req.key,
  }
}
async function sseHandler(
  req: ReqWithData,
  res: ServerResponse,
  onConnecting: TSseEvents['onConnecting']
): Promise<TSseClientConnected> {
  req.isAlive = true
  req.type = 'sse'
  req.id = 'sse_' + Math.floor(Math.random() * 1000000).toString() + '-' + Date.now()
  req.room = req?.url?.split('room=')[1]?.split('&')[0] || '/'
  req.key = req?.url?.split('key=')[1]?.split('&')[0] || '/'

  const client: TSseClientConnected = Object.assign(clientFromReq(req), {
    send: (data: string, channel?: string) => {
      res.write(`${channel || 'data'}: ${data}\n\n`)
    },
    close: () => {
      res.end()
    },
  })

  if (onConnecting) {
    try {
      const meta = await onConnecting(req, client)
      req.meta = meta
      res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
        'Access-Control-Max-Age': 2592000, // 30 days
        'Content-Type': 'text/event-stream',
      })
    } catch (err) {
      console.error(err)
      throw err
    }
  } else {
    req.meta = {}
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
      'Access-Control-Max-Age': 2592000, // 30 days
      'Content-Type': 'text/event-stream',
    })
  }

  return client
}

export type TSseEvents = {
  onConnecting?: (req: IncomingMessage, client: TSseClient) => Promise<any>
  onConnected?: (req: IncomingMessage, client: TSseClientConnected) => Promise<void>
  onExit?: (req: IncomingMessage, client: TSseClientConnected) => Promise<void>
}
export type TSseServers = { clients: TSseClientConnected[] }
export default function (server: Server, events: TSseEvents, options?: { serverPath?: string }) {
  const sseServerClients: TSseServers = { clients: [] }

  function closeClient(req: ReqWithData, client: TSseClientConnected, onExit?: TSseEvents['onExit']) {
    if (
      sseServerClients.clients.find((f) => {
        f.id === req.id
      })
    ) {
      if (onExit) {
        try {
          onExit(req, client).catch((err) => {
            console.error('sse on exit error', err)
          })
        } catch (err) {
          console.error('sse on exit error', err)
        }
      }
      sseServerClients.clients = sseServerClients.clients.filter((f) => {
        f.id !== req.id
      })
      console.info(
        `sse client disconnected ${client?.id} ws clients now are ${sseServerClients?.clients?.length}`,
        client?.meta
      )
    }
  }

  server.on('request', (req, res) => {
    if (req.method === 'GET' && req?.url?.split('?')[0] === (options?.serverPath || '/')) {
      const r = req as ReqWithData
      r.path = options?.serverPath || '/'
      sseHandler(r, res, events?.onConnecting)
        .catch((err) => {
          console.error('sse unauth error', err)
        })
        .then((client) => {
          sseServerClients.clients.push(client as TSseClientConnected)
          console.info(
            `sse client connected ${client?.id} ws clients now are ${sseServerClients.clients.length}`,
            client?.meta
          )

          req.on('close', () => {
            closeClient(r, client as TSseClientConnected, events?.onExit)
          })

          req.on('end', () => {
            closeClient(r, client as TSseClientConnected, events?.onExit)
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
          ping((client as TSseClientConnected).id)
          if (events?.onConnected) {
            events?.onConnected(req, client as TSseClientConnected).catch((err) => {
              console.error('sse onConnected error', err)
            })
          }
        })
    }
  })
  return sseServerClients
}
