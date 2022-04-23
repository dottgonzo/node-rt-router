"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//
const http_1 = require("http");
const ws_1 = __importDefault(require("../libs/ws"));
const pingRequest = (req, res) => {
    if (req.url === '/ping') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(`{pong:true}`);
    }
};
const server = (0, http_1.createServer)(pingRequest);
(0, ws_1.default)(server, {
    onEnter: async (wsServer, wsClient) => {
        wsClient.send('ciao');
        console.log(`entered ${wsClient.id}`);
        console.log(wsServer.clients);
    },
    onExit: async (wsServer, wsClient) => {
        console.log(`exited ${wsClient.id}`);
        console.log(wsServer.clients);
    },
});
(0, ws_1.default)(server, {
    onEnter: async (wsServer, wsClient) => {
        wsClient.send('ciao');
        console.log(`entered ${wsClient.id}`);
        console.log(wsServer.clients);
    },
    onExit: async (wsServer, wsClient) => {
        console.log(`exited ${wsClient.id}`);
        console.log(wsServer.clients);
    },
}, { serverPath: '/test2' });
server.listen(8080, '0.0.0.0', () => {
    console.info('server is listening on http://localhost:8080');
});
//# sourceMappingURL=wsServer.js.map