"use strict";
// Server half of the healthcheck. On start it runs a self-test of the scripting runtime and logs
// PASS/FAIL per check, so a glance at the server log tells whether the build came up correctly.
// Afterwards it stays as a liveness probe: `hc` in the server console prints a status report, and
// each player's game pings it once on join (and on F9) to prove the client <-> server path.
Object.defineProperty(exports, "__esModule", { value: true });
const protocol_1 = require("../shared/protocol");
const kTag = "[healthcheck]";
const kHeartbeatMs = 5 * 60 * 1000;
const kTimerProbeMs = 250;
const kTimerProbeDeadlineMs = 5000;
const startedAt = Date.now();
let pingsAnswered = 0;
const uptimeSec = () => Math.floor((Date.now() - startedAt) / 1000);
const formatUptime = (total) => {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${h}h ${m}m ${s}s`;
};
const hex = (form) => form.toString(16).toUpperCase().padStart(8, "0");
const check = (name, probe) => {
    try {
        const outcome = probe();
        return outcome === true ? { name, ok: true, detail: "" } : { name, ok: false, detail: outcome };
    }
    catch (error) {
        return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
    }
};
// Synchronous checks: every global the API promises is there and answers sensibly.
const syncChecks = () => [
    check("runtime is the server", () => ExecutionEnvironment.isServer === true || `isServer=${ExecutionEnvironment.isServer}`),
    check("game is Fallout 4", () => Game.id === "fo4" || `Game.id=${Game.id}`),
    check("framework version known", () => ExecutionEnvironment.frameworkVersion !== "" || "empty frameworkVersion"),
    check("world clock readable", () => (World.hour >= 0 && World.hour < 24) || `World.hour=${World.hour}`),
    check("player list readable", () => Array.isArray(Player.all()) || "Player.all() is not an array"),
    check("npc list readable", () => Array.isArray(Npc.all()) || "Npc.all() is not an array"),
    check("exports register", () => Exports.register("status", statusLines) || "Exports.register returned false"),
];
// Asynchronous checks: timers fire and the resource's own event bus delivers.
const asyncChecks = () => {
    const timer = new Promise((resolve) => {
        const armedAt = Date.now();
        const deadline = setTimeout(() => resolve({ name: "timers fire", ok: false, detail: "setTimeout never fired" }), kTimerProbeDeadlineMs);
        setTimeout(() => {
            clearTimeout(deadline);
            resolve({ name: "timers fire", ok: true, detail: `${Date.now() - armedAt} ms for ${kTimerProbeMs} ms` });
        }, kTimerProbeMs);
    });
    const localEvent = new Promise((resolve) => {
        const token = Math.random();
        Events.onLocal("healthcheck:selftest", (received) => {
            resolve({ name: "local events deliver", ok: received === token, detail: received === token ? "" : "payload mismatch" });
        });
        Events.emitLocal("healthcheck:selftest", token).catch((error) => {
            resolve({ name: "local events deliver", ok: false, detail: String(error) });
        });
    });
    return Promise.all([timer, localEvent]);
};
function statusLines() {
    const players = Player.all();
    const names = players.map((player) => player.nickname).join(", ");
    return [
        `framework ${ExecutionEnvironment.frameworkVersion || "?"}, mod ${ExecutionEnvironment.modVersion || "?"}, game ${Game.name} (${Game.id})`,
        `uptime ${formatUptime(uptimeSec())}, client pings answered ${pingsAnswered}`,
        `world: hour ${World.hour.toFixed(2)}, time scale ${World.timeScale}, weather ${hex(World.weather)}${World.weatherForced ? " (forced)" : ""}`,
        `players online: ${players.length}${players.length > 0 ? ` -> ${names}` : ""}`,
        `npcs synced: ${Npc.all().length}`,
    ];
}
const printStatus = () => {
    for (const line of statusLines()) {
        console.log(`${kTag} ${line}`);
    }
};
const runSelfTest = async () => {
    const results = [...syncChecks(), ...(await asyncChecks())];
    for (const result of results) {
        const line = `${kTag} ${result.ok ? "PASS" : "FAIL"} ${result.name}${result.detail !== "" ? ` (${result.detail})` : ""}`;
        if (result.ok) {
            console.log(line);
        }
        else {
            console.error(line);
        }
    }
    const failed = results.filter((result) => !result.ok).length;
    if (failed === 0) {
        console.log(`${kTag} SELFTEST OK: ${results.length}/${results.length} checks passed`);
    }
    else {
        console.error(`${kTag} SELFTEST FAILED: ${failed} of ${results.length} checks failed`);
    }
    return failed === 0;
};
// --- lifecycle -------------------------------------------------------------------------------
Events.on("resourceStart", (name) => {
    if (name !== protocol_1.kResourceName) {
        return;
    }
    console.log(`${kTag} started; running self-test`);
    void runSelfTest().then(() => printStatus());
});
const heartbeat = setInterval(() => {
    console.log(`${kTag} heartbeat: up ${formatUptime(uptimeSec())}, ${Player.all().length} player(s) online`);
}, kHeartbeatMs);
Events.on("resourceStop", (name) => {
    if (name === protocol_1.kResourceName) {
        clearInterval(heartbeat);
        console.log(`${kTag} stopped after ${formatUptime(uptimeSec())}`);
    }
});
// --- server console: `hc` / `healthcheck` [selftest] ----------------------------------------
Events.on("consoleCommand", (command, args) => {
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
Events.on("playerReady", (player) => {
    console.log(`${kTag} player ready: ${player.nickname}`);
    Chat.sendToPlayer(player, `Server OK, up ${formatUptime(uptimeSec())}. Press F9 to ping the server.`, { author: "Healthcheck" });
});
Events.onClient(protocol_1.HealthEvents.ping, (sender, payload) => {
    const player = sender;
    const ping = (0, protocol_1.readPing)(payload);
    pingsAnswered += 1;
    console.log(`${kTag} ping from ${player.nickname} (${ping.reason})`);
    const pong = {
        sentAt: ping.sentAt,
        serverUptimeSec: uptimeSec(),
        playersOnline: Player.all().length,
        frameworkVersion: ExecutionEnvironment.frameworkVersion,
    };
    player.emit(protocol_1.HealthEvents.pong, JSON.stringify(pong));
});
