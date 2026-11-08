// Death and getting back up. Nothing respawns a player on its own, and one `respawn()` is not always
// enough: testers saw players stay down for good. A respawn sent while their game is not ready for it
// is lost, and a timer armed before the gamemode reloads (`ensure fmp-gamemode`) dies with it. So:
//  - after the delay, respawn, then keep checking and asking again until their game reports them up;
//  - every few seconds, sweep for players who are down with nothing pending, and start over for them;
//  - staff have "/revive <player>" for whatever is left.

import { accountName } from "./accounts";
import { AdminLevel, registerCommands, reply } from "./chat";
import { restoreAfterRespawn } from "./equipment";
import { findPlayer } from "./players";

const kRespawnDelayMs = 5000;
// How long to wait for their game to report them up before asking again.
const kRetryMs = 2000;
const kMaxAttempts = 10;
const kSweepMs = 10000;

// Player id -> the timer of their next respawn attempt.
const pending = new Map<number, Timeout>();

const isGone = (player: Player): boolean => player.nickname === "";

const cancel = (player: Player): void => {
    const timer: Timeout | undefined = pending.get(player.id);
    if (timer !== undefined) {
        clearTimeout(timer);
        pending.delete(player.id);
    }
};

// Attempt `attempt` of bringing them back: respawn if they are still down, then check again later.
const tryRespawn = (player: Player, attempt: number): void => {
    pending.delete(player.id);
    if (isGone(player)) {
        return;
    }
    if (!player.isDead) {
        if (attempt > 2) {
            console.log(`${accountName(player)} is up after ${attempt - 1} respawn attempts`);
        }
        // Up again after a respawn we sent: what they held and wore goes back on.
        if (attempt > 1) {
            restoreAfterRespawn(player);
        }
        return;
    }
    if (attempt > kMaxAttempts) {
        console.error(`${accountName(player)} is still down after ${kMaxAttempts} respawn attempts; /revive them or have them rejoin`);
        reply(player, "The server could not bring you back. Ask staff for /revive, or rejoin.");
        return;
    }
    const sent: boolean = player.respawn();
    if (attempt > 1) {
        console.warn(`${accountName(player)} is still down: respawn attempt ${attempt}/${kMaxAttempts}${sent ? "" : " (not sent)"}`);
    }
    pending.set(player.id, setTimeout((): void => tryRespawn(player, attempt + 1), kRetryMs));
};

const schedule = (player: Player, delayMs: number): void => {
    cancel(player);
    pending.set(player.id, setTimeout((): void => tryRespawn(player, 1), delayMs));
};

Events.on("playerDeath", (player: Player, killer: Player | null): void => {
    console.log(killer !== null ? `${accountName(killer)} killed ${accountName(player)}` : `${accountName(player)} died`);
    schedule(player, kRespawnDelayMs);
});

Events.on("playerDisconnect", (player: Player): void => {
    cancel(player);
});

// Down with nothing pending: a death this gamemode never heard of (it was reloading, or the event was
// lost) or a chain that gave up. Also runs once right after the gamemode starts.
const sweep = (): void => {
    for (const player of Player.all()) {
        if (player.isDead && !pending.has(player.id)) {
            console.warn(`${accountName(player)} found down with no respawn pending; respawning`);
            schedule(player, 0);
        }
    }
};

const sweeper: Timeout = setInterval(sweep, kSweepMs);
setTimeout(sweep, 0);

Events.on("resourceStop", (resourceName: string): void => {
    if (resourceName !== "fmp-gamemode") {
        return;
    }
    clearInterval(sweeper);
    pending.forEach((timer: Timeout): void => clearTimeout(timer));
    pending.clear();
});

registerCommands(AdminLevel.moderator, {
    // "/revive <player>": brings someone who is down back where they fell.
    revive: (player: Player, args: string[]): void => {
        const target: Player | null = findPlayer(player, args[0]);
        if (target === null) {
            return;
        }
        if (!target.isDead) {
            reply(player, `${accountName(target)} is not down`);
            return;
        }
        console.log(`${accountName(player)} revives ${accountName(target)}`);
        schedule(target, 0);
        reply(player, `Reviving ${accountName(target)}`);
    },
});
