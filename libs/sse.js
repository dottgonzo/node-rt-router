"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function clientFromReq(req) {
    return {
        isAlive: req.isAlive,
        type: 'sse',
        id: req.id,
        room: req.room,
        path: req.path,
        meta: req.meta,
        key: req.key,
    };
}
async function sseHandler(req, res, onConnecting) {
    req.isAlive = true;
    req.type = 'sse';
    req.id = 'sse_' + Math.floor(Math.random() * 1000000).toString() + '-' + Date.now();
    req.room = req?.url?.split('room=')[1]?.split('&')[0] || '/';
    req.key = req?.url?.split('key=')[1]?.split('&')[0] || '/';
    const client = Object.assign(clientFromReq(req), {
        send: (data, channel) => {
            res.write(`${channel || 'data'}: ${data}\n\n`);
        },
        close: () => {
            res.end();
        },
    });
    if (onConnecting) {
        try {
            const meta = await onConnecting(req, client);
            req.meta = meta;
            client.meta = meta;
        }
        catch (err) {
            console.error(err);
            throw err;
        }
    }
    else {
        req.meta = {};
        client.meta = {};
    }
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
    });
    return client;
}
function default_1(server, events, options) {
    const sseServerClients = { clients: [] };
    function closeClient(req, res, client, onExit) {
        if (sseServerClients.clients.find((f) => f.id === req.id)) {
            if (onExit) {
                try {
                    onExit(req, client).catch((err) => {
                        console.error('sse on exit error', err);
                    });
                }
                catch (err) {
                    console.error('sse on exit error', err);
                }
            }
            sseServerClients.clients = sseServerClients.clients.filter((f) => f.id !== req.id);
            console.info(`sse client disconnected ${client?.id} ws clients now are ${sseServerClients?.clients?.length}`, client?.meta);
        }
        else {
            console.warn('try to close a client that is not connected', client);
        }
        res.end();
    }
    server.on('request', (req, res) => {
        try {
            if (req.method === 'GET' && req?.url?.split('?')[0] === (options?.serverPath || '/')) {
                const r = req;
                r.path = options?.serverPath || '/';
                sseHandler(r, res, events?.onConnecting)
                    .then((client) => {
                    if (!client?.id)
                        throw new Error('sse client id is empty');
                    sseServerClients.clients.push(client);
                    console.info(`sse client connected ${client?.id} sse clients now are ${sseServerClients.clients.length}`, client?.meta, client?.id);
                    req.on('close', () => {
                        closeClient(r, res, client, events?.onExit);
                    });
                    req.on('end', () => {
                        closeClient(r, res, client, events?.onExit);
                    });
                    function ping(id) {
                        setTimeout(() => {
                            if (sseServerClients.clients.find((f) => f.id === id)) {
                                try {
                                    res.write(';p \n');
                                    ping(id);
                                }
                                catch (err) {
                                    console.error('ping error', err);
                                    if (!res.statusCode) {
                                        res.writeHead(500);
                                        return res.end();
                                    }
                                }
                            }
                        }, 20 * 1000);
                    }
                    ping(client.id);
                    if (events?.onConnected) {
                        events
                            ?.onConnected(req, client)
                            .then(() => {
                            console.info('sse on connected done');
                        })
                            .catch((err) => {
                            console.error('sse onConnected error', err);
                            res.end();
                        });
                    }
                })
                    .catch((err) => {
                    console.error('sse unauth error', err);
                    res.writeHead(500);
                    return res.end();
                });
            }
        }
        catch (err) {
            console.error(err);
            res.end();
        }
    });
    return sseServerClients;
}
exports.default = default_1;
//# sourceMappingURL=sse.js.map