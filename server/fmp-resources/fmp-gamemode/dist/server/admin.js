"use strict";
// Staff: ranks kept on the account, and the tools that come with them. The server console appoints the
// first owner ("setadmin <account> owner"); from then on owners rank others from the game.
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
const accounts_1 = require("./accounts");
const chat_1 = require("./chat");
const Database = __importStar(require("./database"));
const places_1 = require("./places");
const players_1 = require("./players");
const kStaffChatColor = 0xf4a460ff;
// A rank as typed: its name ("admin") or its number ("2").
const parseAdminLevel = (text) => {
    if (text === undefined) {
        return undefined;
    }
    const byName = Object.entries(chat_1.kAdminLevelNames).find(([, name]) => name === text.toLowerCase());
    const level = Number(byName !== undefined ? byName[0] : text);
    return (0, chat_1.isAdminLevel)(level) ? level : undefined;
};
// Ranks an account, in the database and on the player if they are on. The message says what happened.
const setRank = (accountName, levelText) => {
    const level = parseAdminLevel(levelText);
    if (accountName === undefined || level === undefined) {
        return `setadmin <account> <${Object.values(chat_1.kAdminLevelNames).join("|")}>`;
    }
    if (!Database.setAdminLevel(accountName, level)) {
        return `No account named ${accountName}`;
    }
    const online = (0, accounts_1.refreshAdminLevel)(accountName, level);
    if (online !== null) {
        (0, chat_1.reply)(online, `You are now ${chat_1.kAdminLevelNames[level]}.`);
    }
    console.log(`${accountName} is now ${chat_1.kAdminLevelNames[level]}`);
    return `${accountName} is now ${chat_1.kAdminLevelNames[level]}`;
};
Events.on("consoleCommand", (command, args) => {
    if (command === "setadmin") {
        console.log(setRank(args[0], args[1]));
    }
});
(0, chat_1.registerCommands)(chat_1.AdminLevel.moderator, {
    // "/a <text>": staff chat.
    a: (player, args) => {
        const text = args.join(" ").trim();
        if (text === "") {
            (0, chat_1.reply)(player, "/a <text>");
            return;
        }
        for (const staff of (0, accounts_1.loggedInPlayers)().filter((other) => (0, accounts_1.adminLevel)(other) >= chat_1.AdminLevel.moderator)) {
            Chat.sendToPlayer(staff, `[Staff] ${chat_1.kAdminLevelNames[(0, accounts_1.adminLevel)(player)]} ${player.nickname}: ${text}`, { color: kStaffChatColor });
        }
    },
    // "/kick <player> [reason]".
    kick: (player, args) => {
        const [query, ...rest] = args;
        const target = (0, players_1.findPlayer)(player, query);
        if (target === null) {
            return;
        }
        if ((0, accounts_1.adminLevel)(target) >= (0, accounts_1.adminLevel)(player)) {
            (0, chat_1.reply)(player, `You cannot kick ${(0, accounts_1.characterName)(target)}`);
            return;
        }
        const reason = rest.join(" ").trim() || "Kicked by staff";
        console.log(`${player.nickname} kicked ${target.nickname}: ${reason}`);
        target.kick(reason);
    },
    // "/goto <player>": to them.
    goto: (player, args) => {
        const target = (0, players_1.findPlayer)(player, args[0]);
        if (target !== null) {
            player.teleport(target.position, target.heading, (0, places_1.teleportSpace)(target.getSpace()));
        }
    },
    // "/gethere <player>": them to the sender.
    gethere: (player, args) => {
        const target = (0, players_1.findPlayer)(player, args[0]);
        if (target !== null) {
            target.teleport(player.position, player.heading, (0, places_1.teleportSpace)(player.getSpace()));
            (0, chat_1.reply)(target, `${player.nickname} brought you to them.`);
        }
    },
});
(0, chat_1.registerCommands)(chat_1.AdminLevel.owner, {
    // "/setadmin <account> <rank>".
    setadmin: (player, args) => {
        (0, chat_1.reply)(player, setRank(args[0], args[1]));
    },
});
