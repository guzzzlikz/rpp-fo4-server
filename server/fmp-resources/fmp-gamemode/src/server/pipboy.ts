// Modular Pip-Boy, the server's half: the authority over what each character may use.
//
// The capability mask (src/shared/pipboy.ts) is worked out here and nowhere else:
//   (caps of the devices they carry | pipboy.json's noDeviceMask | staff grant) & ~staff revoke,
// where a cracked Pip-Boy gives nothing: its device ("wrist": true) counts as not carried.
// Grants, revocations and the crack are kept in SQLite (table pipboy, database.ts); what they carry is
// the server's own inventory record, which their game cannot write without the server accepting it.
// The client is sent the result and only applies it (src/client/pipboy.ts).
//
// pipboy.json, beside package.json, configures it; "pipboy reload" in the server console reads it
// again. Off ("enabled": false) every player gets the full mask and nothing is restricted.
//
// What FMP 0.2.5 lets a script do with it, and what not, is in docs/resources/fmp-gamemode.md.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { Cap, describeMask, kCapNames, parseCap, PipboyEvents, type PipboyState } from "../shared/pipboy";
import { accountId, accountName, adminLevel, isLoggedIn, loggedInPlayers } from "./accounts";
import { AdminLevel, registerCommands, reply } from "./chat";
import * as Database from "./database";
import { findPlayer } from "./players";

const kConfigFile: string = join(__dirname, "..", "..", "pipboy.json");
// Script-made inventory changes (giveItem) raise no event: look again this often.
const kSweepMs = 10000;
// inventoryChange comes before the record takes it.
const kAfterChangeMs = 500;

interface Device {
    form: number;
    label: string;
    caps: number;
    // Worn on the wrist: a crack puts it out of use.
    wrist: boolean;
}

interface Config {
    enabled: boolean;
    noDeviceMask: number;
    devices: Device[];
    // A blast hit this strong or stronger cracks the wrist device; 0 never.
    crackOnBlastDamage: number;
    blockedMenus: Record<string, number>;
    strictPipboyMenu: boolean;
}

const kDefaults: Config = {
    enabled: false,
    noDeviceMask: Cap.none,
    devices: [{ form: 0x21b3b, label: "Pip-Boy 3000 Mk IV", caps: Cap.full, wrist: true }],
    crackOnBlastDamage: 0,
    blockedMenus: { VATSMenu: Cap.vats },
    strictPipboyMenu: false,
};

const describe = (thrown: unknown): string => (thrown instanceof Error ? thrown.message : String(thrown));

// "full", ["map", "gps"], "0x0018" or a number.
const readMask = (value: unknown, where: string, problems: string[]): number | null => {
    const parts: unknown[] = Array.isArray(value) ? value : [value];
    let mask = 0;
    for (const part of parts) {
        const cap: number | null = typeof part === "number" && Number.isInteger(part) ? part & Cap.full : typeof part === "string" ? parseCap(part) : null;
        if (cap === null) {
            problems.push(`${where}: ${JSON.stringify(part)} is no capability (${kCapNames.join(", ")}, full, none)`);
            return null;
        }
        mask |= cap;
    }
    return mask;
};

const readForm = (value: unknown): number | null => {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
        return value;
    }
    if (typeof value === "string" && /^(0x)?[0-9a-f]{1,8}$/i.test(value.trim())) {
        return parseInt(value.trim().replace(/^0x/i, ""), 16);
    }
    return null;
};

const loadConfig = (): Config => {
    let raw: Record<string, unknown>;
    try {
        raw = JSON.parse(readFileSync(kConfigFile, "utf8")) as Record<string, unknown>;
    } catch (thrown: unknown) {
        console.warn(`pipboy: pipboy.json not read (${describe(thrown)}); the module is off`);
        return kDefaults;
    }
    const problems: string[] = [];
    const devices: Device[] = [];
    if (Array.isArray(raw["devices"])) {
        raw["devices"].forEach((entry: unknown, index: number): void => {
            const fields = (typeof entry === "object" && entry !== null ? entry : {}) as Record<string, unknown>;
            const form: number | null = readForm(fields["form"]);
            const caps: number | null = readMask(fields["caps"], `devices[${index}].caps`, problems);
            if (form === null) {
                problems.push(`devices[${index}].form: ${JSON.stringify(fields["form"])} is no form ID`);
                return;
            }
            if (caps !== null) {
                devices.push({ form, caps, label: typeof fields["label"] === "string" ? fields["label"] : `0x${form.toString(16).toUpperCase()}`, wrist: fields["wrist"] === true });
            }
        });
    }
    const blockedMenus: Record<string, number> = {};
    const menus: unknown = raw["blockedMenus"];
    if (typeof menus === "object" && menus !== null) {
        for (const [menu, cap] of Object.entries(menus as Record<string, unknown>)) {
            const mask: number | null = readMask(cap, `blockedMenus.${menu}`, problems);
            if (mask !== null) {
                blockedMenus[menu] = mask;
            }
        }
    }
    const crack: unknown = raw["crackOnBlastDamage"];
    const config: Config = {
        enabled: raw["enabled"] === true,
        noDeviceMask: readMask(raw["noDeviceMask"] ?? "none", "noDeviceMask", problems) ?? Cap.none,
        devices,
        crackOnBlastDamage: typeof crack === "number" && crack > 0 ? crack : 0,
        blockedMenus,
        strictPipboyMenu: raw["strictPipboyMenu"] === true,
    };
    problems.forEach((problem: string): void => console.warn(`pipboy.json: ${problem}`));
    return config;
};

let config: Config = loadConfig();

const logConfig = (): void => {
    console.log(
        `pipboy: ${config.enabled ? "on" : "off"}; ${config.devices.length} device(s): ${config.devices.map((device: Device): string => `${device.label} [${describeMask(device.caps)}]`).join("; ") || "none"}; ` +
            `without one: ${describeMask(config.noDeviceMask)}; crack on blasts of ${config.crackOnBlastDamage > 0 ? config.crackOnBlastDamage : "never"}`,
    );
};
logConfig();

// --- the mask ------------------------------------------------------------------------------------

interface Live {
    accountId: number;
    stored: Database.StoredPipboy;
    // What their client was last sent, to send again only on a change.
    sent: string;
}

// Player id -> their state, from login on.
const live = new Map<number, Live>();

const carries = (player: Player, device: Device): boolean => {
    try {
        return player.getItemCount(device.form) > 0;
    } catch {
        return false;
    }
};

const carried = (player: Player, stored: Database.StoredPipboy): Device[] =>
    config.devices.filter((device: Device): boolean => !(stored.cracked && device.wrist) && carries(player, device));

const maskOf = (player: Player, state: Live): number => {
    if (!config.enabled) {
        return Cap.full;
    }
    const devices: number = carried(player, state.stored).reduce((mask: number, device: Device): number => mask | device.caps, 0);
    return (devices | config.noDeviceMask | state.stored.grant) & ~state.stored.revoke & Cap.full;
};

// The mask as it stands for a logged-in player; full for anyone else, who is restricted by nothing yet.
export const capabilities = (player: Player): number => {
    const state: Live | undefined = live.get(player.id);
    return state === undefined ? Cap.full : maskOf(player, state);
};

const push = (player: Player, why: string): void => {
    const state: Live | undefined = live.get(player.id);
    if (state === undefined || player.nickname === "") {
        return;
    }
    const message: PipboyState = {
        enabled: config.enabled,
        mask: maskOf(player, state),
        cracked: state.stored.cracked,
        blockedMenus: config.blockedMenus,
        strictPipboyMenu: config.strictPipboyMenu,
    };
    const json: string = JSON.stringify(message);
    if (json === state.sent) {
        return;
    }
    const first: boolean = state.sent === "";
    state.sent = json;
    player.emit(PipboyEvents.state, json);
    if (config.enabled || first) {
        console.log(`pipboy: ${accountName(player)} -> ${describeMask(message.mask)}${state.stored.cracked ? " (cracked)" : ""} (${why})`);
    }
};

const store = (player: Player, change: (stored: Database.StoredPipboy) => void, why: string): void => {
    const state: Live | undefined = live.get(player.id);
    if (state === undefined) {
        return;
    }
    change(state.stored);
    Database.savePipboy(state.accountId, state.stored);
    push(player, why);
};

// From accounts.ts once a player who logged in stands in the world.
export const begin = (player: Player): void => {
    const id: number | null = accountId(player);
    if (id === null) {
        return;
    }
    live.set(player.id, { accountId: id, stored: Database.findPipboy(id), sent: "" });
    push(player, "login");
};

Events.on("playerDisconnect", (player: Player): void => {
    live.delete(player.id);
});

Events.on("inventoryChange", (player: Player): void => {
    if (live.has(player.id)) {
        setTimeout((): void => push(player, "inventory"), kAfterChangeMs);
    }
});

const sweeper: Timeout = setInterval((): void => {
    for (const player of loggedInPlayers()) {
        push(player, "inventory");
    }
}, kSweepMs);

Events.on("resourceStop", (resourceName: string): void => {
    if (resourceName === "fmp-gamemode") {
        clearInterval(sweeper);
    }
});

// --- a cracked Pip-Boy ---------------------------------------------------------------------------

// FMP reports neither the limb a hit lands on nor an EMP: a strong enough blast is what cracks it.
const onBlast = (victim: Player, damage: number, kind: string): void => {
    const state: Live | undefined = live.get(victim.id);
    if (!config.enabled || config.crackOnBlastDamage <= 0 || kind !== "blast" || damage < config.crackOnBlastDamage || state === undefined || state.stored.cracked) {
        return;
    }
    const wrist: Device | undefined = config.devices.find((device: Device): boolean => device.wrist && carries(victim, device));
    if (wrist === undefined) {
        return;
    }
    console.log(`pipboy: ${accountName(victim)}'s ${wrist.label} cracked by a blast of ${Math.round(damage)}`);
    reply(victim, `${wrist.label} треснул от взрыва. Нужен ремонт.`);
    store(victim, (stored: Database.StoredPipboy): void => {
        stored.cracked = true;
    }, "a blast");
};

Events.on("playerHit", (_attacker: Player, victim: Player, damage: number, kind: string): void => {
    onBlast(victim, damage, kind);
});

Events.on("npcAttack", (_npc: Npc, victim: Player, damage: number, kind: string): void => {
    onBlast(victim, damage, kind);
});

// --- commands ------------------------------------------------------------------------------------

const report = (to: Player, player: Player): void => {
    const state: Live | undefined = live.get(player.id);
    if (state === undefined) {
        reply(to, `${accountName(player)} has not logged in`);
        return;
    }
    const devices: string = carried(player, { ...state.stored, cracked: false })
        .map((device: Device): string => `${device.label}${state.stored.cracked && device.wrist ? " (треснул)" : ""}`)
        .join(", ");
    reply(to, `Pip-Boy ${accountName(player)}: ${describeMask(maskOf(player, state))}${config.enabled ? "" : " (модуль выключен)"}`);
    reply(to, `Устройства: ${devices || "нет"}; выдано: ${describeMask(state.stored.grant)}; отнято: ${describeMask(state.stored.revoke)}`);
};

const readCaps = (to: Player, args: string[]): number | null => {
    if (args.length === 0) {
        reply(to, `Укажите возможности: ${kCapNames.join(", ")}, full`);
        return null;
    }
    let mask = 0;
    for (const arg of args) {
        const cap: number | null = parseCap(arg);
        if (cap === null) {
            reply(to, `Нет такой возможности: ${arg}. Есть: ${kCapNames.join(", ")}, full`);
            return null;
        }
        mask |= cap;
    }
    return mask;
};

const kUsage = "/pipboy [игрок] | grant|revoke <игрок> <возможности…> | reset|crack|repair <игрок>";

registerCommands(AdminLevel.player, {
    // "/pipboy": what the sender's own Pip-Boy allows. Staff (moderator+) also see and set anyone's.
    pipboy: (player: Player, args: string[]): void => {
        const [action, target, ...rest] = args;
        if (action === undefined) {
            report(player, player);
            return;
        }
        if (!isStaff(player)) {
            report(player, player);
            return;
        }
        const handler = kStaffActions[action.toLowerCase()];
        if (handler === undefined) {
            // "/pipboy <player>": theirs.
            const someone: Player | null = findPlayer(player, action);
            if (someone !== null) {
                report(player, someone);
            }
            return;
        }
        const someone: Player | null = findPlayer(player, target);
        if (someone === null) {
            reply(player, kUsage);
            return;
        }
        if (!live.has(someone.id)) {
            reply(player, `${accountName(someone)} has not logged in`);
            return;
        }
        handler(player, someone, rest);
    },
});

const isStaff = (player: Player): boolean => adminLevel(player) >= AdminLevel.moderator;

const kStaffActions: Record<string, (by: Player, player: Player, args: string[]) => void> = {
    grant: (by: Player, player: Player, args: string[]): void => {
        const mask: number | null = readCaps(by, args);
        if (mask !== null) {
            store(player, (stored: Database.StoredPipboy): void => {
                stored.grant |= mask;
                stored.revoke &= ~mask;
            }, `${accountName(by)} granted ${describeMask(mask)}`);
            report(by, player);
        }
    },
    revoke: (by: Player, player: Player, args: string[]): void => {
        const mask: number | null = readCaps(by, args);
        if (mask !== null) {
            store(player, (stored: Database.StoredPipboy): void => {
                stored.revoke |= mask;
                stored.grant &= ~mask;
            }, `${accountName(by)} revoked ${describeMask(mask)}`);
            report(by, player);
        }
    },
    reset: (by: Player, player: Player): void => {
        store(player, (stored: Database.StoredPipboy): void => {
            stored.grant = 0;
            stored.revoke = 0;
        }, `${accountName(by)} reset grants`);
        report(by, player);
    },
    crack: (by: Player, player: Player): void => {
        store(player, (stored: Database.StoredPipboy): void => {
            stored.cracked = true;
        }, `${accountName(by)} cracked it`);
        reply(player, "Ваш Pip-Boy треснул. Нужен ремонт.");
        report(by, player);
    },
    repair: (by: Player, player: Player): void => {
        store(player, (stored: Database.StoredPipboy): void => {
            stored.cracked = false;
        }, `${accountName(by)} repaired it`);
        reply(player, "Ваш Pip-Boy снова работает.");
        report(by, player);
    },
};

// --- console -------------------------------------------------------------------------------------

Events.on("consoleCommand", (command: string, args: string[]): void => {
    if (command !== "pipboy") {
        return;
    }
    if (args[0] === "reload") {
        config = loadConfig();
        logConfig();
        for (const player of loggedInPlayers()) {
            push(player, "config reloaded");
        }
        return;
    }
    logConfig();
    for (const player of loggedInPlayers()) {
        if (isLoggedIn(player)) {
            console.log(`  ${accountName(player)}: ${describeMask(capabilities(player))}${live.get(player.id)?.stored.cracked === true ? " (cracked)" : ""}`);
        }
    }
    console.log("pipboy reload: read pipboy.json again");
});
