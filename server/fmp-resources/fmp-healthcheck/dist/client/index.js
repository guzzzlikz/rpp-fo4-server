"use strict";
// Client half of the healthcheck: proves this player's game loaded the resource and can talk to the
// server. It pings once shortly after loading, and again on every F9 press; the answer shows as a
// HUD notification and in the client log (client/logs/FMP.log).
Object.defineProperty(exports, "__esModule", { value: true });
const protocol_1 = require("../shared/protocol");
const kTag = "[healthcheck]";
const kAutoPingDelayMs = 3000;
const kPingKey = "f9";
const ping = (reason) => {
    Events.emitServer(protocol_1.HealthEvents.ping, { sentAt: Date.now(), reason });
};
Events.on(protocol_1.HealthEvents.pong, (payload) => {
    const pong = (0, protocol_1.readPong)(payload);
    const rtt = Date.now() - pong.sentAt;
    const text = `Healthcheck OK: ${rtt} ms round trip, ${pong.playersOnline} online, framework ${pong.frameworkVersion}`;
    console.log(`${kTag} ${text}`);
    Hud.notify(text);
});
Key.bind(kPingKey, "down", () => {
    ping("key");
});
console.log(`${kTag} client script loaded`);
setTimeout(() => {
    ping("auto");
}, kAutoPingDelayMs);
