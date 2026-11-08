"use strict";
// Getting a body up through the game's own fall and get-up.
//
// A player who dies with a weapon out stays lying on their own screen after the respawn, though they
// stand for everyone else. Their FMP.log shows why: while they are down FMP refuses the game's
// 'WeaponRagdoll' graph event, and at the respawn the 'GetUpBegin' it sends is refused in turn
// ("GetUpBegin accepted false"), so the body stays a ragdoll. Nothing in FMP's API sends graph events,
// but paralysis does: Paralysis set on an actor knocks it down through the game's own path, and set
// back the game gets it up again, both now that FMP no longer has them down.
//
// Paralysis is one of the actor values the game defines in its code. FMP knows actor values by
// editor ID only from the game data it read ("No game data: actor values are known by form ID only"),
// and refused "Paralysis" on the testers' server, so its form ID backs the name up: 0x2F2, as players
// use it in the console ("modav 2f2"). Unconfirmed: the console's "help paralysis 4" shows the real one.
//
// It is set as the base value, the only one that goes above 0, and FMP saves that with the
// character: a player who leaves mid-fall would come back paralysed, so arrival clears it
// (clearKnockDown, from accounts.ts).
Object.defineProperty(exports, "__esModule", { value: true });
exports.clearKnockDown = exports.knockDownAndUp = void 0;
const kParalysisCandidates = ["Paralysis", 0x2f2];
// What the knock-down sets. The character record holds a base only once a script set one, so this
// value there means it was set here.
const kKnocked = 1;
// Long enough for the fall to take hold, short enough that nobody waits.
const kHoldMs = 1500;
// Player id -> the timer that lets them up.
const held = new Map();
const describe = (thrown) => (thrown instanceof Error ? thrown.message : String(thrown));
const label = (value) => (typeof value === "number" ? `form 0x${value.toString(16).toUpperCase()}` : `"${value}"`);
// The first candidate FMP takes, found once: undefined until then, null when it takes none.
let paralysis;
const findParalysis = (player) => {
    if (paralysis !== undefined) {
        return paralysis;
    }
    const refusals = [];
    for (const candidate of kParalysisCandidates) {
        try {
            player.getBaseValue(candidate);
            paralysis = candidate;
            console.log(`getup: Paralysis goes to FMP as ${label(candidate)}${refusals.length > 0 ? ` (refused: ${refusals.join("; ")})` : ""}`);
            return candidate;
        }
        catch (thrown) {
            refusals.push(`${label(candidate)}: ${describe(thrown)}`);
        }
    }
    paralysis = null;
    console.error(`getup: FMP takes no Paralysis actor value (${refusals.join("; ")}); players who die with a weapon out stay lying on their own screen`);
    return null;
};
const readBase = (player, value) => {
    try {
        return player.getBaseValue(value);
    }
    catch {
        return null;
    }
};
const setBase = (player, value, base) => {
    try {
        return player.setBaseValue(value, base);
    }
    catch (thrown) {
        console.warn(`${player.nickname}: Paralysis (${label(value)}) ${base} refused (${describe(thrown)})`);
        return false;
    }
};
// Knocks them down and lets them up kHoldMs later, then calls `then`. `then` also runs, at once, when
// the knock-down could not be sent; not when one is already under way.
const knockDownAndUp = (player, name, then) => {
    if (held.has(player.id)) {
        return;
    }
    const value = player.nickname === "" || player.isDead ? null : findParalysis(player);
    // What to go back to: the record's own base when it holds one, else none set, 0.
    const before = value !== null ? (readBase(player, value) ?? 0) : 0;
    if (value === null || !setBase(player, value, kKnocked)) {
        console.warn(`${name}: could not knock them down to get up again`);
        then?.();
        return;
    }
    console.log(`${name}: knocked down for ${kHoldMs / 1000} s (Paralysis ${label(value)} ${before} -> ${kKnocked}) so their game gets them up itself`);
    held.set(player.id, setTimeout(() => {
        held.delete(player.id);
        if (player.nickname === "") {
            // Gone: their next arrival clears it.
            return;
        }
        const back = before === kKnocked ? 0 : before;
        const released = setBase(player, value, back);
        console.log(`${name}: let up (Paralysis ${back})${released ? "" : " (not sent: they keep it until they rejoin)"}`);
        then?.();
    }, kHoldMs));
};
exports.knockDownAndUp = knockDownAndUp;
// A Paralysis base left over from a knock-down they left in the middle of.
const clearKnockDown = (player) => {
    const value = paralysis;
    if (value === undefined || value === null) {
        // No knock-down has gone out since the gamemode started; one from before leaves the same base.
        for (const candidate of kParalysisCandidates) {
            if (readBase(player, candidate) === kKnocked && setBase(player, candidate, 0)) {
                console.warn(`${player.nickname}: arrived paralysed (Paralysis ${label(candidate)} ${kKnocked}), left from a knock-down; cleared`);
            }
        }
        return;
    }
    if (readBase(player, value) === kKnocked && setBase(player, value, 0)) {
        console.warn(`${player.nickname}: arrived paralysed (Paralysis ${label(value)} ${kKnocked}), left from a knock-down; cleared`);
    }
};
exports.clearKnockDown = clearKnockDown;
Events.on("playerDisconnect", (player) => {
    const timer = held.get(player.id);
    if (timer !== undefined) {
        clearTimeout(timer);
        held.delete(player.id);
    }
});
// `ensure fmp-gamemode` takes the timers with it: let everyone up now.
Events.on("resourceStop", (resourceName) => {
    if (resourceName !== "fmp-gamemode") {
        return;
    }
    held.forEach((timer, id) => {
        clearTimeout(timer);
        const player = Player.all().find((candidate) => candidate.id === id);
        if (player !== undefined && typeof paralysis !== "undefined" && paralysis !== null) {
            setBase(player, paralysis, 0);
        }
    });
    held.clear();
});
