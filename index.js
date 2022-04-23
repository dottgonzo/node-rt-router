"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsServer = void 0;
const ws_1 = require("ws");
function setAlive(ws) {
    ws.isAlive = true;
}
function unsetClient(wsServer, wsClient, interval, onExit) {
    if (onExit) {
        try {
            onExit(wsServer, wsClient);
        }
        catch (err) {
            console.error('onExitError', err);
        }
    }
    clearInterval(interval);
    wsClient.terminate();
}
function wsServer(server, events, options) {
    if (!options)
        options = {};
    if (!options.serverPath)
        options.serverPath = '/';
    const wss = new ws_1.WebSocketServer({ noServer: true });
    wss.on('connection', function connection(ws) {
        setAlive(ws);
        ws.on('pong', () => {
            setAlive(ws);
        });
        ws.on('ping', () => {
            setAlive(ws);
        });
        ws.on('message', (data) => {
            setAlive(ws);
            console.log('received: %s', data);
        });
        const interval = setInterval(function ping() {
            for (const c of wss.clients) {
                if (!c.isAlive) {
                    return unsetClient(wss, c, interval, events.onExit);
                }
                c.isAlive = false;
                c.ping(() => { });
            }
        }, 30000);
        wss.on('close', () => {
            unsetClient(wss, ws, interval, events.onExit);
        });
        if (events.onEnter) {
            try {
                events.onEnter(wss, ws);
            }
            catch (err) {
                unsetClient(wss, ws, interval, events.onExit);
            }
        }
    });
    server.on('upgrade', function upgrade(request, socket, head) {
        let mainUri;
        if (request?.url) {
            mainUri = request.url.split('?')[0];
        }
        else {
            mainUri = '/';
        }
        if (mainUri === options?.serverPath) {
            wss.handleUpgrade(request, socket, head, (ws, request) => {
                ;
                ws.id = Math.floor(Math.random() * 1000000).toString() + '-' + Date.now();
                ws.isAlive = true;
                ws.urlParsed = request.url || '/';
                if (events.onUpgrade) {
                    try {
                        events.onUpgrade(wss, ws);
                        wss.emit('connection', ws, request);
                    }
                    catch (err) {
                        socket.destroy();
                    }
                }
                else {
                    wss.emit('connection', ws, request);
                }
            });
        }
        else if (options?.single) {
            socket.destroy();
        }
        else {
            console.log('forward server after wsserver configuration for ' + options?.serverPath);
        }
    });
    return wss;
}
exports.wsServer = wsServer;
//# sourceMappingURL=index.js.map