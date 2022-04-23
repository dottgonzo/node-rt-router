//
import { createServer, type RequestListener } from 'http'
import genServers from '../'

const pingRequest: RequestListener = (req, res) => {
  if (req.url === '/ping') {
    res.setHeader('Content-Type', 'application/json')

    res.writeHead(200)
    res.end(`{pong:true}`)
  }
}
const server = createServer(pingRequest)
const wsSrv: { path: string; type: 'sse' | 'websocket' } = { path: '/ws', type: 'websocket' }
const sseSrv: { path: string; type: 'sse' | 'websocket' } = { path: '/sse', type: 'sse' }
const rt = [wsSrv, sseSrv]
const servers = new genServers(
  server,
  { rt, rootPath: '/rt', echoServer: true },
  {
    onConnected: async (wsClient) => {
      wsClient.send('ciao')
      console.log(`entered ${wsClient.id}`)
    },
    onEcho: async (wsClient) => {
      console.log(`onEcho ${wsClient.id}`)
      return wsClient
    },
  }
)
console.log(servers)
server.listen(8080, '0.0.0.0', () => {
  console.info('server is listening on http://localhost:8080')
})
