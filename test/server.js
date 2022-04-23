"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
//
const http_1 = require("http");
const index_1 = require("../index");
const pingRequest = (req, res) => {
    if (req.url === '/ping') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(`{pong:true}`);
    }
};
const server = (0, http_1.createServer)(pingRequest);
(0, index_1.wsServer)(server, {
    onEnter: (wsServer, wsClient) => {
        wsClient.send('ciao');
        console.log(`entered ${wsClient.id}`);
        console.log(wsServer.clients);
    },
    onExit: (wsServer, wsClient) => {
        console.log(`exited ${wsClient.id}`);
        console.log(wsServer.clients);
    },
});
(0, index_1.wsServer)(server, {
    onEnter: (wsServer, wsClient) => {
        wsClient.send('ciao');
        console.log(`entered ${wsClient.id}`);
        console.log(wsServer.clients);
    },
    onExit: (wsServer, wsClient) => {
        console.log(`exited ${wsClient.id}`);
        console.log(wsServer.clients);
    },
}, { serverPath: '/test2' });
server.listen(8080, '0.0.0.0', () => {
    console.info('server is listening on http://localhost:8080');
});
//# sourceMappingURL=server.js.map