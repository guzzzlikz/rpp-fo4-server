// Client half of the healthcheck: proves this player's game loaded the resource and can talk to the
// server. It pings once shortly after loading, and again on every F9 press; the answer shows as a
// HUD notification and in the client log (client/logs/FMP.log).

import { HealthEvents, type Ping, readPong } from "../shared/protocol";

const kTag = "[healthcheck]";
const kAutoPingDelayMs = 3000;
const kPingKey = "f9";

const ping = (reason: Ping["reason"]): void => {
    Events.emitServer(HealthEvents.ping, { sentAt: Date.now(), reason } satisfies Ping);
};

Events.on(HealthEvents.pong, (payload: unknown): void => {
    const pong = readPong(payload);
    const rtt: number = Date.now() - pong.sentAt;
    const text = `Healthcheck OK: ${rtt} ms round trip, ${pong.playersOnline} online, framework ${pong.frameworkVersion}`;
    console.log(`${kTag} ${text}`);
    Hud.notify(text);
});

Key.bind(kPingKey, "down", (): void => {
    ping("key");
});

console.log(`${kTag} client script loaded`);
setTimeout((): void => {
    ping("auto");
}, kAutoPingDelayMs);
