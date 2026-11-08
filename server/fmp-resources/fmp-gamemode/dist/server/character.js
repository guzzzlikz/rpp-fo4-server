"use strict";
// What the default gamemode does with character progression: the game's own rules, logged, and
// chat commands to look at and change a character.
Object.defineProperty(exports, "__esModule", { value: true });
const chat_1 = require("./chat");
const kSpecial = ["Strength", "Perception", "Endurance", "Charisma", "Intelligence", "Agility", "Luck"];
const kMaxPerkPoints = 255;
const summarize = (player) => {
    const stats = kSpecial.map((name) => `${name[0]}${player.getBaseValue(name) ?? "?"}`).join(" ");
    const health = player.getValue("Health")?.toFixed(0) ?? "?";
    const rads = player.getValue("Rads")?.toFixed(0) ?? "?";
    return `Level ${player.getLevel()} (${player.getXp().toFixed(0)} XP, next at ${Player.xpForLevel(player.getLevel() + 1)}), ${player.getPerkPoints()} perk points, ${player.getPerks().length} perks, ${stats}, health ${health}, rads ${rads}, ${player.getCaps()} caps`;
};
const isWhole = (value, min, max) => value !== undefined && Number.isInteger(value) && value >= min && value <= max;
(0, chat_1.registerCommands)(chat_1.AdminLevel.player, {
    // "/char": the sender's character.
    char: (player) => {
        (0, chat_1.reply)(player, summarize(player));
    },
});
// Changing a character is staff work.
(0, chat_1.registerCommands)(chat_1.AdminLevel.admin, {
    // "/xp <amount>": awards XP as the game does.
    xp: (player, args) => {
        const amount = (0, chat_1.parseNumber)(args[0]);
        if (amount === undefined || amount <= 0) {
            (0, chat_1.reply)(player, "/xp: expected <amount>");
            return;
        }
        player.addXp(amount);
    },
    // "/level <level>": sets the level, and the XP to its start.
    level: (player, args) => {
        const level = (0, chat_1.parseNumber)(args[0]);
        if (!isWhole(level, 1, Number.MAX_SAFE_INTEGER)) {
            (0, chat_1.reply)(player, "/level: expected <level>");
            return;
        }
        player.setLevel(level);
    },
    // "/perkpoints <points>": sets the unspent perk points.
    perkpoints: (player, args) => {
        const points = (0, chat_1.parseNumber)(args[0]);
        if (!isWhole(points, 0, kMaxPerkPoints)) {
            (0, chat_1.reply)(player, `/perkpoints: expected <0-${kMaxPerkPoints}>`);
            return;
        }
        player.setPerkPoints(points);
    },
    // "/perk list", "/perk add <form>", "/perk remove <form>", "/perk chart".
    perk: (player, args) => {
        const [what, form] = args;
        if (what === "chart") {
            player.openPerkChart();
            return;
        }
        if (what === "list") {
            const perks = player.getPerks();
            (0, chat_1.reply)(player, perks.length > 0 ? `Perks: ${perks.map(chat_1.formatForm).join(", ")}` : "No perks");
            return;
        }
        const id = (0, chat_1.parseForm)(form);
        if ((what !== "add" && what !== "remove") || id === undefined) {
            (0, chat_1.reply)(player, "/perk: list, chart, add <form>, remove <form>");
            return;
        }
        try {
            const done = what === "add" ? player.addPerk(id) : player.removePerk(id);
            if (!done) {
                (0, chat_1.reply)(player, `/perk: nothing to ${what}`);
            }
        }
        catch {
            (0, chat_1.reply)(player, `/perk: ${(0, chat_1.formatForm)(id)} is not a perk`);
        }
    },
    // "/special": the SPECIAL menu. "/special <value> <base>": sets one base.
    special: (player, args) => {
        if (args.length === 0) {
            if (!Game.has("specialMenu")) {
                (0, chat_1.reply)(player, `/special: ${Game.name} has no SPECIAL menu; use /special <value> <base>`);
                return;
            }
            player.openSpecialMenu();
            return;
        }
        const [name, baseText] = args;
        const base = (0, chat_1.parseNumber)(baseText);
        if (name === undefined || base === undefined) {
            (0, chat_1.reply)(player, "/special [<value> <base>]");
            return;
        }
        try {
            player.setBaseValue(name, base);
        }
        catch {
            (0, chat_1.reply)(player, `/special: no actor value named ${name}`);
        }
    },
    // "/value <name>": a value. "/value <name> damage|restore|set <amount>": changes its current value.
    value: (player, args) => {
        const [name, how, amountText] = args;
        if (name === undefined) {
            (0, chat_1.reply)(player, "/value <name> [damage|restore|set <amount>]");
            return;
        }
        const amount = (0, chat_1.parseNumber)(amountText);
        try {
            if (how === undefined) {
                (0, chat_1.reply)(player, `${name}: ${player.getValue(name) ?? "unknown"} (base ${player.getBaseValue(name) ?? "unknown"})`);
            }
            else if (amount !== undefined && how === "damage") {
                player.damageValue(name, amount);
            }
            else if (amount !== undefined && how === "restore") {
                player.restoreValue(name, amount);
            }
            else if (amount !== undefined && how === "set") {
                player.setValue(name, amount);
            }
            else {
                (0, chat_1.reply)(player, "/value <name> [damage|restore|set <amount>]");
            }
        }
        catch {
            (0, chat_1.reply)(player, `/value: no actor value named ${name}`);
        }
    },
    // "/caps": the bottle caps carried. "/caps <count>": sets them.
    caps: (player, args) => {
        const count = (0, chat_1.parseNumber)(args[0]);
        if (count === undefined) {
            (0, chat_1.reply)(player, `${player.getCaps()} caps`);
            return;
        }
        player.setCaps(count);
    },
});
Events.on("playerCharacterLoad", (player) => {
    console.log(`${player.nickname}: character established. ${summarize(player)}`);
});
Events.on("playerXpGain", (player, amount) => {
    console.log(`${player.nickname} earned ${amount.toFixed(1)} XP`);
});
Events.on("playerLevelChange", (player, level, previous) => {
    console.log(`${player.nickname} is level ${level} (was ${previous})`);
    if (level > previous) {
        (0, chat_1.reply)(player, `Level ${level}! ${player.getPerkPoints()} perk points to spend.`);
    }
});
Events.on("playerPerkRequest", (player, form, kind) => {
    console.log(`${player.nickname}: perk ${(0, chat_1.formatForm)(form)} ${kind}`);
});
Events.on("playerValueRequest", (player, value, previous, base) => {
    console.log(`${player.nickname}: ${value} ${previous} -> ${base}`);
});
