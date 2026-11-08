// Getting a body up through the game's own fall and get-up.
//
// A player who dies with a weapon out stays lying on their own screen after the respawn, though they
// stand for everyone else. Their FMP.log shows why: while they are down FMP refuses the game's
// 'WeaponRagdoll' graph event, and at the respawn the 'GetUpBegin' it sends is refused in turn
// ("GetUpBegin accepted false"), so the body stays a ragdoll. Nothing in FMP's API sends graph events,
// but paralysis does: Paralysis set on an actor knocks it down through the game's own path, and set
// back to 0 the game gets it up again, both now that FMP no longer has them down.
//
// Paralysis is set as the base value, the only one that goes above 0, and FMP saves that with the
// character: a player who leaves mid-fall would come back paralysed, so arrival clears it
// (clearKnockDown, from accounts.ts).

const kParalysis = "Paralysis";
// Long enough for the fall to take hold, short enough that nobody waits.
const kHoldMs = 1500;

// Player id -> the timer that lets them up.
const held = new Map<number, Timeout>();

const describe = (thrown: unknown): string => (thrown instanceof Error ? thrown.message : String(thrown));

const setParalysis = (player: Player, value: number): boolean => {
    try {
        return player.setBaseValue(kParalysis, value);
    } catch (thrown: unknown) {
        console.warn(`${player.nickname}: ${kParalysis} ${value} refused (${describe(thrown)})`);
        return false;
    }
};

// Knocks them down and lets them up kHoldMs later, then calls `then`. `then` also runs, at once, when
// the knock-down could not be sent; not when one is already under way.
export const knockDownAndUp = (player: Player, name: string, then?: () => void): void => {
    if (held.has(player.id)) {
        return;
    }
    if (player.nickname === "" || player.isDead || !setParalysis(player, 1)) {
        console.warn(`${name}: could not knock them down to get up again`);
        then?.();
        return;
    }
    console.log(`${name}: knocked down for ${kHoldMs / 1000} s so their game gets them up itself`);
    held.set(
        player.id,
        setTimeout((): void => {
            held.delete(player.id);
            if (player.nickname === "") {
                // Gone: their next arrival clears it.
                return;
            }
            const released: boolean = setParalysis(player, 0);
            console.log(`${name}: let up${released ? "" : " (not sent: they keep Paralysis until they rejoin)"}`);
            then?.();
        }, kHoldMs),
    );
};

// A Paralysis base left over from a knock-down they left in the middle of.
export const clearKnockDown = (player: Player): void => {
    let base: number | null = null;
    try {
        base = player.getBaseValue(kParalysis);
    } catch {
        return;
    }
    if (base !== null && base > 0 && setParalysis(player, 0)) {
        console.warn(`${player.nickname}: arrived paralysed (${kParalysis} ${base}), left from a knock-down; cleared`);
    }
};

Events.on("playerDisconnect", (player: Player): void => {
    const timer: Timeout | undefined = held.get(player.id);
    if (timer !== undefined) {
        clearTimeout(timer);
        held.delete(player.id);
    }
});

// `ensure fmp-gamemode` takes the timers with it: let everyone up now.
Events.on("resourceStop", (resourceName: string): void => {
    if (resourceName !== "fmp-gamemode") {
        return;
    }
    held.forEach((timer: Timeout, id: number): void => {
        clearTimeout(timer);
        const player: Player | undefined = Player.all().find((candidate: Player): boolean => candidate.id === id);
        if (player !== undefined) {
            setParalysis(player, 0);
        }
    });
    held.clear();
});
