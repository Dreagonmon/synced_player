import { getInfo, getRoom, initStartTask, newRoom } from "./rooms.ts";
import { serveDir } from "@std/http";

const STATIC_DIR = "static";

const response = (code = 200, data: string | undefined = undefined) => {
    if (typeof data !== "string") {
        switch (code) {
            case 200:
                data = "Ok";
                break;
            case 400:
                data = "Bad Request";
                break;
            case 404:
                data = "Not Found";
                break;
            case 409:
                data = "Conflict";
                break;
            default:
                data = "";
                break;
        }
    }
    return new Response(
        JSON.stringify({ code, data }),
        {
            headers: {
                // "Access-Control-Allow-Origin": "*",
                "Content-Type": "text/json",
            },
        },
    );
};

const responseJSON = (data: Record<string, unknown> = {}) => {
    return new Response(
        JSON.stringify({ code: 200, data }),
        {
            headers: {
                // "Access-Control-Allow-Origin": "*",
                "Content-Type": "application/json",
            },
        },
    );
};

const handler: Deno.ServeHandler = async (req, _) => {
    const url = new URL(req.url);
    const path = url.pathname;
    if (req.method.toUpperCase() === "POST") {
        // read body as json
        let paramsObj: unknown;
        try {
            paramsObj = await req.json();
        } catch {
            return response(400);
        }
        // const body = await req.json();
        if (path == ("/api/createRoom")) {
            const params = paramsObj as { pwd?: string };
            const pwd = params.pwd;
            if (!pwd) {
                return response(400);
            }
            const room = newRoom(pwd);
            return responseJSON({
                roomId: room.getId(),
            });
        } else if (path.startsWith("/api/config/")) {
            const rid = path.substring("/api/config/".length);
            const params = paramsObj as { pwd?: string; config?: Record<string, unknown> };
            if (!params.pwd || !params.config) {
                return response(400);
            }
            const room = getRoom(rid);
            if (room && room.checkPwd(params.pwd)) {
                room.setConfig(params.config);
                return response(200);
            }
            return response(404);
        } else if (path.startsWith("/api/event/")) {
            const rid = path.substring("/api/event/".length);
            const params = paramsObj as { pwd?: string; event?: string; data?: string };
            if (!params.pwd || !params.event) {
                return response(400);
            }
            const room = getRoom(rid);
            if (room && room.checkPwd(params.pwd)) {
                room.emitEventToClients(params.event, params.data ?? "");
                return response(200);
            }
            return response(404);
        }
        return response(404);
    } else if (req.method.toUpperCase() === "GET") {
        if (path.startsWith("/api/listen/")) {
            const rid = path.substring("/api/listen/".length);
            if (rid.length <= 0 || rid.indexOf("/") >= 0) {
                return response(400);
            }
            const resp = getRoom(rid)?.startListen();
            if (resp) {
                return resp;
            }
            return response(404);
        } else if (path.startsWith("/api/config/")) {
            const rid = path.substring("/api/config/".length);
            if (rid.length <= 0 || rid.indexOf("/") >= 0) {
                return response(400);
            }
            const config = getRoom(rid)?.getConfig();
            if (config) {
                return responseJSON(config);
            }
            return response(404);
        } else if (path.startsWith("/api/__info__")) {
            const config = getInfo();
            if (config) {
                return responseJSON(config);
            }
            return response(404);
        }

        return await serveDir(req, {
            urlRoot: "",
            fsRoot: STATIC_DIR,
            showDirListing: false,
            showIndex: true,
        });
    }
    // else if (req.method === "OPTIONS") {
    //     return new Response("200 OK", {
    //         headers: {
    //             "Access-Control-Allow-Origin": "*",
    //             "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    //             "Access-Control-Allow-Headers": req.headers.get("Access-Control-Request-Headers") ?? "*",
    //             "Access-Control-Max-Age": "86400",
    //         }
    //     });
    // }
    return response(404);
};

// start
initStartTask();
export default {
    fetch: handler,
} satisfies Deno.ServeDefaultExport;
