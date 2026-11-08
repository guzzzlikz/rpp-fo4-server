"use strict";
// The emote wheel's conversation, compiled into both halves.
//
//   client -> server  list   asks for the emotes this server has
//                     play   EmotePlay: plays one on the sender
//                     stop   back to the stance
//   server -> client  list   EmoteList
Object.defineProperty(exports, "__esModule", { value: true });
exports.readEmoteList = exports.readEmotePlay = exports.EmoteEvents = void 0;
exports.EmoteEvents = {
    list: "rp:emote:list",
    play: "rp:emote:play",
    stop: "rp:emote:stop",
};
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
const readEmotePlay = (payload) => {
    const name = asRecord(payload)["name"];
    return { name: typeof name === "string" ? name.toLowerCase().slice(0, 24) : "" };
};
exports.readEmotePlay = readEmotePlay;
const readEmoteList = (payload) => {
    const raw = asRecord(payload)["emotes"];
    const emotes = Array.isArray(raw)
        ? raw.flatMap((entry) => {
            const fields = asRecord(entry);
            const name = fields["name"];
            const label = fields["label"];
            return typeof name === "string" && typeof label === "string" ? [{ name, label }] : [];
        })
        : [];
    return { emotes };
};
exports.readEmoteList = readEmoteList;
