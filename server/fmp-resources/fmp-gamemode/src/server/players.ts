// Finding a player from what someone typed, for the commands that name one.

import { characterName, loggedInPlayers } from "./accounts";
import { parseNumber, reply } from "./chat";

// A player as typed: their id, or a part of their character name that only one of them has.
export const findPlayer = (sender: Player, query: string | undefined): Player | null => {
    if (query === undefined || query === "") {
        return null;
    }
    const players: Player[] = loggedInPlayers();
    const id = parseNumber(query);
    const byId: Player | undefined = id === undefined ? undefined : players.find((player: Player): boolean => player.id === id);
    if (byId !== undefined) {
        return byId;
    }
    const wanted: string = query.toLowerCase();
    const matches: Player[] = players.filter((player: Player): boolean => characterName(player).toLowerCase().includes(wanted));
    if (matches.length !== 1) {
        reply(sender, matches.length === 0 ? `Nobody called ${query}` : `${matches.length} people match ${query}: be more precise`);
        return null;
    }
    return matches[0] ?? null;
};
