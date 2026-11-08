// Server half of the healthcheck. On start it runs a self-test of the scripting runtime and logs
// PASS/FAIL per check, so a glance at the server log tells whether the build came up correctly.
// Afterwards it stays as a liveness probe: `hc` in the server console prints a status report, and
// each player's game pings it once on join (and on F9) to prove the client <-> server path.

import { HealthEvents, kResourceName, type Pong, readPing } from "../shared/protocol";

const kTag = "[healthcheck]";
const kHeartbeatMs = 5 * 60 * 1000;
const kTimerProbeMs = 250;
const kTimerProbeDeadlineMs = 5000;

const startedAt: number = Date.now();
let pingsAnswered = 0;

interface CheckResult {
    name: string;
    ok: boolean;
    detail: string;
}

const uptimeSec = (): number => Math.floor((Date.now() - startedAt) / 1000);

const formatUptime = (total: number): string => {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}h ${m}m ${s}s`;
};

const hex = (form: number): string => form.toString(16).toUpperCase().padStart(8, "0");

const check = (name: string, probe: () => string | true): CheckResult => {
    try {
        const outcome = probe();
        return outcome === true ? { name, ok: true, detail: "" } : { name, ok: false, detail: outcome };
    } catch (error) {
        return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
};

// Synchronous checks: every global the API promises is there and answers sensibly.
const syncChecks = (): CheckResult[] => [
    check("runtime is the server", () => ExecutionEnvironment.isServer === true || `isServer=${ExecutionEnvironment.isServer}`),
    check("game is Fallout 4", () => Game.id === "fo4" || `Game.id=${Game.id}`),
    check("framework version known", () => ExecutionEnvironment.frameworkVersion !== "" || "empty frameworkVersion"),
    check("world clock readable", () => (World.hour >= 0 && World.hour < 24) || `World.hour=${World.hour}`),
    check("player list readable", () => Array.isArray(Player.all()) || "Player.all() is not an array"),
    check("npc list readable", () => Array.isArray(Npc.all()) || "Npc.all() is not an array"),
    check("exports register", () => Exports.register("status", statusLines) || "Exports.register returned false"),
];

// Asynchronous checks: timers fire and the resource's own event bus delivers.
const asyncChecks = (): Promise<CheckResult[]> => {
    const timer = new Promise<CheckResult>((resolve): void => {
        const armedAt = Date.now();
        const deadline = setTimeout((): void => resolve({ name: "timers fire", ok: false, detail: "setTimeout never fired" }), kTimerProbeDeadlineMs);
        setTimeout((): void => {
            clearTimeout(deadline);
            resolve({ name: "timers fire", ok: true, detail: `${Date.now() - armedAt} ms for ${kTimerProbeMs} ms` });
        }, kTimerProbeMs);
    });

    const localEvent = new Promise<CheckResult>((resolve): void => {
        const token = Math.random();
        Events.onLocal("healthcheck:selftest", (received: unknown): void => {
            resolve({ name: "local events deliver", ok: received === token, detail: received === token ? "" : "payload mismatch" });
        });
        Events.emitLocal("healthcheck:selftest", token).catch((error: unknown): void => {
            resolve({ name: "local events deliver", ok: false, detail: String(error) });
        });
    });

    return Promise.all([timer, localEvent]);
};

function statusLines(): string[] {
    const players: Player[] = Player.all();
    const names: string = players.map((player: Player): string => player.nickname).join(", ");
    return [
        `framework ${ExecutionEnvironment.frameworkVersion || "?"}, mod ${ExecutionEnvironment.modVersion || "?"}, game ${Game.name} (${Game.id})`,
        `uptime ${formatUptime(uptimeSec())}, client pings answered ${pingsAnswered}`,
        `world: hour ${World.hour.toFixed(2)}, time scale ${World.timeScale}, weather ${hex(World.weather)}${World.weatherForced ? " (forced)" : ""}`,
        `players online: ${players.length}${players.length > 0 ? ` -> ${names}` : ""}`,
        `npcs synced: ${Npc.all().length}`,
    ];
}

const printStatus = (): void => {
    for (const line of statusLines()) {
        console.log(`${kTag} ${line}`);
    }
};

const runSelfTest = async (): Promise<boolean> => {
    const results: CheckResult[] = [...syncChecks(), ...(await asyncChecks())];
    for (const result of results) {
        const line = `${kTag} ${result.ok ? "PASS" : "FAIL"} ${result.name}${result.detail !== "" ? ` (${result.detail})` : ""}`;
        if (result.ok) {
            console.log(line);
        } else {
            console.error(line);
        }
    }
    const failed: number = results.filter((result: CheckResult): boolean => !result.ok).length;
    if (failed === 0) {
        console.log(`${kTag} SELFTEST OK: ${results.length}/${results.length} checks passed`);
    } else {
        console.error(`${kTag} SELFTEST FAILED: ${failed} of ${results.length} checks failed`);
    }
    return failed === 0;
};

// --- lifecycle -------------------------------------------------------------------------------

Events.on("resourceStart", (name: string): void => {
    if (name !== kResourceName) {
        return;
    }
    console.log(`${kTag} started; running self-test`);
    void runSelfTest().then((): void => printStatus());
});

const heartbeat: Timeout = setInterval((): void => {
    console.log(`${kTag} heartbeat: up ${formatUptime(uptimeSec())}, ${Player.all().length} player(s) online`);
}, kHeartbeatMs);

Events.on("resourceStop", (name: string): void => {
    if (name === kResourceName) {
        clearInterval(heartbeat);
        console.log(`${kTag} stopped after ${formatUptime(uptimeSec())}`);
    }
});

// --- server console: `hc` / `healthcheck` [selftest] ----------------------------------------

Events.on("consoleCommand", (command: string, args: string[]): void => {
    if (command !== "hc" && command !== "healthcheck") {
        return;
    }
    if (args[0] === "selftest") {
        void runSelfTest();
        return;
    }
    printStatus();
});

// --- players -------------------------------------------------------------------------------

Events.on("playerReady", (player: Player): void => {
    console.log(`${kTag} player ready: ${player.nickname}`);
    Chat.sendToPlayer(player, `Server OK, up ${formatUptime(uptimeSec())}. Press F9 to ping the server.`, { author: "Healthcheck" });
});

Events.onClient(HealthEvents.ping, (sender: unknown, payload: unknown): void => {
    const player = sender as Player;
    const ping = readPing(payload);
    pingsAnswered += 1;
    console.log(`${kTag} ping from ${player.nickname} (${ping.reason})`);
    const pong: Pong = {
        sentAt: ping.sentAt,
        serverUptimeSec: uptimeSec(),
        playersOnline: Player.all().length,
        frameworkVersion: ExecutionEnvironment.frameworkVersion,
    };
    player.emit(HealthEvents.pong, JSON.stringify(pong));
});
