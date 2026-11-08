"use strict";
// Watches this player's own death. The server brings players back about 5 seconds after they go
// down; when this game still shows them dead well after that, it tells the server, which then works
// them out of it. Everything is logged to client\logs\FMP.log with a [life] prefix for diagnosis.
Object.defineProperty(exports, "__esModule", { value: true });
const life_1 = require("../shared/life");
const kCheckMs = 1000;
// The server's respawn delay is 5 s, its retries add a few more: past this, something is wrong.
const kStuckAfterMs = 12000;
const kReportEveryMs = 5000;
let downSince = null;
let lastReport = 0;
const secondsSince = (since) => Math.round((Date.now() - since) / 1000);
Events.on("localPlayerDeath", () => {
    downSince = Date.now();
    lastReport = 0;
    console.log("[life] down");
});
// Tells the server this game has the player standing again, once per death.
const reportUp = (how) => {
    if (downSince === null) {
        return;
    }
    console.log(`[life] up after ${secondsSince(downSince)} s${how}`);
    downSince = null;
    Events.emitServer(life_1.LifeEvents.up);
};
Events.on("localPlayerRespawn", () => {
    reportUp("");
});
setInterval(() => {
    if (!LocalPlayer.isDead()) {
        reportUp(" (no respawn event)");
        return;
    }
    if (downSince === null) {
        // Down without the death event: count from now.
        downSince = Date.now();
        console.log("[life] down (no death event)");
    }
    const now = Date.now();
    if (now - downSince >= kStuckAfterMs && now - lastReport >= kReportEveryMs) {
        lastReport = now;
        const report = { secondsDown: secondsSince(downSince) };
        console.warn(`[life] still down after ${report.secondsDown} s; telling the server`);
        Events.emitServer(life_1.LifeEvents.stuck, report);
    }
}, kCheckMs);
