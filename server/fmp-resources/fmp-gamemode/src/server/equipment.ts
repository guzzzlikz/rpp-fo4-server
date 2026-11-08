// What a player has in their hands and wears, kept across deaths and rejoins. The character document
// only lists what they carry, and a death leaves the game's player with their weapon put away, so
// without this every respawn and every login hands back a character with everything in the bag.
//
// While a logged-in player is alive their equipment is sampled every few seconds. After a respawn the
// last sample is put back on; on login the one stored with the character is. accounts.ts stores the
// last sample with the character on every save.
//
// Power armor is left alone entirely: while a player is in a suit, what getOutfit lists are the suit's
// pieces, and equipping those as clothes warps the body into a broken suit. So nothing is sampled
// while they are in one, and nothing is put on them.

import type { Equipment } from "./database";

export type { Equipment };

const kSampleMs = 5000;
// Give the player's game a moment after the respawn or the move before asking it to equip.
const kRestoreDelayMs = 1000;
// Then check it took, and ask once more if not.
const kVerifyDelayMs = 3000;

// Player id -> what they last had equipped while alive. Only logged-in players are tracked: the lobby
// body is not the character.
const lastKnown = new Map<number, Equipment>();
// Player id -> until when sampling waits: a restore is landing, and a sample now would record the
// empty hands it is about to fill.
const holdUntil = new Map<number, number>();

const isGone = (player: Player): boolean => player.nickname === "";

const snapshot = (player: Player): Equipment => ({
    weapon: player.getWeapon()?.form ?? null,
    outfit: player.getOutfit().map((piece: OutfitPiece): number => piece.form),
});

const isEmpty = (equipment: Equipment): boolean => equipment.weapon === null && equipment.outfit.length === 0;

const hex = (form: number): string => form.toString(16).toUpperCase().padStart(8, "0");

// Asks their game to equip whatever of `equipment` is not on them. The items must be in their
// inventory; what is not (sold, dropped, lost) is skipped. The names of what could not be asked for.
const apply = (player: Player, equipment: Equipment): string[] => {
    const missing: string[] = [];
    const worn: Set<number> = new Set(player.getOutfit().map((piece: OutfitPiece): number => piece.form));
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
const restore = (player: Player, equipment: Equipment | null, why: string): void => {
    if (equipment === null || isEmpty(equipment)) {
        return;
    }
    lastKnown.set(player.id, equipment);
    holdUntil.set(player.id, Date.now() + kRestoreDelayMs + kVerifyDelayMs + kSampleMs);
    setTimeout((): void => {
        if (isGone(player) || player.isDead || player.isInPowerArmor) {
            return;
        }
        const missing: string[] = apply(player, equipment);
        if (missing.length > 0) {
            console.warn(`${player.nickname}: ${why}: not carried any more, left off: ${missing.join(", ")}`);
        }
        setTimeout((): void => {
            if (isGone(player) || player.isDead || player.isInPowerArmor) {
                return;
            }
            const weapon: number | null = player.getWeapon()?.form ?? null;
            if (equipment.weapon !== null && weapon !== equipment.weapon) {
                console.warn(`${player.nickname}: ${why}: weapon ${hex(equipment.weapon)} not in hands yet; asking again`);
                apply(player, equipment);
            }
        }, kVerifyDelayMs);
    }, kRestoreDelayMs);
};

// From accounts.ts, once a logged-in player is placed in the world.
export const track = (player: Player, stored: Equipment | null): void => {
    restore(player, stored, "login");
};

// From respawn.ts as a player goes down: what they had stays as it was, unsampled, until it is put
// back on. Between the server having them up and their game reporting them standing, a sample would
// record the empty hands the death left. Bounded, for a client that never reports.
const kFreezeMaxMs = 60000;
export const freeze = (player: Player): void => {
    if (lastKnown.has(player.id)) {
        holdUntil.set(player.id, Date.now() + kFreezeMaxMs);
    }
};

// From respawn.ts, once the player's own game reports them standing again after a death. Not sooner:
// an equip while their game still plays the get-up left them lying there for good.
export const restoreAfterRespawn = (player: Player): void => {
    const equipment: Equipment | undefined = lastKnown.get(player.id);
    if (equipment !== undefined) {
        restore(player, equipment, "respawn");
    } else {
        holdUntil.delete(player.id);
    }
};

// What to store with the character: the last sample taken while they were alive.
export const lastEquipment = (player: Player): Equipment | null => lastKnown.get(player.id) ?? null;

export const untrack = (player: Player): void => {
    lastKnown.delete(player.id);
    holdUntil.delete(player.id);
};

const sample = (): void => {
    const now: number = Date.now();
    for (const player of Player.all()) {
        if (!lastKnown.has(player.id) || player.isDead || player.isInPowerArmor || (holdUntil.get(player.id) ?? 0) > now) {
            continue;
        }
        lastKnown.set(player.id, snapshot(player));
    }
};

// Starts tracking a logged-in player with nothing stored yet (a new character): their first sample
// becomes what is kept.
export const begin = (player: Player): void => {
    if (!lastKnown.has(player.id)) {
        lastKnown.set(player.id, { weapon: null, outfit: [] });
    }
};

const sampler: Timeout = setInterval(sample, kSampleMs);

Events.on("resourceStop", (resourceName: string): void => {
    if (resourceName === "fmp-gamemode") {
        clearInterval(sampler);
    }
});
