// Roleplay chat and money. What a player types without a slash is said aloud: only the players around
// them read it, under their character's name. The commands add actions (/me, /do), shouting,
// out-of-character talk, local (/b) and global (/ooc), private messages and handing over caps.

import { characterName, isLoggedIn, loggedInPlayers } from "./accounts";
import { AdminLevel, parseNumber, registerCommands, reply } from "./chat";
import { findPlayer } from "./players";

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

const sameSpace = (a: PlayerSpace | null, b: PlayerSpace | null): boolean => a !== null && b !== null && a.worldSpace === b.worldSpace && a.interiorCell === b.interiorCell;

const distance = (a: Vector3, b: Vector3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// The logged-in players within `range` of a player, the player included.
const around = (player: Player, range: number): Player[] => {
    const space: PlayerSpace | null = player.getSpace();
    const position: Vector3 = player.position;
    return loggedInPlayers().filter((other: Player): boolean => other.virtualWorld === player.virtualWorld && sameSpace(other.getSpace(), space) && distance(other.position, position) <= range);
};

const sayAround = (player: Player, range: number, text: string, color: number): void => {
    for (const listener of around(player, range)) {
        Chat.sendToPlayer(listener, text, { color });
    }
};

const joined = (args: string[]): string => args.join(" ").trim();

// Plain chat is speech: local, under the character's name, and never seen by anyone not logged in.
Events.on("playerChat", (player: Player, text: string): false => {
    if (isLoggedIn(player)) {
        sayAround(player, kSayRange, `${characterName(player)} says: ${text}`, kSayColor);
    }
    return false;
});

registerCommands(AdminLevel.player, {
    // "/me <action>": "* John Smith opens the door."
    me: (player: Player, args: string[]): void => {
        const action: string = joined(args);
        if (action === "") {
            reply(player, "/me <action>");
            return;
        }
        sayAround(player, kSayRange, `* ${characterName(player)} ${action}`, kActionColor);
    },

    // "/do <description>": what is seen around the character, "* The door is locked. (( John Smith ))".
    do: (player: Player, args: string[]): void => {
        const description: string = joined(args);
        if (description === "") {
            reply(player, "/do <description>");
            return;
        }
        sayAround(player, kSayRange, `* ${description} (( ${characterName(player)} ))`, kActionColor);
    },

    // "/s <text>": shouted, heard twice as far.
    s: (player: Player, args: string[]): void => {
        const text: string = joined(args);
        if (text === "") {
            reply(player, "/s <text>");
            return;
        }
        sayAround(player, kShoutRange, `${characterName(player)} shouts: ${text}!`, kShoutColor);
    },

    // "/b <text>": out of character, to the players around.
    b: (player: Player, args: string[]): void => {
        const text: string = joined(args);
        if (text === "") {
            reply(player, "/b <text>");
            return;
        }
        sayAround(player, kSayRange, `(( ${characterName(player)} [${player.id}]: ${text} ))`, kLocalOocColor);
    },

    // "/ooc <text>": out of character, to everyone.
    ooc: (player: Player, args: string[]): void => {
        const text: string = joined(args);
        if (text === "") {
            reply(player, "/ooc <text>");
            return;
        }
        for (const listener of loggedInPlayers()) {
            Chat.sendToPlayer(listener, `(( [OOC] ${player.nickname}: ${text} ))`, { color: kOocColor });
        }
    },

    // "/pm <player> <text>": a private, out-of-character message.
    pm: (player: Player, args: string[]): void => {
        const [query, ...rest]: string[] = args;
        const text: string = joined(rest);
        if (query === undefined || text === "") {
            reply(player, "/pm <id or name> <text>");
            return;
        }
        const target: Player | null = findPlayer(player, query);
        if (target === null) {
            return;
        }
        Chat.sendToPlayer(target, `(( PM from ${characterName(player)} [${player.id}]: ${text} ))`, { color: kPrivateColor });
        Chat.sendToPlayer(player, `(( PM to ${characterName(target)} [${target.id}]: ${text} ))`, { color: kPrivateColor });
    },

    // "/pay <player> <caps>": hands caps to someone standing next to the sender.
    pay: (player: Player, args: string[]): void => {
        const [query, amountText]: string[] = args;
        const amount = parseNumber(amountText);
        if (query === undefined || amount === undefined || !Number.isInteger(amount) || amount <= 0) {
            reply(player, "/pay <id or name> <caps>");
            return;
        }
        const target: Player | null = findPlayer(player, query);
        if (target === null) {
            return;
        }
        if (target.id === player.id) {
            reply(player, "You cannot pay yourself");
            return;
        }
        if (!around(player, kPayRange).some((other: Player): boolean => other.id === target.id)) {
            reply(player, `${characterName(target)} is too far away`);
            return;
        }
        const caps: number = player.getCaps();
        if (caps < amount) {
            reply(player, `You only have ${caps} caps`);
            return;
        }
        player.setCaps(caps - amount);
        target.setCaps(target.getCaps() + amount);
        Chat.sendToPlayer(player, `You gave ${amount} caps to ${characterName(target)}.`, { color: kMoneyColor });
        Chat.sendToPlayer(target, `${characterName(player)} gave you ${amount} caps.`, { color: kMoneyColor });
        sayAround(player, kSayRange, `* ${characterName(player)} hands some caps to ${characterName(target)}.`, kActionColor);
        console.log(`${player.nickname} paid ${amount} caps to ${target.nickname}`);
    },
});
