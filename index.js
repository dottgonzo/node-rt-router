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
            if (req.method === 'GET' && req.url === path_1.default.join(options.rootPath || '/', '/ping')) {
                res.setHeader('Content-Type', 'application/json');
                res.writeHead(200);
                console.info('send pong response');
                return res.end(`{pong:true}`);
            }
            else if (req.method === 'GET' && req.url === path_1.default.join(options.rootPath || '/', '/healthz')) {
                res.writeHead(200);
                return res.end();
            }
            else if (events.onApiCall &&
                req.method === 'GET' &&
                req.url?.includes(options.rootPath ? options.rootPath + '/api' : '/api') &&
                req?.url?.split('/api/')[1]?.split('?')?.[0]?.split('/')?.[0]) {
                const apiPageName = req?.url.split('/api/')[1].split('?')[0].split('/')[0];
                const that = this;
                events
                    .onApiCall(req)
                    .then(() => {
                    switch (apiPageName) {
                        case 'clients':
                            res.setHeader('Content-Type', 'application/json');
                            res.writeHead(200);
                            return res.end(JSON.stringify(that.getAllClients()));
                        case 'ws_clients':
                            res.setHeader('Content-Type', 'application/json');
                            res.writeHead(200);
                            return res.end(JSON.stringify(that.getWsClients()));
                        case 'sse_clients':
                            res.setHeader('Content-Type', 'application/json');
                            res.writeHead(200);
                            return res.end(JSON.stringify(that.getSSeClients()));
                        default:
                            break;
                    }
                })
                    .catch((err) => {
                    res.writeHead(500);
                    console.error('onApiCall error', err);
                    res.end(err?.message);
                });
            }
            else if (options.echoServerPath &&
                req.method === 'POST' &&
                events.onEcho &&
                req.url === path_1.default.join(options.rootPath || '/', options?.echoServerPath || '/echo')) {
                try {
                    console.info('echo server request');
                    let data = '';
                    let obj;
                    req.on('data', (chunk) => {
                        data += chunk;
                    });
                    req.on('end', () => {
                        try {
                            obj = JSON.parse(data);
                        }
                        catch (err) {
                            res.writeHead(500);
                            return res.end();
                        }
                        events
                            .onEcho?.(req, obj)
                            .then((answer) => {
                            if (answer) {
                                res.setHeader('Content-Type', 'application/json');
                                res.write(JSON.stringify(answer));
                            }
                            else {
                                res.writeHead(200);
                            }
                        })
                            .catch((err) => {
                            console.error('onEcho error:', err);
                            res.writeHead(500);
                        })
                            .finally(() => {
                            return res.end();
                        });
                    });
                }
                catch (err) {
                    console.error('echo err:', err);
                    return res.end();
                }
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
    sendBy(obj, channel) {
        if (obj.id && obj.type) {
            if (obj.type === 'websocket') {
                this.sendToWsById(obj.id, obj.msg);
            }
            else if (obj.type === 'sse') {
                this.sendToSseById(obj.id, obj.msg, channel);
            }
        }
        else if (obj.room && obj.path && obj.type) {
            if (obj.type === 'websocket') {
                this.sendToWsGroup(obj.room, obj.path, obj.msg);
            }
            else if (obj.type === 'sse') {
                this.sendToSseGroup(obj.room, obj.path, obj.msg, channel);
            }
        }
        else if (obj.path && obj.type) {
            if (obj.type === 'websocket') {
                this.sendToWsPath(obj.path, obj.msg);
            }
            else if (obj.type === 'sse') {
                this.sendToSsePath(obj.path, obj.path, channel);
            }
        }
        else if (obj.room && obj.type) {
            if (obj.type === 'websocket') {
                this.sendToWsRoom(obj.room, obj.msg);
            }
            else if (obj.type === 'sse') {
                this.sendToSseRoom(obj.room, obj.room, channel);
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
    sendToSseById(id, msg, channel) {
        if (!id)
            throw new Error('id is required');
        for (const sse of this.sseServers) {
            sse.clients.forEach((client) => {
                if (client.id === id) {
                    client.send(msg, channel);
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
        throw new Error(`client ${id} not found`);
    }
    sendToSseByMetaId(id, msg, channel) {
        if (!id)
            throw new Error('id is required');
        for (const sse of this.sseServers) {
            sse.clients.forEach((client) => {
                if (client?.meta?._id === id) {
                    client.send(msg, channel);
                    return true;
                }
            });
        }
        throw new Error(`client ${id} not found`);
    }
    sendByMetaId(id, msg) {
        try {
            this.sendToWsByMetaId(id, msg);
        }
        catch (err) {
            try {
                this.sendToSseByMetaId(id, msg);
            }
            catch (err) {
                throw new Error(`client ${id} not found`);
            }
        }
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
    sendToSseRoom(room, msg, channel) {
        for (const se of this.sseServers) {
            se.clients.forEach((client) => {
                if (client.room === room) {
                    client.send(msg, channel);
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
    sendToSsePath(wspath, msg, channel) {
        for (const se of this.sseServers) {
            se.clients.forEach((client) => {
                if (client.path === wspath) {
                    client.send(msg, channel);
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
    sendToSseGroup(room, wspath, msg, channel) {
        for (const se of this.sseServers) {
            se.clients.forEach((client) => {
                if (client.path === wspath && client.room === room) {
                    client.send(msg, channel);
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
    closeWsById(id) {
        if (!id)
            throw new Error('id is required');
        for (const ws of this.wsServers) {
            ;
            ws.clients.forEach((client) => {
                if (client.id === id) {
                    client.close();
                    return true;
                }
            });
        }
        throw new Error(`client ${id} not found`);
    }
    closeSseById(id) {
        if (!id)
            throw new Error('id is required');
        for (const se of this.sseServers) {
            se.clients.forEach((client) => {
                if (client.id === id) {
                    client.close();
                    return true;
                }
            });
        }
        throw new Error(`client ${id} not found`);
    }
    closeById(id) {
        try {
            this.closeWsById(id);
        }
        catch (err) {
            try {
                this.closeSseById(id);
            }
            catch (err) {
                throw new Error(`client ${id} not found`);
            }
        }
    }
    getWsClients() {
        let clients = [];
        for (const ws of this.wsServers) {
            ;
            ws.clients.forEach((client) => {
                clients.push(client);
            });
        }
        return clients;
    }
    getSSeClients() {
        let clients = [];
        for (const sse of this.sseServers) {
            ;
            sse.clients.forEach((client) => {
                clients.push(client);
            });
        }
        return clients;
    }
    getAllClients() {
        return this.getSSeClients().concat(this.getWsClients());
    }
}
exports.default = RTServer;
//# sourceMappingURL=index.js.map