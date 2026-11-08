"use strict";
// What the default gamemode does with explosives: it lets every blast, hazard and mine through and
// logs them. A gamemode with rules returns false from these handlers to refuse.
Object.defineProperty(exports, "__esModule", { value: true });
const chat_1 = require("./chat");
const ownerOf = (mine) => mine.getOwner()?.nickname ?? "?";
Events.on("playerExplosion", (player, position, explosion, npc) => {
    const by = npc !== null ? `NPC ${npc} (run by ${player.nickname})` : player.nickname;
    console.log(`${by} set off ${(0, chat_1.formatForm)(explosion)} at ${(0, chat_1.formatPoint)(position)}`);
});
Events.on("playerHit", (attacker, victim, damage, kind) => {
    if (kind !== "direct") {
        console.log(`${attacker.nickname}'s ${kind} reached ${victim.nickname}${kind === "blast" ? ` for ${damage.toFixed(1)}` : ""}`);
    }
});
Events.on("playerReload", (player, event) => {
    console.log(`${player.nickname} reloads (${event})`);
});
Events.on("mineLaid", (mine) => {
    console.log(`${ownerOf(mine)} laid a mine`);
});
Events.on("mineTrigger", (mine, player) => {
    console.log(`${player.nickname} walked onto ${ownerOf(mine)}'s mine`);
});
Events.on("mineRemove", (mine) => {
    console.log(`${ownerOf(mine)}'s mine is gone`);
});
