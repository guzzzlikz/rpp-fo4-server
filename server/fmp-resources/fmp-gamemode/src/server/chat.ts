// What the gamemode's chat commands share: answering the sender, and reading what they typed.

import type { Point } from "../shared/auth";
import { ChatEvents, type ChatLine } from "../shared/chat";

export type CommandHandler = (player: Player, args: string[]) => void;

// Staff ranks, lowest first. A command asks for one; a player whose account holds it or a higher one
// may run it.
export const AdminLevel = {
    player: 0,
    moderator: 1,
    admin: 2,
    owner: 3,
} as const;

export type AdminLevel = (typeof AdminLevel)[keyof typeof AdminLevel];

export const kAdminLevelNames: Readonly<Record<AdminLevel, string>> = { 0: "player", 1: "moderator", 2: "admin", 3: "owner" };

export const isAdminLevel = (value: number): value is AdminLevel => Object.hasOwn(kAdminLevelNames, value);

export interface Command {
    name: string;
    level: AdminLevel;
    run: CommandHandler;
}

// Every "/command" of the gamemode, by name without the slash; index.ts dispatches to them.
const commands = new Map<string, Command>();

export const registerCommands = (level: AdminLevel, handlers: Readonly<Record<string, CommandHandler>>): void => {
    for (const [name, run] of Object.entries(handlers)) {
        commands.set(name, { name, level, run });
    }
};

export const findCommand = (name: string): Command | undefined => commands.get(name);

// The commands a rank may run, by name.
export const commandsFor = (level: AdminLevel): Command[] => [...commands.values()].filter((command: Command): boolean => command.level <= level).sort((a: Command, b: Command): number => a.name.localeCompare(b.name));

// A chat line to one player, through the gamemode's own chat (ui/chat): FMP's native chat box does
// not take Cyrillic. Every line the gamemode sends goes through here.
export const chatTo = (player: Player, text: string, options: { color?: number; author?: string } = {}): void => {
    player.emit(ChatEvents.line, JSON.stringify({ text, ...options } satisfies ChatLine));
};

export const reply = (player: Player, text: string): void => {
    chatTo(player, text, { author: "Server" });
};

export const parseNumber = (text: string | undefined): number | undefined => {
    const value: number = text === undefined ? NaN : Number(text);
    return Number.isFinite(value) ? value : undefined;
};

// A form ID as players type it, hex with or without "0x": "1F66A" or "0x1F66A". Undefined for anything else.
export const parseForm = (text: string | undefined): number | undefined => (text !== undefined && /^(0x)?[0-9a-f]{1,8}$/i.test(text) ? parseInt(text.replace(/^0x/i, ""), 16) : undefined);

export const formatForm = (form: number): string => form.toString(16).toUpperCase().padStart(8, "0");

export const formatPoint = (point: Point): string => `(${point.x.toFixed(0)}, ${point.y.toFixed(0)}, ${point.z.toFixed(0)})`;
