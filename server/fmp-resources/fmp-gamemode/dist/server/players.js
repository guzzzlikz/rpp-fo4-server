"use strict";
// Finding a player from what someone typed, for the commands that name one.
Object.defineProperty(exports, "__esModule", { value: true });
exports.findPlayer = void 0;
const accounts_1 = require("./accounts");
const chat_1 = require("./chat");
// A player as typed: their id, or a part of their character name that only one of them has.
const findPlayer = (sender, query) => {
    if (query === undefined || query === "") {
        return null;
    }
    const players = (0, accounts_1.loggedInPlayers)();
    const id = (0, chat_1.parseNumber)(query);
    const byId = id === undefined ? undefined : players.find((player) => player.id === id);
    if (byId !== undefined) {
        return byId;
    }
    const wanted = query.toLowerCase();
    const matches = players.filter((player) => (0, accounts_1.characterName)(player).toLowerCase().includes(wanted));
    if (matches.length !== 1) {
        (0, chat_1.reply)(sender, matches.length === 0 ? `Nobody called ${query}` : `${matches.length} people match ${query}: be more precise`);
        return null;
    }
    return matches[0] ?? null;
};
exports.findPlayer = findPlayer;
