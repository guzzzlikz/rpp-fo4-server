// Staff: ranks kept on the account, and the tools that come with them. The server console appoints the
// first owner ("setadmin <account> owner"); from then on owners rank others from the game.

import { accountName, adminLevel, characterName, forgetAccount, loggedInPlayers, refreshAdminLevel } from "./accounts";
import { AdminLevel, chatTo, isAdminLevel, kAdminLevelNames, registerCommands, reply } from "./chat";
import * as Database from "./database";
import { teleportSpace } from "./places";
import { findPlayer } from "./players";

const kStaffChatColor = 0xf4a460ff;

// A rank as typed: its name ("admin") or its number ("2").
const parseAdminLevel = (text: string | undefined): AdminLevel | undefined => {
    if (text === undefined) {
        return undefined;
    }
    const byName = Object.entries(kAdminLevelNames).find(([, name]: [string, string]): boolean => name === text.toLowerCase());
    const level = Number(byName !== undefined ? byName[0] : text);
    return isAdminLevel(level) ? level : undefined;
};

// Ranks an account, in the database and on the player if they are on. The message says what happened.
const setRank = (accountName: string | undefined, levelText: string | undefined): string => {
    const level: AdminLevel | undefined = parseAdminLevel(levelText);
    if (accountName === undefined || level === undefined) {
        return `setadmin <account> <${Object.values(kAdminLevelNames).join("|")}>`;
    }
    if (!Database.setAdminLevel(accountName, level)) {
        return `No account named ${accountName}`;
    }
    const online: Player | null = refreshAdminLevel(accountName, level);
    if (online !== null) {
        reply(online, `You are now ${kAdminLevelNames[level]}.`);
    }
    console.log(`${accountName} is now ${kAdminLevelNames[level]}`);
    return `${accountName} is now ${kAdminLevelNames[level]}`;
};

// Deletes an account and its character, so the username can be registered afresh. Whoever plays it
// is kicked first, unsaved. Console only: nothing in the game may do this.
const deleteAccount = (name: string | undefined): string => {
    if (name === undefined) {
        return "deleteaccount <username>";
    }
    const account: Database.Account | null = Database.findAccount(name);
    if (account === null) {
        return `No account named ${name}`;
    }
    const kicked: string | null = forgetAccount(account.id, "Your account was deleted");
    Database.deleteAccount(account.id);
    return `Deleted account ${account.name} and its character ${account.characterName ?? "(none)"}${kicked !== null ? `; kicked ${kicked}` : ""}`;
};

Events.on("consoleCommand", (command: string, args: string[]): void => {
    if (command === "setadmin") {
        console.log(setRank(args[0], args[1]));
    } else if (command === "deleteaccount") {
        console.log(deleteAccount(args[0]));
    }
});

registerCommands(AdminLevel.moderator, {
    // "/a <text>": staff chat.
    a: (player: Player, args: string[]): void => {
        const text: string = args.join(" ").trim();
        if (text === "") {
            reply(player, "/a <text>");
            return;
        }
        for (const staff of loggedInPlayers().filter((other: Player): boolean => adminLevel(other) >= AdminLevel.moderator)) {
            chatTo(staff, `[Staff] ${kAdminLevelNames[adminLevel(player)]} ${accountName(player)}: ${text}`, { color: kStaffChatColor });
        }
    },

    // "/kick <player> [reason]".
    kick: (player: Player, args: string[]): void => {
        const [query, ...rest]: string[] = args;
        const target: Player | null = findPlayer(player, query);
        if (target === null) {
            return;
        }
        if (adminLevel(target) >= adminLevel(player)) {
            reply(player, `You cannot kick ${characterName(target)}`);
            return;
        }
        const reason: string = rest.join(" ").trim() || "Kicked by staff";
        console.log(`${accountName(player)} kicked ${accountName(target)}: ${reason}`);
        target.kick(reason);
    },

    // "/goto <player>": to them.
    goto: (player: Player, args: string[]): void => {
        const target: Player | null = findPlayer(player, args[0]);
        if (target !== null) {
            player.teleport(target.position, target.heading, teleportSpace(target.getSpace()));
        }
    },

    // "/gethere <player>": them to the sender.
    gethere: (player: Player, args: string[]): void => {
        const target: Player | null = findPlayer(player, args[0]);
        if (target !== null) {
            target.teleport(player.position, player.heading, teleportSpace(player.getSpace()));
            reply(target, `${characterName(player)} brought you to them.`);
        }
    },
});

registerCommands(AdminLevel.owner, {
    // "/setadmin <account> <rank>".
    setadmin: (player: Player, args: string[]): void => {
        reply(player, setRank(args[0], args[1]));
    },
});
