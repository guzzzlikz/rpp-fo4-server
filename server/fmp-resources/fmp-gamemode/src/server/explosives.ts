// What the default gamemode does with explosives: it lets every blast, hazard and mine through and
// logs them. A gamemode with rules returns false from these handlers to refuse.

import { formatForm, formatPoint } from "./chat";

const ownerOf = (mine: Mine): string => mine.getOwner()?.nickname ?? "?";

Events.on("playerExplosion", (player: Player, position: Vector3, explosion: number, npc: number | null): void => {
    const by: string = npc !== null ? `NPC ${npc} (run by ${player.nickname})` : player.nickname;
    console.log(`${by} set off ${formatForm(explosion)} at ${formatPoint(position)}`);
});

Events.on("playerHit", (attacker: Player, victim: Player, damage: number, kind: "direct" | "blast" | "hazard"): void => {
    if (kind !== "direct") {
        console.log(`${attacker.nickname}'s ${kind} reached ${victim.nickname}${kind === "blast" ? ` for ${damage.toFixed(1)}` : ""}`);
    }
});

Events.on("playerReload", (player: Player, event: string): void => {
    console.log(`${player.nickname} reloads (${event})`);
});

Events.on("mineLaid", (mine: Mine): void => {
    console.log(`${ownerOf(mine)} laid a mine`);
});

Events.on("mineTrigger", (mine: Mine, player: Player): void => {
    console.log(`${player.nickname} walked onto ${ownerOf(mine)}'s mine`);
});

Events.on("mineRemove", (mine: Mine): void => {
    console.log(`${ownerOf(mine)}'s mine is gone`);
});
