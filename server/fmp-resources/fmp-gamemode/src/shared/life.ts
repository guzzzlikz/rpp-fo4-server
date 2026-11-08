// Death as each side sees it. The server decides when a player comes back, but their game can stay
// down after the server already has them up (testers saw players lying there for good): the client
// reports that, and the server works them out of it (src/server/respawn.ts).
//
//   client -> server  stuck   LifeStuck: the game has shown this player dead for too long

export const LifeEvents = {
    stuck: "rp:life:stuck",
} as const;

export interface LifeStuck {
    // How long the player's game has shown them down.
    secondsDown: number;
}

export const readLifeStuck = (payload: unknown): LifeStuck => {
    const fields: Record<string, unknown> = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    const seconds: unknown = fields["secondsDown"];
    return { secondsDown: typeof seconds === "number" && Number.isFinite(seconds) && seconds >= 0 ? Math.round(seconds) : 0 };
};
