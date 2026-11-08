"use strict";
// What the gamemode's chat commands share: answering the sender, and reading what they typed.
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPoint = exports.formatForm = exports.parseForm = exports.parseNumber = exports.reply = exports.commandsFor = exports.findCommand = exports.registerCommands = exports.isAdminLevel = exports.kAdminLevelNames = exports.AdminLevel = void 0;
// Staff ranks, lowest first. A command asks for one; a player whose account holds it or a higher one
// may run it.
exports.AdminLevel = {
    player: 0,
    moderator: 1,
    admin: 2,
    owner: 3,
};
exports.kAdminLevelNames = { 0: "player", 1: "moderator", 2: "admin", 3: "owner" };
const isAdminLevel = (value) => Object.hasOwn(exports.kAdminLevelNames, value);
exports.isAdminLevel = isAdminLevel;
// Every "/command" of the gamemode, by name without the slash; index.ts dispatches to them.
const commands = new Map();
const registerCommands = (level, handlers) => {
    for (const [name, run] of Object.entries(handlers)) {
        commands.set(name, { name, level, run });
    }
};
exports.registerCommands = registerCommands;
const findCommand = (name) => commands.get(name);
exports.findCommand = findCommand;
// The commands a rank may run, by name.
const commandsFor = (level) => [...commands.values()].filter((command) => command.level <= level).sort((a, b) => a.name.localeCompare(b.name));
exports.commandsFor = commandsFor;
const reply = (player, text) => {
    Chat.sendToPlayer(player, text, { author: "Server" });
};
exports.reply = reply;
const parseNumber = (text) => {
    const value = text === undefined ? NaN : Number(text);
    return Number.isFinite(value) ? value : undefined;
};
exports.parseNumber = parseNumber;
// A form ID as players type it, hex with or without "0x": "1F66A" or "0x1F66A". Undefined for anything else.
const parseForm = (text) => (text !== undefined && /^(0x)?[0-9a-f]{1,8}$/i.test(text) ? parseInt(text.replace(/^0x/i, ""), 16) : undefined);
exports.parseForm = parseForm;
const formatForm = (form) => form.toString(16).toUpperCase().padStart(8, "0");
exports.formatForm = formatForm;
const formatPoint = (point) => `(${point.x.toFixed(0)}, ${point.y.toFixed(0)}, ${point.z.toFixed(0)})`;
exports.formatPoint = formatPoint;
