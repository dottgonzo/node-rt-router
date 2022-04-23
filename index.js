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
        let found = false;
        for (const ws of this.wsServers) {
            ;
            ws.clients.forEach((client) => {
                if (client.id === id) {
                    client.send(msg);
                    found = true;
                    return;
                }
            });
        }
        if (found)
            return;
        for (const ws of this.sseServers) {
            ;
            ws.clients.forEach((client) => {
                if (client.id === id) {
                    client.send(msg);
                    found = true;
                    return;
                }
            });
        }
    }
    sendToRoom(room, msg) {
        for (const ws of this.wsServers) {
            ;
            ws.clients.forEach((client) => {
                if (client.room === room) {
                    client.send(msg);
                }
            });
        }
        for (const se of this.sseServers) {
            se.clients.forEach((client) => {
                if (client.room === room) {
                    client.send(msg);
                }
            });
        }
    }
    broadcast(msg) {
        for (const ws of this.wsServers) {
            ws.clients.forEach((client) => {
                client.send(msg);
            });
        }
        for (const se of this.sseServers) {
            se.clients.forEach((client) => {
                client.send(msg);
            });
        }
    }
}
exports.default = RTServer;
//# sourceMappingURL=index.js.map