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
      client.meta = meta
    } catch (err) {
      console.error(err)
      throw err
    }
  } else {
    req.meta = {}
    client.meta = {}
  }
  res.writeHead(200, {
    'Access-Control-Max-Age': 2592000, // 30 days
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })
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

  function closeClient(
    req: ReqWithData,
    res: ServerResponse,
    client: TSseClientConnected,
    onExit?: TSseEvents['onExit']
  ) {
    if (sseServerClients.clients.find((f) => f.id === req.id)) {
      if (onExit) {
        try {
          onExit(req, client).catch((err) => {
            console.error('sse on exit error', err)
          })
        } catch (err) {
          console.error('sse on exit error', err)
        }
      }
      sseServerClients.clients = sseServerClients.clients.filter((f) => f.id !== req.id)
      console.info(
        `sse client disconnected ${client?.id} ws clients now are ${sseServerClients?.clients?.length}`,
        client?.meta
      )
    } else {
      console.warn('try to close a client that is not connected', client)
    }
    res.end()
  }

  server.on('request', (req, res) => {
    try {
      if (req.method === 'GET' && req?.url?.split('?')[0] === (options?.serverPath || '/')) {
        const r = req as ReqWithData
        r.path = options?.serverPath || '/'
        sseHandler(r, res, events?.onConnecting)
          .then((client) => {
            if (!client?.id) throw new Error('sse client id is empty')
            sseServerClients.clients.push(client as TSseClientConnected)
            console.info(
              `sse client connected ${client?.id} sse clients now are ${sseServerClients.clients.length}`,
              client?.meta,
              client?.id
            )

            req.on('close', () => {
              closeClient(r, res, client as TSseClientConnected, events?.onExit)
            })

            req.on('end', () => {
              closeClient(r, res, client as TSseClientConnected, events?.onExit)
            })

            function ping(id: string) {
              setTimeout(() => {
                if (sseServerClients.clients.find((f) => f.id === id)) {
                  try {
                    res.write(';p \n')
                    ping(id)
                  } catch (err) {
                    console.error('ping error', err)
                  }
                }
              }, 20 * 1000)
            }
            ping((client as TSseClientConnected).id)
            if (events?.onConnected) {
              events
                ?.onConnected(req, client as TSseClientConnected)
                .then(() => {
                  console.info('sse on connected done')
                })
                .catch((err) => {
                  console.error('sse onConnected error', err)
                })
            }
          })
          .catch((err) => {
            console.error('sse unauth error', err)
          })
      }
    } catch (err) {
      console.error(err)
    }
  })
  return sseServerClients
}
