"use strict";
// Death as each side sees it. The server decides when a player comes back, but their game can stay
// down after the server already has them up (testers saw players lying there for good): the client
// reports that, and the server works them out of it (src/server/respawn.ts).
//
//   client -> server  stuck   LifeStuck: the game has shown this player dead for too long
//                     up      the game has this player standing again after a death: only now is
//                             it safe to hand their weapon back (an equip during the get-up left
//                             them lying there for good)
Object.defineProperty(exports, "__esModule", { value: true });
exports.readLifeStuck = exports.LifeEvents = void 0;
exports.LifeEvents = {
    stuck: "rp:life:stuck",
    up: "rp:life:up",
};
const readLifeStuck = (payload) => {
    const fields = typeof payload === "object" && payload !== null ? payload : {};
    const seconds = fields["secondsDown"];
    return { secondsDown: typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : 0 };
};
exports.readLifeStuck = readLifeStuck;
