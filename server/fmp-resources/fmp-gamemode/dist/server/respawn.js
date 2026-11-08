"use strict";
// Death and getting back up. Nothing respawns a player on its own, and one `respawn()` is not always
// enough: testers saw players stay down for good. A respawn sent while their game is not ready for it
// is lost, and a timer armed before the gamemode reloads (`ensure fmp-gamemode`) dies with it. So:
//  - after the delay, respawn, then keep checking and asking again until their game reports them up;
//  - every few seconds, sweep for players who are down with nothing pending, and start over for them;
//  - staff have "/revive <player>" for whatever is left.
Object.defineProperty(exports, "__esModule", { value: true });
const accounts_1 = require("./accounts");
const chat_1 = require("./chat");
const players_1 = require("./players");
const kRespawnDelayMs = 5000;
// How long to wait for their game to report them up before asking again.
const kRetryMs = 2000;
const kMaxAttempts = 10;
const kSweepMs = 10000;
// Player id -> the timer of their next respawn attempt.
const pending = new Map();
const isGone = (player) => player.nickname === "";
const cancel = (player) => {
    const timer = pending.get(player.id);
    if (timer !== undefined) {
        clearTimeout(timer);
        pending.delete(player.id);
    }
};
// Attempt `attempt` of bringing them back: respawn if they are still down, then check again later.
const tryRespawn = (player, attempt) => {
    pending.delete(player.id);
    if (isGone(player)) {
        return;
    }
    if (!player.isDead) {
        if (attempt > 2) {
            console.log(`${(0, accounts_1.accountName)(player)} is up after ${attempt - 1} respawn attempts`);
        }
        return;
    }
    if (attempt > kMaxAttempts) {
        console.error(`${(0, accounts_1.accountName)(player)} is still down after ${kMaxAttempts} respawn attempts; /revive them or have them rejoin`);
        (0, chat_1.reply)(player, "The server could not bring you back. Ask staff for /revive, or rejoin.");
        return;
    }
    const sent = player.respawn();
    if (attempt > 1) {
        console.warn(`${(0, accounts_1.accountName)(player)} is still down: respawn attempt ${attempt}/${kMaxAttempts}${sent ? "" : " (not sent)"}`);
    }
    pending.set(player.id, setTimeout(() => tryRespawn(player, attempt + 1), kRetryMs));
};
const schedule = (player, delayMs) => {
    cancel(player);
    pending.set(player.id, setTimeout(() => tryRespawn(player, 1), delayMs));
};
Events.on("playerDeath", (player, killer) => {
    console.log(killer !== null ? `${(0, accounts_1.accountName)(killer)} killed ${(0, accounts_1.accountName)(player)}` : `${(0, accounts_1.accountName)(player)} died`);
    schedule(player, kRespawnDelayMs);
});
Events.on("playerDisconnect", (player) => {
    cancel(player);
});
// Down with nothing pending: a death this gamemode never heard of (it was reloading, or the event was
// lost) or a chain that gave up. Also runs once right after the gamemode starts.
const sweep = () => {
    for (const player of Player.all()) {
        if (player.isDead && !pending.has(player.id)) {
            console.warn(`${(0, accounts_1.accountName)(player)} found down with no respawn pending; respawning`);
            schedule(player, 0);
        }
    }
};
const sweeper = setInterval(sweep, kSweepMs);
setTimeout(sweep, 0);
Events.on("resourceStop", (resourceName) => {
    if (resourceName !== "fmp-gamemode") {
        return;
    }
    clearInterval(sweeper);
    pending.forEach((timer) => clearTimeout(timer));
    pending.clear();
});
(0, chat_1.registerCommands)(chat_1.AdminLevel.moderator, {
    // "/revive <player>": brings someone who is down back where they fell.
    revive: (player, args) => {
        const target = (0, players_1.findPlayer)(player, args[0]);
        if (target === null) {
            return;
        }
        if (!target.isDead) {
            (0, chat_1.reply)(player, `${(0, accounts_1.accountName)(target)} is not down`);
            return;
        }
        console.log(`${(0, accounts_1.accountName)(player)} revives ${(0, accounts_1.accountName)(target)}`);
        schedule(target, 0);
        (0, chat_1.reply)(player, `Reviving ${(0, accounts_1.accountName)(target)}`);
    },
});
