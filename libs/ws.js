"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const ws_1 = require("ws");
function setAlive(ws) {
    ws.isAlive = true;
}
function unsetClient(wsServer, wsClient, onExit) {
    console.log(`client ${wsClient.id} disconnected`);
    if (onExit) {
        try {
            onExit(wsServer, wsClient).catch((err) => {
                console.error('ws on exit error', err);
            });
        }
        catch (err) {
            console.error('onExitError', err);
        }
    }
    console.info(`ws client disconnected ${wsClient.id} ws clients now are ${wsServer?.clients?.size || 0}`, wsClient?.meta);
    return wsClient.terminate();
}
function default_1(server, events, options) {
    if (!options)
        options = {};
    if (!options.serverPath)
        options.serverPath = '/';
    const wss = new ws_1.WebSocketServer({ noServer: true });
    let previous = [];
    setInterval(() => {
        const newOnes = [];
        for (const c of wss.clients.values()) {
            newOnes.push(c);
            if (!c.isAlive) {
                return unsetClient(wss, c, events.onExit);
            }
            c.isAlive = false;
            c.ping(() => { });
        }
        for (const prev of previous) {
            if (!newOnes.find((f) => f.id === prev.id)) {
                return unsetClient(wss, prev, events.onExit);
            }
        }
        previous = newOnes;
    }, 30000);
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
            if (events.onMessage)
                events.onMessage(wss, ws, data.toString());
            console.log('received: %s', data);
        });
        wss.on('close', () => {
            unsetClient(wss, ws, events.onExit);
        });
        if (events.onEnter) {
            try {
                events.onEnter(wss, ws).catch((err) => {
                    console.error('ws onEnter error', err);
                });
            }
            catch (err) {
                unsetClient(wss, ws, events.onExit);
            }
        }
        console.info(`ws client connected ${ws.id} ws clients now are ${wss?.clients?.size || 0}`, ws.meta);
    });
    server.on('upgrade', function upgrade(request, socket, head) {
        try {
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
                    ws.id =
                        'websocket_' + Math.floor(Math.random() * 1000000).toString() + '-' + Date.now();
                    ws.isAlive = true;
                    ws.type = 'websocket';
                    ws.path = options?.serverPath || '/';
                    ws.room = (request.url || 'public').split('room=')[1]?.split('&')[0] || 'public';
                    ws.key = (request.url || 'public').split('key=')[1]?.split('&')[0] || 'public';
                    if (events.onUpgrade) {
                        try {
                            events
                                .onUpgrade(wss, ws)
                                .then((meta) => {
                                ;
                                ws.meta = meta;
                                wss.emit('connection', ws, request);
                            })
                                .catch((err) => {
                                console.error('ws onUpgrade error', err);
                                return socket.destroy();
                            });
                        }
                        catch (err) {
                            return socket.destroy();
                        }
                    }
                    else {
                        ;
                        ws.meta = {};
                        wss.emit('connection', ws, request);
                    }
                });
            }
            else if (options?.single) {
                socket.destroy();
            }
            else {
                return console.log('forward server after wsserver configuration for ' + options?.serverPath);
            }
        }
        catch (err) {
            console.error('upgrading protocol error', err);
        }
    });
    return wss;
}
exports.default = default_1;
//# sourceMappingURL=ws.js.map