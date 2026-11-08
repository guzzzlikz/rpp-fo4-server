"use strict";
// Death as each side sees it. The server decides when a player comes back, but their own game can
// stay down after the server and everyone else already have them up: seen after deaths with a weapon
// in hand. The client reports what it sees and the server works them out of it (src/server/respawn.ts).
//
//   client -> server  stuck   LifeStuck: the game has shown this player dead for too long
//                     up      LifeUp: the game has this player standing again after a death; only now
//                             is it safe to put anything on them, and the server now shakes their body
//                             loose (stopIdle, a move on the spot)
//   server -> client  shake   toggle the fly camera once, as the console's "tfc" twice: releases a
//                             camera and controls the death left behind
Object.defineProperty(exports, "__esModule", { value: true });
exports.readLifeUp = exports.readLifeStuck = exports.LifeEvents = void 0;
exports.LifeEvents = {
    stuck: "rp:life:stuck",
    up: "rp:life:up",
    shake: "rp:life:shake",
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
const readLifeStuck = (payload) => {
    const seconds = asRecord(payload)["secondsDown"];
    return { secondsDown: typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : 0 };
};
exports.readLifeStuck = readLifeStuck;
const readLifeUp = (payload) => {
    const fields = asRecord(payload);
    const camera = fields["camera"];
    return {
        weaponDrawn: fields["weaponDrawn"] === true,
        camera: camera === "released" || camera === "held" ? camera : "skipped",
    };
};
exports.readLifeUp = readLifeUp;
