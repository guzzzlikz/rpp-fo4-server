// What the default gamemode does with character progression: the game's own rules, logged, and
// chat commands to look at and change a character.

import { AdminLevel, formatForm, parseForm, parseNumber, registerCommands, reply } from "./chat";

const kSpecial: readonly string[] = ["Strength", "Perception", "Endurance", "Charisma", "Intelligence", "Agility", "Luck"];

const kMaxPerkPoints = 255;

const summarize = (player: Player): string => {
    const stats: string = kSpecial.map((name: string): string => `${name[0]}${player.getBaseValue(name) ?? "?"}`).join(" ");
    const health: string = player.getValue("Health")?.toFixed(0) ?? "?";
    const rads: string = player.getValue("Rads")?.toFixed(0) ?? "?";
    return `Level ${player.getLevel()} (${player.getXp().toFixed(0)} XP, next at ${Player.xpForLevel(player.getLevel() + 1)}), ${player.getPerkPoints()} perk points, ${player.getPerks().length} perks, ${stats}, health ${health}, rads ${rads}, ${player.getCaps()} caps`;
};

const isWhole = (value: number | undefined, min: number, max: number): value is number => value !== undefined && Number.isInteger(value) && value >= min && value <= max;

registerCommands(AdminLevel.player, {
    // "/char": the sender's character.
    char: (player: Player): void => {
        reply(player, summarize(player));
    },
});

// Changing a character is staff work.
registerCommands(AdminLevel.admin, {
    // "/xp <amount>": awards XP as the game does.
    xp: (player: Player, args: string[]): void => {
        const amount = parseNumber(args[0]);
        if (amount === undefined || amount <= 0) {
            reply(player, "/xp: expected <amount>");
            return;
        }
        player.addXp(amount);
    },

    // "/level <level>": sets the level, and the XP to its start.
    level: (player: Player, args: string[]): void => {
        const level = parseNumber(args[0]);
        if (!isWhole(level, 1, Number.MAX_SAFE_INTEGER)) {
            reply(player, "/level: expected <level>");
            return;
        }
        player.setLevel(level);
    },

    // "/perkpoints <points>": sets the unspent perk points.
    perkpoints: (player: Player, args: string[]): void => {
        const points = parseNumber(args[0]);
        if (!isWhole(points, 0, kMaxPerkPoints)) {
            reply(player, `/perkpoints: expected <0-${kMaxPerkPoints}>`);
            return;
        }
        player.setPerkPoints(points);
    },

    // "/perk list", "/perk add <form>", "/perk remove <form>", "/perk chart".
    perk: (player: Player, args: string[]): void => {
        const [what, form]: string[] = args;
        if (what === "chart") {
            player.openPerkChart();
            return;
        }
        if (what === "list") {
            const perks: number[] = player.getPerks();
            reply(player, perks.length > 0 ? `Perks: ${perks.map(formatForm).join(", ")}` : "No perks");
            return;
        }
        const id = parseForm(form);
        if ((what !== "add" && what !== "remove") || id === undefined) {
            reply(player, "/perk: list, chart, add <form>, remove <form>");
            return;
        }
        try {
            const done: boolean = what === "add" ? player.addPerk(id) : player.removePerk(id);
            if (!done) {
                reply(player, `/perk: nothing to ${what}`);
            }
        } catch {
            reply(player, `/perk: ${formatForm(id)} is not a perk`);
        }
    },

    // "/special": the SPECIAL menu. "/special <value> <base>": sets one base.
    special: (player: Player, args: string[]): void => {
        if (args.length === 0) {
            if (!Game.has("specialMenu")) {
                reply(player, `/special: ${Game.name} has no SPECIAL menu; use /special <value> <base>`);
                return;
            }
            player.openSpecialMenu();
            return;
        }
        const [name, baseText]: string[] = args;
        const base = parseNumber(baseText);
        if (name === undefined || base === undefined) {
            reply(player, "/special [<value> <base>]");
            return;
        }
        try {
            player.setBaseValue(name, base);
        } catch {
            reply(player, `/special: no actor value named ${name}`);
        }
    },

    // "/value <name>": a value. "/value <name> damage|restore|set <amount>": changes its current value.
    value: (player: Player, args: string[]): void => {
        const [name, how, amountText]: string[] = args;
        if (name === undefined) {
            reply(player, "/value <name> [damage|restore|set <amount>]");
            return;
        }
        const amount = parseNumber(amountText);
        try {
            if (how === undefined) {
                reply(player, `${name}: ${player.getValue(name) ?? "unknown"} (base ${player.getBaseValue(name) ?? "unknown"})`);
            } else if (amount !== undefined && how === "damage") {
                player.damageValue(name, amount);
            } else if (amount !== undefined && how === "restore") {
                player.restoreValue(name, amount);
            } else if (amount !== undefined && how === "set") {
                player.setValue(name, amount);
            } else {
                reply(player, "/value <name> [damage|restore|set <amount>]");
            }
        } catch {
            reply(player, `/value: no actor value named ${name}`);
        }
    },

    // "/caps": the bottle caps carried. "/caps <count>": sets them.
    caps: (player: Player, args: string[]): void => {
        const count = parseNumber(args[0]);
        if (count === undefined) {
            reply(player, `${player.getCaps()} caps`);
            return;
        }
        player.setCaps(count);
    },
});

Events.on("playerCharacterLoad", (player: Player): void => {
    console.log(`${player.nickname}: character established. ${summarize(player)}`);
});

Events.on("playerXpGain", (player: Player, amount: number): void => {
    console.log(`${player.nickname} earned ${amount.toFixed(1)} XP`);
});

Events.on("playerLevelChange", (player: Player, level: number, previous: number): void => {
    console.log(`${player.nickname} is level ${level} (was ${previous})`);
    if (level > previous) {
        reply(player, `Level ${level}! ${player.getPerkPoints()} perk points to spend.`);
    }
});

Events.on("playerPerkRequest", (player: Player, form: number, kind: "buy" | "grant" | "remove"): void => {
    console.log(`${player.nickname}: perk ${formatForm(form)} ${kind}`);
});

Events.on("playerValueRequest", (player: Player, value: string, previous: number, base: number): void => {
    console.log(`${player.nickname}: ${value} ${previous} -> ${base}`);
});
