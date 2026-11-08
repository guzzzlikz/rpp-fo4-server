// Entry point of the default gamemode. Each feature registers its own handlers and commands from a
// module of its own; this file owns what is left: the join log and command dispatch. Death and
// respawning are in respawn.ts.

import { adminLevel, isLoggedIn } from "./accounts";
import "./admin";
import "./character";
import { AdminLevel, type Command, commandsFor, findCommand, kAdminLevelNames, registerCommands, reply } from "./chat";
import "./commands";
import "./emotes";
import "./explosives";
import "./powerarmor";
import "./respawn";
import "./roleplay";

// What the server answers itself, after the gamemode has seen the line (core/server.cpp,
// OnChatCommand): not the gamemode's to call unknown.
const kServerCommands: ReadonlySet<string> = new Set(["invset", "npc"]);

Events.on("playerConnect", (player: Player): void => {
    console.log(`${player.nickname} is connecting`);
});

Events.on("playerReady", (player: Player): void => {
    console.log(`${player.nickname} is in the world`);
});

Events.on("playerDisconnect", (player: Player): void => {
    console.log(`${player.nickname} left`);
});

registerCommands(AdminLevel.player, {
    // "/help": every command the sender's rank may run.
    help: (player: Player): void => {
        const level: AdminLevel = adminLevel(player);
        reply(player, `Commands (${kAdminLevelNames[level]}): ${commandsFor(level).map((command: Command): string => `/${command.name}`).join(" ")}`);
    },
});

// Nobody runs a command before they are somebody, and none above their rank. A command they may not
// run reads as one that does not exist.
Events.on("playerCommand", (player: Player, name: string, args: string[]): void => {
    if (!isLoggedIn(player)) {
        return;
    }
    const command: Command | undefined = findCommand(name);
    if (command === undefined && kServerCommands.has(name)) {
        return;
    }
    if (command === undefined || command.level > adminLevel(player)) {
        reply(player, `Unknown command /${name}. Type /help for the list.`);
        return;
    }
    command.run(player, args);
});
