"use strict";
// What a player has in their hands and wears, kept across deaths and rejoins. The character document
// only lists what they carry, and a death leaves the game's player with their weapon put away, so
// without this every respawn and every login hands back a character with everything in the bag.
//
// While a logged-in player is alive their equipment is sampled every few seconds. After a respawn the
// last sample is put back on; on login the one stored with the character is. accounts.ts stores the
// last sample with the character on every save.
Object.defineProperty(exports, "__esModule", { value: true });
exports.begin = exports.untrack = exports.lastEquipment = exports.restoreAfterRespawn = exports.track = void 0;
const kSampleMs = 5000;
// Give the player's game a moment after the respawn or the move before asking it to equip.
const kRestoreDelayMs = 1000;
// Then check it took, and ask once more if not.
const kVerifyDelayMs = 3000;
// Player id -> what they last had equipped while alive. Only logged-in players are tracked: the lobby
// body is not the character.
const lastKnown = new Map();
// Player id -> until when sampling waits: a restore is landing, and a sample now would record the
// empty hands it is about to fill.
const holdUntil = new Map();
const isGone = (player) => player.nickname === "";
const snapshot = (player) => ({
    weapon: player.getWeapon()?.form ?? null,
    outfit: player.getOutfit().map((piece) => piece.form),
});
const isEmpty = (equipment) => equipment.weapon === null && equipment.outfit.length === 0;
const hex = (form) => form.toString(16).toUpperCase().padStart(8, "0");
// Asks their game to equip whatever of `equipment` is not on them. The items must be in their
// inventory; what is not (sold, dropped, lost) is skipped. The names of what could not be asked for.
const apply = (player, equipment) => {
    const missing = [];
    const worn = new Set(player.getOutfit().map((piece) => piece.form));
    for (const form of equipment.outfit) {
        if (!worn.has(form) && !player.equipItem(form)) {
            missing.push(`armor ${hex(form)}`);
        }
    }
    if (equipment.weapon !== null && player.getWeapon()?.form !== equipment.weapon && !player.equipItem(equipment.weapon)) {
        missing.push(`weapon ${hex(equipment.weapon)}`);
    }
    return missing;
};
// Puts `equipment` back on the player, then checks and tries once more. `why` is for the log.
const restore = (player, equipment, why) => {
    if (equipment === null || isEmpty(equipment)) {
        return;
    }
    lastKnown.set(player.id, equipment);
    holdUntil.set(player.id, Date.now() + kRestoreDelayMs + kVerifyDelayMs + kSampleMs);
    setTimeout(() => {
        if (isGone(player) || player.isDead) {
            return;
        }
        const missing = apply(player, equipment);
        if (missing.length > 0) {
            console.warn(`${player.nickname}: ${why}: not carried any more, left off: ${missing.join(", ")}`);
        }
        setTimeout(() => {
            if (isGone(player) || player.isDead) {
                return;
            }
            const weapon = player.getWeapon()?.form ?? null;
            if (equipment.weapon !== null && weapon !== equipment.weapon) {
                console.warn(`${player.nickname}: ${why}: weapon ${hex(equipment.weapon)} not in hands yet; asking again`);
                apply(player, equipment);
            }
        }, kVerifyDelayMs);
    }, kRestoreDelayMs);
};
// From accounts.ts, once a logged-in player is placed in the world.
const track = (player, stored) => {
    restore(player, stored, "login");
};
exports.track = track;
// From respawn.ts, once a player who was down is up again.
const restoreAfterRespawn = (player) => {
    const equipment = lastKnown.get(player.id);
    if (equipment !== undefined) {
        restore(player, equipment, "respawn");
    }
};
exports.restoreAfterRespawn = restoreAfterRespawn;
// What to store with the character: the last sample taken while they were alive.
const lastEquipment = (player) => lastKnown.get(player.id) ?? null;
exports.lastEquipment = lastEquipment;
const untrack = (player) => {
    lastKnown.delete(player.id);
    holdUntil.delete(player.id);
};
exports.untrack = untrack;
const sample = () => {
    const now = Date.now();
    for (const player of Player.all()) {
        if (!lastKnown.has(player.id) || player.isDead || (holdUntil.get(player.id) ?? 0) > now) {
            continue;
        }
        lastKnown.set(player.id, snapshot(player));
    }
};
// Starts tracking a logged-in player with nothing stored yet (a new character): their first sample
// becomes what is kept.
const begin = (player) => {
    if (!lastKnown.has(player.id)) {
        lastKnown.set(player.id, { weapon: null, outfit: [] });
    }
};
exports.begin = begin;
const sampler = setInterval(sample, kSampleMs);
Events.on("resourceStop", (resourceName) => {
    if (resourceName === "fmp-gamemode") {
        clearInterval(sampler);
    }
});
