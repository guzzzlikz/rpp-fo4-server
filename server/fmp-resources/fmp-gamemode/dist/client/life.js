"use strict";
// Watches this player's own death. The server brings players back about 5 seconds after they go
// down; when this game still shows them dead well after that, it tells the server, which then works
// them out of it. Everything is logged to client\logs\FMP.log with a [life] prefix for diagnosis.
//
// A player who died with a weapon out got back up for everyone else but stayed lying on their own
// screen, though this game reported them up. So as they come back this side shakes them loose: the
// fly camera taken and given back at once, as the console's "tfc" twice, which hands the camera and
// controls back from whatever the death left holding them. The server adds its own (stopIdle, a move
// on the spot) once told they are up, and sends LifeEvents.shake for /unstuck.
Object.defineProperty(exports, "__esModule", { value: true });
const life_1 = require("../shared/life");
const kCheckMs = 1000;
// The server's respawn delay is 5 s, its retries add a few more: past this, something is wrong.
const kStuckAfterMs = 12000;
const kReportEveryMs = 5000;
// After the game reports them up, a moment for its own get-up before the shake.
const kShakeDelayMs = 300;
// How long the fly camera is held: a frame or two would do, this is plenty.
const kShakeHoldMs = 200;
let downSince = null;
let lastReport = 0;
// Sampled while alive: by the death event the game may already have put the weapon away.
let weaponDrawn = false;
let weaponDrawnAtDeath = false;
const secondsSince = (since) => Math.round((Date.now() - since) / 1000);
// The fly camera taken and given back. "held": something else had the camera (the death camera, a
// cinematic), so nothing was done; "released": done; "skipped": the fly camera was already on.
const shake = (why) => {
    if (NoClip.isEnabled()) {
        console.log(`[life] shake (${why}) skipped: the fly camera is already on`);
        return "skipped";
    }
    if (!NoClip.enable()) {
        console.warn(`[life] shake (${why}): the camera is held by something else`);
        return "held";
    }
    setTimeout(() => {
        if (NoClip.isEnabled()) {
            NoClip.disable();
        }
        console.log(`[life] shake (${why}) done`);
    }, kShakeHoldMs);
    return "released";
};
Events.on("localPlayerDeath", () => {
    downSince = Date.now();
    lastReport = 0;
    weaponDrawnAtDeath = weaponDrawn;
    console.log(`[life] down${weaponDrawnAtDeath ? " with a weapon out" : ""}`);
});
// Tells the server this game has the player standing again, once per death, after shaking them loose.
const reportUp = (how) => {
    if (downSince === null) {
        return;
    }
    console.log(`[life] up after ${secondsSince(downSince)} s${how}`);
    downSince = null;
    setTimeout(() => {
        const report = { weaponDrawn: weaponDrawnAtDeath, camera: shake("respawn") };
        Events.emitServer(life_1.LifeEvents.up, report);
    }, kShakeDelayMs);
};
Events.on("localPlayerRespawn", () => {
    reportUp("");
});
// The server asks for one (/unstuck, or its own recovery).
Events.on(life_1.LifeEvents.shake, () => {
    shake("server");
});
setInterval(() => {
    if (!LocalPlayer.isDead()) {
        weaponDrawn = LocalPlayer.getMovement()?.weaponDrawn === true;
        reportUp(" (no respawn event)");
        return;
    }
    if (downSince === null) {
        // Down without the death event: count from now.
        downSince = Date.now();
        weaponDrawnAtDeath = weaponDrawn;
        console.log(`[life] down (no death event)${weaponDrawnAtDeath ? " with a weapon out" : ""}`);
    }
    const now = Date.now();
    if (now - downSince >= kStuckAfterMs && now - lastReport >= kReportEveryMs) {
        lastReport = now;
        const report = { secondsDown: secondsSince(downSince) };
        console.warn(`[life] still down after ${report.secondsDown} s; telling the server`);
        Events.emitServer(life_1.LifeEvents.stuck, report);
    }
}, kCheckMs);
