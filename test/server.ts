//
import { createServer, type RequestListener } from 'http'
import { wsServer } from '../index'

const pingRequest: RequestListener = (req, res) => {
  if (req.url === '/ping') {
    res.setHeader('Content-Type', 'application/json')

    res.writeHead(200)
    res.end(`{pong:true}`)
  }
}
const server = createServer(pingRequest)

wsServer(server, {
  onEnter: (wsServer, wsClient) => {
    wsClient.send('ciao')
    console.log(`entered ${wsClient.id}`)
    console.log(wsServer.clients)
  },
  onExit: (wsServer, wsClient) => {
    console.log(`exited ${wsClient.id}`)
    console.log(wsServer.clients)
  },
})
wsServer(
  server,
  {
    onEnter: (wsServer, wsClient) => {
      wsClient.send('ciao')
      console.log(`entered ${wsClient.id}`)
      console.log(wsServer.clients)
    },
    onExit: (wsServer, wsClient) => {
      console.log(`exited ${wsClient.id}`)
      console.log(wsServer.clients)
    },
  },
  { serverPath: '/test2' }
)
server.listen(8080, '0.0.0.0', () => {
  console.info('server is listening on http://localhost:8080')
})
