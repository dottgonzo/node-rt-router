"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const sse_1 = __importDefault(require("./libs/sse"));
const ws_1 = __importDefault(require("./libs/ws"));
class RTServer {
    constructor(server, options, events) {
        this.wsServers = [];
        this.sseServers = [];
        if (!options.rootPath)
            options.rootPath = '/';
        server.on('request', (req, res) => {
            if (req.method === 'GET' && req.url === path_1.default.join(options.rootPath || '/', 'ping')) {
                res.setHeader('Content-Type', 'application/json');
                res.writeHead(200);
                return res.end(`{pong:true}`);
            }
            else if (req.method === 'POST' && events.onEcho && req.url === path_1.default.join(options.rootPath || '/', 'echo')) {
                try {
                    let data = '';
                    let obj;
                    const that = this;
                    req.on('data', (chunk) => {
                        data += chunk;
                    });
                    // curl -X POST -d '{"type":"websocket","room":"public","msg":"hello"}' http://localhost:8080/rt/echo
                    req.on('end', () => {
                        try {
                            obj = JSON.parse(data);
                            events.onEcho?.(Object.assign(JSON.parse(data), { req })).catch((err) => {
                                console.error('onEcho error:', err);
                            });
                        }
                        catch (err) {
                            res.writeHead(500);
                        }
                        finally {
                            res.end();
                        }
                    });
                }
                catch (err) {
                    console.error('echo err:', err);
                }
                //
            }
        });
        for (const rt of options.rt) {
            switch (rt.type) {
                case 'websocket':
                    const wsOptions = {};
                    if (events?.onConnected) {
                        wsOptions.onEnter = (s, c) => events.onConnected(c);
                    }
                    if (events?.onConnecting) {
                        wsOptions.onUpgrade = (s, c) => events.onConnecting(c);
                    }
                    if (events?.onMessage) {
                        wsOptions.onMessage = (s, c, data) => events.onMessage(c, data);
                    }
                    const wss = (0, ws_1.default)(server, wsOptions, { serverPath: path_1.default.join(options.rootPath, rt.path) });
                    this.wsServers.push(wss);
                    break;
                case 'sse':
                    const sseOptions = {};
                    if (events?.onConnected) {
                        sseOptions.onConnected = (s, c) => events.onConnected(c);
                    }
                    if (events?.onConnecting) {
                        sseOptions.onConnecting = (s, c) => events.onConnecting(c);
                    }
                    const sse = (0, sse_1.default)(server, sseOptions, { serverPath: path_1.default.join(options.rootPath, rt.path) });
                    this.sseServers.push(sse);
                    break;
                default:
                    throw new Error(`unknown rt type: ${rt.type}`);
            }
        }
    }
    send(id, msg) {
        try {
            this.sendToSseById(id, msg);
        }
        catch (err) {
            this.sendToWsById(id, msg);
        }
    }
    sendBy(obj) {
        if (obj.id && obj.type) {
            if (obj.type === 'websocket') {
                this.sendToWsById(obj.id, obj.msg);
            }
            else if (obj.type === 'sse') {
                this.sendToSseById(obj.id, obj.msg);
            }
        }
        else if (obj.room && obj.path && obj.type) {
            if (obj.type === 'websocket') {
                this.sendToWsGroup(obj.room, obj.path, obj.msg);
            }
            else if (obj.type === 'sse') {
                this.sendToSseGroup(obj.room, obj.path, obj.msg);
            }
        }
        else if (obj.path && obj.type) {
            if (obj.type === 'websocket') {
                this.sendToWsPath(obj.path, obj.msg);
            }
            else if (obj.type === 'sse') {
                this.sendToSsePath(obj.path, obj.path);
            }
        }
        else if (obj.room && obj.type) {
            if (obj.type === 'websocket') {
                this.sendToWsRoom(obj.room, obj.msg);
            }
            else if (obj.type === 'sse') {
                this.sendToSseRoom(obj.room, obj.room);
            }
        }
        else if (obj.room && obj.path) {
            this.sendToGroup(obj.room, obj.path, obj.msg);
        }
        else if (obj.room) {
            this.sendToRoom(obj.room, obj.msg);
        }
        else if (obj.path) {
            this.sendToPath(obj.path, obj.msg);
        }
        else if (obj.id) {
            this.send(obj.id, obj.msg);
        }
    }
    sendToWsById(id, msg) {
        if (!id)
            throw new Error('id is required');
        for (const ws of this.wsServers) {
            ;
            ws.clients.forEach((client) => {
                if (client.id === id) {
                    client.send(msg);
                    return true;
                }
            });
        }
        throw new Error(`client ${id} not found`);
    }
    sendToSseById(id, msg) {
        if (!id)
            throw new Error('id is required');
        for (const ws of this.sseServers) {
            ws.clients.forEach((client) => {
                if (client.id === id) {
                    client.send(msg);
                    return true;
                }
            });
        }
        throw new Error(`client ${id} not found`);
    }
    sendToWsByMetaId(id, msg) {
        if (!id)
            throw new Error('id is required');
        for (const ws of this.wsServers) {
            ;
            ws.clients.forEach((client) => {
                if (client?.meta?._id === id) {
                    client.send(msg);
                }
            });
        }
    }
    sendToSseByMetaId(id, msg) {
        if (!id)
            throw new Error('id is required');
        for (const ws of this.sseServers) {
            ws.clients.forEach((client) => {
                if (client?.meta?._id === id) {
                    client.send(msg);
                    return true;
                }
            });
        }
    }
    sendByMetaId(id, msg) {
        this.sendToWsByMetaId(id, msg);
        this.sendToSseByMetaId(id, msg);
    }
    sendToWsRoom(room, msg) {
        for (const se of this.wsServers) {
            se.clients.forEach((client) => {
                if (client.room === room) {
                    client.send(msg);
                }
            });
        }
    }
    sendToSseRoom(room, msg) {
        for (const se of this.sseServers) {
            se.clients.forEach((client) => {
                if (client.room === room) {
                    client.send(msg);
                }
            });
        }
    }
    sendToRoom(room, msg) {
        this.sendToSseRoom(room, msg);
        this.sendToWsRoom(room, msg);
    }
    sendToWsPath(wspath, msg) {
        for (const ws of this.wsServers) {
            ;
            ws.clients.forEach((client) => {
                if (client.path === wspath) {
                    client.send(msg);
                }
            });
        }
    }
    sendToSsePath(wspath, msg) {
        for (const se of this.sseServers) {
            se.clients.forEach((client) => {
                if (client.path === wspath) {
                    client.send(msg);
                }
            });
        }
    }
    sendToPath(wspath, msg) {
        this.sendToSsePath(wspath, msg);
        this.sendToWsPath(wspath, msg);
    }
    sendToWsGroup(room, wspath, msg) {
        for (const ws of this.wsServers) {
            ;
            ws.clients.forEach((client) => {
                if (client.path === wspath && client.room === room) {
                    client.send(msg);
                }
            });
        }
    }
    sendToSseGroup(room, wspath, msg) {
        for (const se of this.sseServers) {
            se.clients.forEach((client) => {
                if (client.path === wspath && client.room === room) {
                    client.send(msg);
                }
            });
        }
    }
    sendToGroup(room, wspath, msg) {
        this.sendToSseGroup(room, wspath, msg);
        this.sendToWsGroup(room, wspath, msg);
    }
    broadcastWs(msg) {
        for (const ws of this.wsServers) {
            ws.clients.forEach((client) => {
                client.send(msg);
            });
        }
    }
    broadcastSse(msg) {
        for (const se of this.sseServers) {
            se.clients.forEach((client) => {
                client.send(msg);
            });
        }
    }
    broadcast(msg) {
        this.broadcastWs(msg);
        this.broadcastSse(msg);
    }
}
exports.default = RTServer;
//# sourceMappingURL=index.js.map