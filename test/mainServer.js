"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
//
const http_1 = require("http");
const __1 = __importDefault(require("../"));
const pingRequest = (req, res) => {
    if (req.url === '/ping') {
        res.setHeader('Content-Type', 'application/json');
        res.writeHead(200);
        res.end(`{pong:true}`);
    }
};
const server = (0, http_1.createServer)(pingRequest);
const wsSrv = { path: '/ws', type: 'websocket' };
const sseSrv = { path: '/sse', type: 'sse' };
const rt = [wsSrv, sseSrv];
const servers = new __1.default(server, { rt, rootPath: '/rt' }, {
    onConnected: async (wsClient) => {
        wsClient.send('ciao');
        console.log(`entered ${wsClient.id}`);
    },
    onEcho: async (wsClient) => {
        console.log(`onEcho ${wsClient.id}`);
    },
});
console.log(servers);
server.listen(8080, '0.0.0.0', () => {
    console.info('server is listening on http://localhost:8080');
});
//# sourceMappingURL=mainServer.js.map