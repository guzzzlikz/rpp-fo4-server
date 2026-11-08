"use strict";
// Death and getting back up. Nothing respawns a player on its own, and one `respawn()` is not always
// enough: testers saw players stay down for good. A respawn sent while their game is not ready for it
// is lost, and a timer armed before the gamemode reloads (`ensure fmp-gamemode`) dies with it. So:
//  - after the delay, respawn, then keep checking and asking again until their game reports them up;
//  - every few seconds, sweep for players who are down with nothing pending, and start over for them;
//  - staff have "/revive <player>" for whatever is left.
// And the other way round: the server has them up but their game still shows them dead. respawn()
// does nothing for a player the server thinks alive, so their client reports it (src/client/life.ts)
// and the server escalates: a move on the spot, then a fresh death the normal path brings back from.
Object.defineProperty(exports, "__esModule", { value: true });
const life_1 = require("../shared/life");
const accounts_1 = require("./accounts");
const chat_1 = require("./chat");
const equipment_1 = require("./equipment");
const places_1 = require("./places");
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
        // Their equipment goes back on only once their own game reports them standing (LifeEvents.up).
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
    (0, equipment_1.freeze)(player);
    awaitingUp.add(player.id);
    schedule(player, kRespawnDelayMs);
});
Events.on("playerDisconnect", (player) => {
    cancel(player);
    stuck.delete(player.id);
    awaitingUp.delete(player.id);
});
// --- their game has them standing again ------------------------------------------------------------
// Players who died and whose game has not reported them standing since.
const awaitingUp = new Set();
// Their game may report standing a moment before the server has them alive: look again this soon.
const kUpRecheckMs = 1500;
const onUp = (player, recheck) => {
    if (isGone(player) || !awaitingUp.has(player.id)) {
        return;
    }
    if (player.isDead) {
        if (recheck) {
            setTimeout(() => onUp(player, false), kUpRecheckMs);
        }
        return;
    }
    awaitingUp.delete(player.id);
    stuck.delete(player.id);
    console.log(`${(0, accounts_1.accountName)(player)}: their game has them standing; equipment goes back on`);
    (0, equipment_1.restoreAfterRespawn)(player);
};
Events.onClient(life_1.LifeEvents.up, (sender) => {
    onUp(sender, true);
});
// --- their game shows them dead while the server has them up --------------------------------------
// A report this long after the last one starts a new incident, from the first step.
const kStuckIncidentGapMs = 30000;
const kMaxStuckSteps = 3;
// Player id -> the step reached in the current incident and when it was taken.
const stuck = new Map();
Events.onClient(life_1.LifeEvents.stuck, (sender, payload) => {
    const player = sender;
    const report = (0, life_1.readLifeStuck)(payload);
    const name = (0, accounts_1.accountName)(player);
    if (player.isDead) {
        // The server knows: the respawn chain handles it. Make sure one is running.
        if (!pending.has(player.id)) {
            console.warn(`${name}: their game reports them down ${report.secondsDown} s with no respawn pending; respawning`);
            schedule(player, 0);
        }
        else {
            console.warn(`${name}: their game reports them down ${report.secondsDown} s; respawn in progress`);
        }
        return;
    }
    const now = Date.now();
    const last = stuck.get(player.id);
    const step = last !== undefined && now - last.at < kStuckIncidentGapMs ? last.step + 1 : 1;
    stuck.set(player.id, { step, at: now });
    if (step > kMaxStuckSteps + 1) {
        // Already told them to rejoin; their game keeps reporting until they do.
        return;
    }
    if (step <= kMaxStuckSteps) {
        console.warn(`${name}: their game shows them dead for ${report.secondsDown} s but the server has them up; recovery step ${step}/${kMaxStuckSteps}`);
    }
    if (step === 1) {
        // A move on the spot puts the body where the actor is.
        player.teleport(player.position, player.heading, (0, places_1.teleportSpace)(player.getSpace()), { loadScreen: false });
    }
    else if (step <= kMaxStuckSteps) {
        // Through death again, in step with the server this time: playerDeath, then the respawn chain.
        player.health = 0;
    }
    else {
        console.error(`${name}: still shown dead after ${kMaxStuckSteps} recovery steps; send client\\logs\\FMP.log`);
        (0, chat_1.reply)(player, "Your game still shows you down. Rejoin the server; staff, please collect client\\logs\\FMP.log.");
    }
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
// --- "/unstuck": the player's own way out ----------------------------------------------------------
// Their game can report them up while their body stays lying (seen after deaths with a weapon in
// hand): nothing here can see that, so the player says so. First a move on the spot; asked again
// soon after, a fresh death the normal respawn brings them back from.
const kUnstuckWindowMs = 30000;
const kUnstuckCooldownMs = 5000;
const unstuckAt = new Map();
Events.on("playerDisconnect", (player) => {
    unstuckAt.delete(player.id);
});
(0, chat_1.registerCommands)(chat_1.AdminLevel.player, {
    unstuck: (player) => {
        const name = (0, accounts_1.accountName)(player);
        if (player.isDead) {
            if (!pending.has(player.id)) {
                schedule(player, 0);
            }
            (0, chat_1.reply)(player, "Возрождение уже идёт, подождите несколько секунд.");
            return;
        }
        const now = Date.now();
        const last = unstuckAt.get(player.id);
        if (last !== undefined && now - last < kUnstuckCooldownMs) {
            return;
        }
        if (last !== undefined && now - last < kUnstuckWindowMs) {
            unstuckAt.delete(player.id);
            console.warn(`${name}: /unstuck again; through death once more`);
            (0, chat_1.reply)(player, "Повторное возрождение…");
            player.health = 0;
            return;
        }
        unstuckAt.set(player.id, now);
        console.warn(`${name}: /unstuck; moving them on the spot`);
        player.teleport(player.position, player.heading, (0, places_1.teleportSpace)(player.getSpace()), { loadScreen: false });
        (0, chat_1.reply)(player, "Персонаж переставлен. Если всё ещё лежите, повторите /unstuck в течение 30 секунд.");
    },
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
