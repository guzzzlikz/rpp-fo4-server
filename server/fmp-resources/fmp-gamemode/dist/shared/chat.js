"use strict";
// The gamemode's own chat, replacing FMP's native chat box, whose font and input do not take Cyrillic.
// Lines travel as JSON in script events, which keep any Unicode text intact; the box is a web page
// (ui/chat), which types and draws any script.
//
//   client -> server  send   ChatSend: a line the player typed, speech or a /command
//                     hello  the client's chat is up: which box to use?
//   server -> client  line   ChatLine: a line to show
//                     mode   ChatMode: which box to use; also broadcast when staff switch it
Object.defineProperty(exports, "__esModule", { value: true });
exports.readChatLine = exports.readChatSend = exports.cleanChatText = exports.kChatMaxLength = exports.readChatMode = exports.ChatEvents = void 0;
exports.ChatEvents = {
    send: "rp:chat:send",
    line: "rp:chat:line",
    hello: "rp:chat:hello",
    mode: "rp:chat:mode",
};
const readChatMode = (payload) => (asRecord(payload)["mode"] === "native" ? "native" : "custom");
exports.readChatMode = readChatMode;
exports.kChatMaxLength = 200;
const asRecord = (payload) => {
    if (typeof payload === "string") {
        try {
            payload = JSON.parse(payload);
        }
        catch {
            return {};
        }
    }
    return typeof payload === "object" && payload !== null ? payload : {};
};
// Control characters out, surrounding space trimmed, length capped. Untrusted: it comes from a client.
const cleanChatText = (text) => text
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, exports.kChatMaxLength);
exports.cleanChatText = cleanChatText;
const readChatSend = (payload) => {
    const text = asRecord(payload)["text"];
    return { text: typeof text === "string" ? (0, exports.cleanChatText)(text) : "" };
};
exports.readChatSend = readChatSend;
const readChatLine = (payload) => {
    const fields = asRecord(payload);
    const text = fields["text"];
    if (typeof text !== "string") {
        return null;
    }
    const color = fields["color"];
    const author = fields["author"];
    return {
        text,
        ...(typeof color === "number" && Number.isFinite(color) ? { color } : {}),
        ...(typeof author === "string" && author !== "" ? { author } : {}),
    };
};
exports.readChatLine = readChatLine;
