"use strict";
// Roleplay chat and money. What a player types without a slash is said aloud: only the players around
// them read it, under their character's name. The commands add actions (/me, /do), shouting,
// out-of-character talk, local (/b) and global (/ooc), private messages and handing over caps.
Object.defineProperty(exports, "__esModule", { value: true });
const accounts_1 = require("./accounts");
const chat_1 = require("./chat");
const players_1 = require("./players");
// Game units; 1 unit is about 1.43 cm, so 70 make a metre.
const kSayRange = 1400;
const kShoutRange = 2800;
const kPayRange = 250;
// Packed 0xRRGGBBAA.
const kSayColor = 0xe6e6e6ff;
const kShoutColor = 0xffffffff;
const kActionColor = 0xc2a2daff;
const kLocalOocColor = 0xa0a0a0ff;
const kOocColor = 0x9fc5e8ff;
const kPrivateColor = 0xf0d070ff;
const kMoneyColor = 0x9be36aff;
const sameSpace = (a, b) => a !== null && b !== null && a.worldSpace === b.worldSpace && a.interiorCell === b.interiorCell;
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
// The logged-in players within `range` of a player, the player included.
const around = (player, range) => {
    const space = player.getSpace();
    const position = player.position;
    return (0, accounts_1.loggedInPlayers)().filter((other) => other.virtualWorld === player.virtualWorld && sameSpace(other.getSpace(), space) && distance(other.position, position) <= range);
};
const sayAround = (player, range, text, color) => {
    for (const listener of around(player, range)) {
        Chat.sendToPlayer(listener, text, { color });
    }
};
const joined = (args) => args.join(" ").trim();
// Plain chat is speech: local, under the character's name, and never seen by anyone not logged in.
Events.on("playerChat", (player, text) => {
    if ((0, accounts_1.isLoggedIn)(player)) {
        sayAround(player, kSayRange, `${(0, accounts_1.characterName)(player)} says: ${text}`, kSayColor);
    }
    return false;
});
(0, chat_1.registerCommands)(chat_1.AdminLevel.player, {
    // "/me <action>": "* John Smith opens the door."
    me: (player, args) => {
        const action = joined(args);
        if (action === "") {
            (0, chat_1.reply)(player, "/me <action>");
            return;
        }
        sayAround(player, kSayRange, `* ${(0, accounts_1.characterName)(player)} ${action}`, kActionColor);
    },
    // "/do <description>": what is seen around the character, "* The door is locked. (( John Smith ))".
    do: (player, args) => {
        const description = joined(args);
        if (description === "") {
            (0, chat_1.reply)(player, "/do <description>");
            return;
        }
        sayAround(player, kSayRange, `* ${description} (( ${(0, accounts_1.characterName)(player)} ))`, kActionColor);
    },
    // "/s <text>": shouted, heard twice as far.
    s: (player, args) => {
        const text = joined(args);
        if (text === "") {
            (0, chat_1.reply)(player, "/s <text>");
            return;
        }
        sayAround(player, kShoutRange, `${(0, accounts_1.characterName)(player)} shouts: ${text}!`, kShoutColor);
    },
    // "/b <text>": out of character, to the players around.
    b: (player, args) => {
        const text = joined(args);
        if (text === "") {
            (0, chat_1.reply)(player, "/b <text>");
            return;
        }
        sayAround(player, kSayRange, `(( ${(0, accounts_1.characterName)(player)} [${player.id}]: ${text} ))`, kLocalOocColor);
    },
    // "/ooc <text>": out of character, to everyone.
    ooc: (player, args) => {
        const text = joined(args);
        if (text === "") {
            (0, chat_1.reply)(player, "/ooc <text>");
            return;
        }
        for (const listener of (0, accounts_1.loggedInPlayers)()) {
            Chat.sendToPlayer(listener, `(( [OOC] ${(0, accounts_1.accountName)(player)}: ${text} ))`, { color: kOocColor });
        }
    },
    // "/pm <player> <text>": a private, out-of-character message.
    pm: (player, args) => {
        const [query, ...rest] = args;
        const text = joined(rest);
        if (query === undefined || text === "") {
            (0, chat_1.reply)(player, "/pm <id or name> <text>");
            return;
        }
        const target = (0, players_1.findPlayer)(player, query);
        if (target === null) {
            return;
        }
        Chat.sendToPlayer(target, `(( PM from ${(0, accounts_1.characterName)(player)} [${player.id}]: ${text} ))`, { color: kPrivateColor });
        Chat.sendToPlayer(player, `(( PM to ${(0, accounts_1.characterName)(target)} [${target.id}]: ${text} ))`, { color: kPrivateColor });
    },
    // "/pay <player> <caps>": hands caps to someone standing next to the sender.
    pay: (player, args) => {
        const [query, amountText] = args;
        const amount = (0, chat_1.parseNumber)(amountText);
        if (query === undefined || amount === undefined || !Number.isInteger(amount) || amount <= 0) {
            (0, chat_1.reply)(player, "/pay <id or name> <caps>");
            return;
        }
        const target = (0, players_1.findPlayer)(player, query);
        if (target === null) {
            return;
        }
        if (target.id === player.id) {
            (0, chat_1.reply)(player, "You cannot pay yourself");
            return;
        }
        if (!around(player, kPayRange).some((other) => other.id === target.id)) {
            (0, chat_1.reply)(player, `${(0, accounts_1.characterName)(target)} is too far away`);
            return;
        }
        const caps = player.getCaps();
        if (caps < amount) {
            (0, chat_1.reply)(player, `You only have ${caps} caps`);
            return;
        }
        player.setCaps(caps - amount);
        target.setCaps(target.getCaps() + amount);
        Chat.sendToPlayer(player, `You gave ${amount} caps to ${(0, accounts_1.characterName)(target)}.`, { color: kMoneyColor });
        Chat.sendToPlayer(target, `${(0, accounts_1.characterName)(player)} gave you ${amount} caps.`, { color: kMoneyColor });
        sayAround(player, kSayRange, `* ${(0, accounts_1.characterName)(player)} hands some caps to ${(0, accounts_1.characterName)(target)}.`, kActionColor);
        console.log(`${(0, accounts_1.accountName)(player)} paid ${amount} caps to ${(0, accounts_1.accountName)(target)}`);
    },
});
