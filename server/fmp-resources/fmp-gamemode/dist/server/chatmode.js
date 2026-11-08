"use strict";
// Which chat box players use: the gamemode's own (ui/chat, takes Cyrillic) or FMP's native one, as a
// way back should ours misbehave. Switched from the server console, kept in chat-settings.json beside
// package.json, and applied to every client at once:
//   chatmode            shows the current one
//   chatmode native     FMP's box for everyone
//   chatmode custom     the gamemode's box for everyone
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const chat_1 = require("../shared/chat");
const kSettingsFile = (0, node_path_1.join)(__dirname, "..", "..", "chat-settings.json");
const load = () => {
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(kSettingsFile, "utf8"));
        return typeof parsed === "object" && parsed !== null && parsed["mode"] === "native" ? "native" : "custom";
    }
    catch {
        return "custom";
    }
};
let mode = load();
console.log(`chat box: ${mode}`);
const payload = () => JSON.stringify({ mode });
Events.onClient(chat_1.ChatEvents.hello, (sender) => {
    sender.emit(chat_1.ChatEvents.mode, payload());
});
Events.on("consoleCommand", (command, args) => {
    if (command !== "chatmode") {
        return;
    }
    const wanted = args[0]?.toLowerCase();
    if (wanted !== "native" && wanted !== "custom") {
        console.log(`chat box: ${mode}. chatmode native | custom`);
        return;
    }
    mode = wanted;
    try {
        (0, node_fs_1.writeFileSync)(kSettingsFile, `${JSON.stringify({ mode }, null, 2)}\n`, "utf8");
    }
    catch (thrown) {
        console.error(`chat-settings.json could not be written: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
    }
    Events.emitAllClients(chat_1.ChatEvents.mode, payload());
    console.log(`chat box is now ${mode} for everyone`);
});
