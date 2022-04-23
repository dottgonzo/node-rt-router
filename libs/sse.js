"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function clientFromReq(req) {
    return { isAlive: req.isAlive, type: 'sse', id: req.id, room: req.room, path: req.path };
}
function sseHandler(req, res, onConnecting) {
    req.isAlive = true;
    req.type = 'sse';
    req.id = 'sse_' + Math.floor(Math.random() * 1000000).toString() + '-' + Date.now();
    req.room = req?.url?.split('room=')[1]?.split('&')[0] || '/';
    const client = Object.assign(clientFromReq(req), {
        send: (data) => {
            res.write(`data: ${data}\n\n`);
        },
    });
    if (onConnecting) {
        onConnecting(req, client);
    }
    res.writeHead(200, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS, POST, GET',
        'Access-Control-Max-Age': 2592000,
        'Content-Type': 'text/event-stream',
    });
    return client;
}
function default_1(server, events, options) {
    const sseServerClients = { clients: [] };
    function closeClient(req, onExit) {
        if (sseServerClients.clients.find((f) => {
            f.id === req.id;
        })) {
            if (onExit) {
                try {
                    onExit(req, req);
                }
                catch (err) {
                    console.error('sse on exit error', err);
                }
            }
            sseServerClients.clients = sseServerClients.clients.filter((f) => {
                f.id !== req.id;
            });
        }
    }
    server.on('request', (req, res) => {
        if (req.url === (options?.serverPath || '/')) {
            const r = req;
            r.path = options?.serverPath || '/';
            const client = sseHandler(r, res, events?.onConnecting);
            sseServerClients.clients.push(client);
            req.on('close', () => {
                closeClient(r, events?.onExit);
            });
            req.on('end', () => {
                closeClient(r, events?.onExit);
            });
            function ping(id) {
                setTimeout(() => {
                    if (!sseServerClients.clients.find((f) => f.id === id))
                        return;
                    try {
                        res.write(';p \n');
                        ping(id);
                    }
                    catch (err) {
                        console.error('ping error', err);
                    }
                }, 20 * 1000);
            }
            ping(client.id);
            if (events?.onConnected) {
                events?.onConnected(req, client);
            }
        }
    });
    return sseServerClients;
}
exports.default = default_1;
//# sourceMappingURL=sse.js.map