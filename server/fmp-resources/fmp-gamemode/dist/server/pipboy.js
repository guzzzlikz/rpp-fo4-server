"use strict";
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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.begin = exports.capabilities = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const pipboy_1 = require("../shared/pipboy");
const accounts_1 = require("./accounts");
const chat_1 = require("./chat");
const Database = __importStar(require("./database"));
const players_1 = require("./players");
const kConfigFile = (0, node_path_1.join)(__dirname, "..", "..", "pipboy.json");
// Script-made inventory changes (giveItem) raise no event: look again this often.
const kSweepMs = 10000;
// inventoryChange comes before the record takes it.
const kAfterChangeMs = 500;
const kDefaults = {
    enabled: false,
    noDeviceMask: pipboy_1.Cap.none,
    devices: [{ form: 0x21b3b, label: "Pip-Boy 3000 Mk IV", caps: pipboy_1.Cap.full, wrist: true }],
    crackOnBlastDamage: 0,
    blockedMenus: { VATSMenu: pipboy_1.Cap.vats },
    strictPipboyMenu: false,
    hideHud: false,
    modFaction: null,
};
const describe = (thrown) => (thrown instanceof Error ? thrown.message : String(thrown));
// "full", ["map", "gps"], "0x0018" or a number.
const readMask = (value, where, problems) => {
    const parts = Array.isArray(value) ? value : [value];
    let mask = 0;
    for (const part of parts) {
        const cap = typeof part === "number" && Number.isInteger(part) ? part & pipboy_1.Cap.full : typeof part === "string" ? (0, pipboy_1.parseCap)(part) : null;
        if (cap === null) {
            problems.push(`${where}: ${JSON.stringify(part)} is no capability (${pipboy_1.kCapNames.join(", ")}, full, none)`);
            return null;
        }
        mask |= cap;
    }
    return mask;
};
const readForm = (value) => {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) {
        return value;
    }
    if (typeof value === "string" && /^(0x)?[0-9a-f]{1,8}$/i.test(value.trim())) {
        return parseInt(value.trim().replace(/^0x/i, ""), 16);
    }
    return null;
};
const loadConfig = () => {
    let raw;
    try {
        raw = JSON.parse((0, node_fs_1.readFileSync)(kConfigFile, "utf8"));
    }
    catch (thrown) {
        console.warn(`pipboy: pipboy.json not read (${describe(thrown)}); the module is off`);
        return kDefaults;
    }
    const problems = [];
    const devices = [];
    if (Array.isArray(raw["devices"])) {
        raw["devices"].forEach((entry, index) => {
            const fields = (typeof entry === "object" && entry !== null ? entry : {});
            const form = readForm(fields["form"]);
            const caps = readMask(fields["caps"], `devices[${index}].caps`, problems);
            if (form === null) {
                problems.push(`devices[${index}].form: ${JSON.stringify(fields["form"])} is no form ID`);
                return;
            }
            if (caps !== null) {
                devices.push({ form, caps, label: typeof fields["label"] === "string" ? fields["label"] : `0x${form.toString(16).toUpperCase()}`, wrist: fields["wrist"] === true });
            }
        });
    }
    const blockedMenus = {};
    const menus = raw["blockedMenus"];
    if (typeof menus === "object" && menus !== null) {
        for (const [menu, cap] of Object.entries(menus)) {
            const mask = readMask(cap, `blockedMenus.${menu}`, problems);
            if (mask !== null) {
                blockedMenus[menu] = mask;
            }
        }
    }
    const crack = raw["crackOnBlastDamage"];
    const config = {
        enabled: raw["enabled"] === true,
        noDeviceMask: readMask(raw["noDeviceMask"] ?? "none", "noDeviceMask", problems) ?? pipboy_1.Cap.none,
        devices,
        crackOnBlastDamage: typeof crack === "number" && crack > 0 ? crack : 0,
        blockedMenus,
        strictPipboyMenu: raw["strictPipboyMenu"] === true,
        hideHud: raw["hideHud"] === true,
        modFaction: raw["modFaction"] === null || raw["modFaction"] === undefined ? null : readForm(raw["modFaction"]),
    };
    if (raw["modFaction"] !== null && raw["modFaction"] !== undefined && config.modFaction === null) {
        problems.push(`modFaction: ${JSON.stringify(raw["modFaction"])} is no form ID`);
    }
    problems.forEach((problem) => console.warn(`pipboy.json: ${problem}`));
    return config;
};
let config = loadConfig();
const logConfig = () => {
    console.log(`pipboy: ${config.enabled ? "on" : "off"}; ${config.devices.length} device(s): ${config.devices.map((device) => `${device.label} [${(0, pipboy_1.describeMask)(device.caps)}]`).join("; ") || "none"}; ` +
        `without one: ${(0, pipboy_1.describeMask)(config.noDeviceMask)}; crack on blasts of ${config.crackOnBlastDamage > 0 ? config.crackOnBlastDamage : "never"}; ` +
        `mod: ${config.modFaction === null ? "none" : `faction 0x${config.modFaction.toString(16).toUpperCase().padStart(8, "0")}`}`);
};
logConfig();
// Player id -> their state, from login on.
const live = new Map();
const carries = (player, device) => {
    try {
        return player.getItemCount(device.form) > 0;
    }
    catch {
        return false;
    }
};
const carried = (player, stored) => config.devices.filter((device) => !(stored.cracked && device.wrist) && carries(player, device));
const maskOf = (player, state) => {
    if (!config.enabled) {
        return pipboy_1.Cap.full;
    }
    const devices = carried(player, state.stored).reduce((mask, device) => mask | device.caps, 0);
    return (devices | config.noDeviceMask | state.stored.grant) & ~state.stored.revoke & pipboy_1.Cap.full;
};
// The mask as it stands for a logged-in player; full for anyone else, who is restricted by nothing yet.
const capabilities = (player) => {
    const state = live.get(player.id);
    return state === undefined ? pipboy_1.Cap.full : maskOf(player, state);
};
exports.capabilities = capabilities;
// The bits of RP_PipboyBlock's rank, as RP_PipBoyManager.psc reads them.
const kModBlock = { vats: 1, menu: 2, tabs: 4, fastTravel: 8 };
const kPipboyScreens = pipboy_1.Cap.map | pipboy_1.Cap.radio | pipboy_1.Cap.biomonitor | pipboy_1.Cap.gps;
const modBlocks = (mask) => {
    if (!config.enabled) {
        return 0;
    }
    let blocks = 0;
    if ((mask & pipboy_1.Cap.vats) !== pipboy_1.Cap.vats) {
        blocks |= kModBlock.vats;
    }
    if (config.strictPipboyMenu && (mask & kPipboyScreens) === 0) {
        blocks |= kModBlock.menu;
    }
    // Experimental: what EnableJournal(false) locks in the Pip-Boy is for the testers to see.
    if ((mask & kPipboyScreens) !== kPipboyScreens) {
        blocks |= kModBlock.tabs;
    }
    if ((mask & pipboy_1.Cap.map) !== pipboy_1.Cap.map) {
        blocks |= kModBlock.fastTravel;
    }
    return blocks;
};
// The mod's half: the blocks as a rank in its faction, which their game's script reads.
const pushMod = (player, state, mask) => {
    if (config.modFaction === null) {
        return;
    }
    const rank = modBlocks(mask);
    if (rank === state.modRank) {
        return;
    }
    try {
        const set = player.setFactionRank(config.modFaction, rank);
        state.modRank = rank;
        console.log(`pipboy: ${(0, accounts_1.accountName)(player)} mod blocks ${rank}${set ? "" : " (not set: gone, or in 16 factions)"}`);
    }
    catch (thrown) {
        state.modRank = rank;
        console.warn(`pipboy: ${(0, accounts_1.accountName)(player)}: mod faction refused (${describe(thrown)}); check modFaction in pipboy.json`);
    }
};
const push = (player, why) => {
    const state = live.get(player.id);
    if (state === undefined || player.nickname === "") {
        return;
    }
    const message = {
        enabled: config.enabled,
        mask: maskOf(player, state),
        cracked: state.stored.cracked,
        blockedMenus: config.blockedMenus,
        strictPipboyMenu: config.strictPipboyMenu,
        hideHud: config.hideHud,
    };
    pushMod(player, state, message.mask);
    const json = JSON.stringify(message);
    if (json === state.sent) {
        return;
    }
    const first = state.sent === "";
    state.sent = json;
    player.emit(pipboy_1.PipboyEvents.state, json);
    if (config.enabled || first) {
        console.log(`pipboy: ${(0, accounts_1.accountName)(player)} -> ${(0, pipboy_1.describeMask)(message.mask)}${state.stored.cracked ? " (cracked)" : ""} (${why})`);
    }
};
const store = (player, change, why) => {
    const state = live.get(player.id);
    if (state === undefined) {
        return;
    }
    change(state.stored);
    Database.savePipboy(state.accountId, state.stored);
    push(player, why);
};
// From accounts.ts once a player who logged in stands in the world.
const begin = (player) => {
    const id = (0, accounts_1.accountId)(player);
    if (id === null) {
        return;
    }
    live.set(player.id, { accountId: id, stored: Database.findPipboy(id), sent: "", modRank: -1 });
    push(player, "login");
};
exports.begin = begin;
Events.on("playerDisconnect", (player) => {
    live.delete(player.id);
});
Events.on("inventoryChange", (player) => {
    if (live.has(player.id)) {
        setTimeout(() => push(player, "inventory"), kAfterChangeMs);
    }
});
const sweeper = setInterval(() => {
    for (const player of (0, accounts_1.loggedInPlayers)()) {
        push(player, "inventory");
    }
}, kSweepMs);
Events.on("resourceStop", (resourceName) => {
    if (resourceName === "fmp-gamemode") {
        clearInterval(sweeper);
    }
});
// --- a cracked Pip-Boy ---------------------------------------------------------------------------
// FMP reports neither the limb a hit lands on nor an EMP: a strong enough blast is what cracks it.
const onBlast = (victim, damage, kind) => {
    const state = live.get(victim.id);
    if (!config.enabled || config.crackOnBlastDamage <= 0 || kind !== "blast" || damage < config.crackOnBlastDamage || state === undefined || state.stored.cracked) {
        return;
    }
    const wrist = config.devices.find((device) => device.wrist && carries(victim, device));
    if (wrist === undefined) {
        return;
    }
    console.log(`pipboy: ${(0, accounts_1.accountName)(victim)}'s ${wrist.label} cracked by a blast of ${Math.round(damage)}`);
    (0, chat_1.reply)(victim, `Your ${wrist.label} was cracked by a blast. It needs repair.`);
    store(victim, (stored) => {
        stored.cracked = true;
    }, "a blast");
};
Events.on("playerHit", (_attacker, victim, damage, kind) => {
    onBlast(victim, damage, kind);
});
Events.on("npcAttack", (_npc, victim, damage, kind) => {
    onBlast(victim, damage, kind);
});
// --- commands ------------------------------------------------------------------------------------
const report = (to, player) => {
    const state = live.get(player.id);
    if (state === undefined) {
        (0, chat_1.reply)(to, `${(0, accounts_1.accountName)(player)} has not logged in`);
        return;
    }
    const devices = carried(player, { ...state.stored, cracked: false })
        .map((device) => `${device.label}${state.stored.cracked && device.wrist ? " (cracked)" : ""}`)
        .join(", ");
    (0, chat_1.reply)(to, `Pip-Boy ${(0, accounts_1.accountName)(player)}: ${(0, pipboy_1.describeMask)(maskOf(player, state))}${config.enabled ? "" : " (module off)"}`);
    (0, chat_1.reply)(to, `Devices: ${devices || "none"}; granted: ${(0, pipboy_1.describeMask)(state.stored.grant)}; revoked: ${(0, pipboy_1.describeMask)(state.stored.revoke)}`);
};
const readCaps = (to, args) => {
    if (args.length === 0) {
        (0, chat_1.reply)(to, `Name the capabilities: ${pipboy_1.kCapNames.join(", ")}, full`);
        return null;
    }
    let mask = 0;
    for (const arg of args) {
        const cap = (0, pipboy_1.parseCap)(arg);
        if (cap === null) {
            (0, chat_1.reply)(to, `No such capability: ${arg}. Known: ${pipboy_1.kCapNames.join(", ")}, full`);
            return null;
        }
        mask |= cap;
    }
    return mask;
};
const kUsage = "/pipboy [player] | grant|revoke <player> <capabilities...> | reset|crack|repair <player>";
(0, chat_1.registerCommands)(chat_1.AdminLevel.player, {
    // "/pipboy": what the sender's own Pip-Boy allows. Staff (moderator+) also see and set anyone's.
    pipboy: (player, args) => {
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
            const someone = (0, players_1.findPlayer)(player, action);
            if (someone !== null) {
                report(player, someone);
            }
            return;
        }
        const someone = (0, players_1.findPlayer)(player, target);
        if (someone === null) {
            (0, chat_1.reply)(player, kUsage);
            return;
        }
        if (!live.has(someone.id)) {
            (0, chat_1.reply)(player, `${(0, accounts_1.accountName)(someone)} has not logged in`);
            return;
        }
        handler(player, someone, rest);
    },
});
const isStaff = (player) => (0, accounts_1.adminLevel)(player) >= chat_1.AdminLevel.moderator;
const kStaffActions = {
    grant: (by, player, args) => {
        const mask = readCaps(by, args);
        if (mask !== null) {
            store(player, (stored) => {
                stored.grant |= mask;
                stored.revoke &= ~mask;
            }, `${(0, accounts_1.accountName)(by)} granted ${(0, pipboy_1.describeMask)(mask)}`);
            report(by, player);
        }
    },
    revoke: (by, player, args) => {
        const mask = readCaps(by, args);
        if (mask !== null) {
            store(player, (stored) => {
                stored.revoke |= mask;
                stored.grant &= ~mask;
            }, `${(0, accounts_1.accountName)(by)} revoked ${(0, pipboy_1.describeMask)(mask)}`);
            report(by, player);
        }
    },
    reset: (by, player) => {
        store(player, (stored) => {
            stored.grant = 0;
            stored.revoke = 0;
        }, `${(0, accounts_1.accountName)(by)} reset grants`);
        report(by, player);
    },
    crack: (by, player) => {
        store(player, (stored) => {
            stored.cracked = true;
        }, `${(0, accounts_1.accountName)(by)} cracked it`);
        (0, chat_1.reply)(player, "Your Pip-Boy is cracked. It needs repair.");
        report(by, player);
    },
    repair: (by, player) => {
        store(player, (stored) => {
            stored.cracked = false;
        }, `${(0, accounts_1.accountName)(by)} repaired it`);
        (0, chat_1.reply)(player, "Your Pip-Boy works again.");
        report(by, player);
    },
};
// --- console -------------------------------------------------------------------------------------
Events.on("consoleCommand", (command, args) => {
    if (command !== "pipboy") {
        return;
    }
    if (args[0] === "reload") {
        config = loadConfig();
        logConfig();
        for (const player of (0, accounts_1.loggedInPlayers)()) {
            push(player, "config reloaded");
        }
        return;
    }
    logConfig();
    for (const player of (0, accounts_1.loggedInPlayers)()) {
        if ((0, accounts_1.isLoggedIn)(player)) {
            console.log(`  ${(0, accounts_1.accountName)(player)}: ${(0, pipboy_1.describeMask)((0, exports.capabilities)(player))}${live.get(player.id)?.stored.cracked === true ? " (cracked)" : ""}`);
        }
    }
    console.log("pipboy reload: read pipboy.json again");
});
