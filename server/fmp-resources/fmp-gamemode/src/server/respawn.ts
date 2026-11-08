// Death and getting back up. Nothing respawns a player on its own, and one `respawn()` is not always
// enough: testers saw players stay down for good. A respawn sent while their game is not ready for it
// is lost, and a timer armed before the gamemode reloads (`ensure fmp-gamemode`) dies with it. So:
//  - after the delay, respawn, then keep checking and asking again until their game reports them up;
//  - every few seconds, sweep for players who are down with nothing pending, and start over for them;
//  - staff have "/revive <player>" for whatever is left.
// And the other way round: the server has them up but their game still shows them dead. respawn()
// does nothing for a player the server thinks alive, so their client reports it (src/client/life.ts)
// and the server escalates: a move on the spot, then a fresh death the normal path brings back from.

import { LifeEvents, type LifeStuck, type LifeUp, readLifeStuck, readLifeUp } from "../shared/life";
import { accountName } from "./accounts";
import { AdminLevel, registerCommands, reply } from "./chat";
import { freeze as freezeEquipment, restoreAfterRespawn } from "./equipment";
import { teleportSpace } from "./places";
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
        // Their equipment goes back on only once their own game reports them standing (LifeEvents.up).
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
    freezeEquipment(player);
    awaitingUp.add(player.id);
    schedule(player, kRespawnDelayMs);
});

Events.on("playerDisconnect", (player: Player): void => {
    cancel(player);
    stuck.delete(player.id);
    awaitingUp.delete(player.id);
});

// --- their game has them standing again ------------------------------------------------------------

// Players who died and whose game has not reported them standing since.
const awaitingUp = new Set<number>();
// Their game may report standing a moment before the server has them alive: look again this soon.
const kUpRecheckMs = 1500;

// After the client's own shake (the fly camera, src/client/life.ts): the body back to its stance,
// and for a death with a weapon out, the case that left players lying on their own screen, a move on
// the spot as well.
const kStanceDelayMs = 300;
const kMoveDelayMs = 900;

const moveOnTheSpot = (player: Player): void => {
    if (!isGone(player) && !player.isDead) {
        player.teleport(player.position, player.heading, teleportSpace(player.getSpace()), { loadScreen: false });
    }
};

// Everything that can shake a body loose without killing it: the client's fly camera, the stance,
// a move on the spot.
const shakeLoose = (player: Player, move: boolean): void => {
    player.emit(LifeEvents.shake);
    setTimeout((): void => {
        if (!isGone(player) && !player.isDead) {
            player.stopIdle();
        }
    }, kStanceDelayMs);
    if (move) {
        setTimeout((): void => moveOnTheSpot(player), kMoveDelayMs);
    }
};

const onUp = (player: Player, report: LifeUp, recheck: boolean): void => {
    if (isGone(player) || !awaitingUp.has(player.id)) {
        return;
    }
    if (player.isDead) {
        if (recheck) {
            setTimeout((): void => onUp(player, report, false), kUpRecheckMs);
        }
        return;
    }
    awaitingUp.delete(player.id);
    stuck.delete(player.id);
    console.log(`${accountName(player)}: their game has them standing (weapon out at death: ${report.weaponDrawn ? "yes" : "no"}, camera ${report.camera}); shaking them loose, equipment goes back on`);
    // The client has already taken and given back the fly camera; the server's part follows.
    setTimeout((): void => {
        if (!isGone(player) && !player.isDead) {
            player.stopIdle();
        }
    }, kStanceDelayMs);
    if (report.weaponDrawn) {
        setTimeout((): void => moveOnTheSpot(player), kMoveDelayMs);
    }
    restoreAfterRespawn(player);
};

Events.onClient(LifeEvents.up, (sender: unknown, payload: unknown): void => {
    onUp(sender as Player, readLifeUp(payload), true);
});

// --- their game shows them dead while the server has them up --------------------------------------

// A report this long after the last one starts a new incident, from the first step.
const kStuckIncidentGapMs = 30000;
const kMaxStuckSteps = 3;

// Player id -> the step reached in the current incident and when it was taken.
const stuck = new Map<number, { step: number; at: number }>();

Events.onClient(LifeEvents.stuck, (sender: unknown, payload: unknown): void => {
    const player = sender as Player;
    const report: LifeStuck = readLifeStuck(payload);
    const name: string = accountName(player);

    if (player.isDead) {
        // The server knows: the respawn chain handles it. Make sure one is running.
        if (!pending.has(player.id)) {
            console.warn(`${name}: their game reports them down ${report.secondsDown} s with no respawn pending; respawning`);
            schedule(player, 0);
        } else {
            console.warn(`${name}: their game reports them down ${report.secondsDown} s; respawn in progress`);
        }
        return;
    }

    const now: number = Date.now();
    const last = stuck.get(player.id);
    const step: number = last !== undefined && now - last.at < kStuckIncidentGapMs ? last.step + 1 : 1;
    stuck.set(player.id, { step, at: now });
    if (step > kMaxStuckSteps + 1) {
        // Already told them to rejoin; their game keeps reporting until they do.
        return;
    }
    if (step <= kMaxStuckSteps) {
        console.warn(`${name}: their game shows them dead for ${report.secondsDown} s but the server has them up; recovery step ${step}/${kMaxStuckSteps}`);
    }

    if (step === 1) {
        // The fly camera, the stance and a move on the spot, which puts the body where the actor is.
        shakeLoose(player, true);
    } else if (step <= kMaxStuckSteps) {
        // Through death again, in step with the server this time: playerDeath, then the respawn chain.
        player.kill();
    } else {
        console.error(`${name}: still shown dead after ${kMaxStuckSteps} recovery steps; send client\\logs\\FMP.log`);
        reply(player, "Your game still shows you down. Rejoin the server; staff, please collect client\\logs\\FMP.log.");
    }
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

// --- "/unstuck": the player's own way out ----------------------------------------------------------

// Their game can report them up while their body stays lying (seen after deaths with a weapon in
// hand): nothing here can see that, so the player says so. First a move on the spot; asked again
// soon after, a fresh death the normal respawn brings them back from.
const kUnstuckWindowMs = 30000;
const kUnstuckCooldownMs = 5000;
const unstuckAt = new Map<number, number>();

Events.on("playerDisconnect", (player: Player): void => {
    unstuckAt.delete(player.id);
});

registerCommands(AdminLevel.player, {
    unstuck: (player: Player): void => {
        const name: string = accountName(player);
        if (player.isDead) {
            if (!pending.has(player.id)) {
                schedule(player, 0);
            }
            reply(player, "Возрождение уже идёт, подождите несколько секунд.");
            return;
        }
        const now: number = Date.now();
        const last: number | undefined = unstuckAt.get(player.id);
        if (last !== undefined && now - last < kUnstuckCooldownMs) {
            return;
        }
        if (last !== undefined && now - last < kUnstuckWindowMs) {
            unstuckAt.delete(player.id);
            console.warn(`${name}: /unstuck again; through death once more`);
            reply(player, "Повторное возрождение…");
            player.kill();
            return;
        }
        unstuckAt.set(player.id, now);
        console.warn(`${name}: /unstuck; shaking them loose (camera, stance, a move on the spot)`);
        shakeLoose(player, true);
        reply(player, "Камера и персонаж сброшены. Если всё ещё лежите, повторите /unstuck в течение 30 секунд.");
    },
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
