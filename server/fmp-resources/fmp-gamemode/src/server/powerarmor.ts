// What the default gamemode does with power armor: anyone may get in and out, and it is logged.

import { formatForm } from "./chat";

Events.on("playerPowerArmor", (player: Player, entered: boolean): void => {
    const armor: PlayerPowerArmor | null = player.getPowerArmor();
    const frame: string = armor === null ? "" : ` (frame ${armor.frame !== null && armor.frame !== undefined ? formatForm(armor.frame) : "placed at runtime"})`;
    console.log(`${player.nickname} got ${entered ? "into" : "out of"} power armor${frame}`);
});

// Fusion cores: logged as the suit takes them in or launches one out.
Events.on("playerFusionCore", (player: Player, kind: "consumed" | "inserted" | "ejected", core: number | null, condition: number): void => {
    const what: string = core === null ? "its core" : `${formatForm(core)} at ${condition}%`;
    console.log(`${player.nickname}'s power armor ${kind} ${what}`);
});
