"use strict";
// Entry point of the default gamemode. Each feature registers its own handlers and commands from a
// module of its own; this file owns what is left: the join log and command dispatch. Death and
// respawning are in respawn.ts.
Object.defineProperty(exports, "__esModule", { value: true });
const accounts_1 = require("./accounts");
require("./admin");
require("./character");
const chat_1 = require("./chat");
require("./commands");
require("./emotes");
require("./explosives");
require("./powerarmor");
require("./respawn");
require("./roleplay");
// What the server answers itself, after the gamemode has seen the line (core/server.cpp,
// OnChatCommand): not the gamemode's to call unknown.
const kServerCommands = new Set(["invset", "npc"]);
Events.on("playerConnect", (player) => {
    console.log(`${player.nickname} is connecting`);
});
Events.on("playerReady", (player) => {
    console.log(`${player.nickname} is in the world`);
});
Events.on("playerDisconnect", (player) => {
    console.log(`${player.nickname} left`);
});
(0, chat_1.registerCommands)(chat_1.AdminLevel.player, {
    // "/help": every command the sender's rank may run.
    help: (player) => {
        const level = (0, accounts_1.adminLevel)(player);
        (0, chat_1.reply)(player, `Commands (${chat_1.kAdminLevelNames[level]}): ${(0, chat_1.commandsFor)(level).map((command) => `/${command.name}`).join(" ")}`);
    },
});
// Nobody runs a command before they are somebody, and none above their rank. A command they may not
// run reads as one that does not exist.
Events.on("playerCommand", (player, name, args) => {
    if (!(0, accounts_1.isLoggedIn)(player)) {
        return;
    }
    const command = (0, chat_1.findCommand)(name);
    if (command === undefined && kServerCommands.has(name)) {
        return;
    }
    if (command === undefined || command.level > (0, accounts_1.adminLevel)(player)) {
        (0, chat_1.reply)(player, `Unknown command /${name}. Type /help for the list.`);
        return;
    }
    command.run(player, args);
});
