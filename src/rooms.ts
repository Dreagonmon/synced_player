const encoder = new TextEncoder();

let uid = 10000;
const getUniqueId = () => {
    uid++;
    return `U${uid}`;
};

class EventListener {
    #id: string = "";
    #stream: ReadableStream | undefined = undefined;
    #controller: ReadableStreamDefaultController | undefined = undefined;

    constructor(id: string) {
        this.#id = id;
    }

    getId() {
        return this.#id;
    }

    makeResponse(onClose: ((uid: string) => void) | ((uid: string) => Promise<void>)) {
        this.#stream = new ReadableStream({
            start: (ctl) => {
                this.#controller = ctl;
                this.#sendRaw(":connected\r\n\r\n");
            },
            cancel: async () => {
                const rst = onClose(this.#id);
                if (rst instanceof Promise) {
                    await rst;
                }
            },
        });
        return new Response(this.#stream, {
            headers: {
                // "Access-Control-Allow-Origin": "*",
                "Content-Type": "text/event-stream",
            },
        });
    }

    #sendRaw(text: string) {
        if (this.#controller != undefined) {
            this.#controller.enqueue(encoder.encode(text));
        }
    }

    pingKeepalive() {
        this.#sendRaw(":ping\r\n\r\n");
    }

    close() {
        if (this.#stream != undefined) {
            this.#controller?.close();
            this.#controller = undefined;
            this.#stream = undefined;
        }
    }

    emitEvent(event: string | undefined, data: string) {
        if (event) {
            this.#sendRaw(`event: ${event}\r\n`);
        }
        data.split("\n").forEach((line) => {
            this.#sendRaw(`data: ${line.trimEnd()}\r\n`);
        });
        this.#sendRaw("\r\n");
    }
}

class Room {
    #id: string;
    #pwd: string;
    #subs: Map<string, EventListener> = new Map();
    #config: Record<string, unknown> = {};
    #lastModify: number = Date.now();
    constructor(roomId: string, adminPassword: string) {
        this.#id = roomId;
        this.#pwd = adminPassword;
        this.#lastModify = Date.now();
        // bind callback function
        this.unregisterListener = this.unregisterListener.bind(this);
    }

    getId() {
        return this.#id;
    }

    getLastModify() {
        return this.#lastModify;
    }

    checkPwd(pwd: string) {
        return pwd === this.#pwd;
    }

    setConfig(config: Record<string, unknown>) {
        this.#config = config;
        this.#lastModify = Date.now();
    }

    getConfig() {
        return this.#config;
    }

    pingKeepaliveClients() {
        for (const lst of this.#subs.values()) {
            try {
                lst.pingKeepalive();
            } catch {
                // CONTINUE IGNORE ERROR
            }
        }
    }

    unregisterListener(uid: string) {
        if (this.#subs.has(uid)) {
            this.#subs.delete(uid);
        }
    }

    startListen(): Response | undefined {
        const uid = getUniqueId();
        if (this.#subs.has(uid)) {
            this.#subs.get(uid)?.close();
            this.#subs.delete(uid);
        }
        const lst = new EventListener(uid);
        this.#subs.set(uid, lst);
        return lst.makeResponse(this.unregisterListener);
    }

    emitEventToClients(event: string | undefined, data: string) {
        for (const val of this.#subs.values()) {
            try {
                val.emitEvent(event, data);
            } catch {
                // CONTINUE IGNORE ERROR
            }
        }
    }

    close() {
        for (const val of this.#subs.values()) {
            try {
                val.close();
            } catch {
                // CONTINUE IGNORE ERROR
            }
        }
    }
}

const rooms: Map<string, Room> = new Map();

export const newRoom = (adminPassword: string) => {
    const rid = getUniqueId();
    const room = new Room(rid, adminPassword);
    rooms.set(rid, room);
    return room;
};

export const getRoom = (roomId: string) => {
    return rooms.get(roomId);
};

export const initStartTask = () => {
    // keepalive task
    const keepaliveTask = () => {
        for (const room of rooms.values()) {
            try {
                room.pingKeepaliveClients();
            } catch {
                // CONTINUE IGNORE ERROR
            }
        }
    };
    setInterval(keepaliveTask, 14 * 1000);
    // clean task
    const cleanTask = () => {
        const now = Date.now();
        const toRemove: Set<string> = new Set();
        for (const room of rooms.values()) {
            try {
                const roomModify = room.getLastModify();
                if (now - roomModify > 24 * 3600 * 1000) {
                    // timeout, clear
                    room.close();
                    toRemove.add(room.getId());
                }
            } catch {
                // CONTINUE IGNORE ERROR
            }
        }
        for (const roomId of toRemove) {
            rooms.delete(roomId);
        }
    };
    setInterval(cleanTask, 2 * 3600 * 1000);
    // return a handler to manully run task
    return () => {
        keepaliveTask();
        cleanTask();
    };
};

export const getInfo = () => {
    return {
        roomCount: rooms.size,
    }
};
