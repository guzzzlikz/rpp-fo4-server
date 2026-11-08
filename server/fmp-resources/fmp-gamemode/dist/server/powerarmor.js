"use strict";
// What the default gamemode does with power armor: anyone may get in and out, and it is logged.
Object.defineProperty(exports, "__esModule", { value: true });
const chat_1 = require("./chat");
Events.on("playerPowerArmor", (player, entered) => {
    const armor = player.getPowerArmor();
    const frame = armor === null ? "" : ` (frame ${armor.frame !== null && armor.frame !== undefined ? (0, chat_1.formatForm)(armor.frame) : "placed at runtime"})`;
    console.log(`${player.nickname} got ${entered ? "into" : "out of"} power armor${frame}`);
});
// Fusion cores: logged as the suit takes them in or launches one out.
Events.on("playerFusionCore", (player, kind, core, condition) => {
    const what = core === null ? "its core" : `${(0, chat_1.formatForm)(core)} at ${condition}%`;
    console.log(`${player.nickname}'s power armor ${kind} ${what}`);
});
