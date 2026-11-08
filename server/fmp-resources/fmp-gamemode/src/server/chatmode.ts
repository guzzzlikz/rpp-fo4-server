// Which chat box players use: the gamemode's own (ui/chat, takes Cyrillic) or FMP's native one, as a
// way back should ours misbehave. Switched from the server console, kept in chat-settings.json beside
// package.json, and applied to every client at once:
//   chatmode            shows the current one
//   chatmode native     FMP's box for everyone
//   chatmode custom     the gamemode's box for everyone

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { ChatEvents, type ChatMode, type ChatModeName } from "../shared/chat";

const kSettingsFile: string = join(__dirname, "..", "..", "chat-settings.json");

const load = (): ChatModeName => {
    try {
        const parsed: unknown = JSON.parse(readFileSync(kSettingsFile, "utf8"));
        return typeof parsed === "object" && parsed !== null && (parsed as Record<string, unknown>)["mode"] === "native" ? "native" : "custom";
    } catch {
        return "custom";
    }
};

let mode: ChatModeName = load();
console.log(`chat box: ${mode}`);

const payload = (): string => JSON.stringify({ mode } satisfies ChatMode);

Events.onClient(ChatEvents.hello, (sender: unknown): void => {
    (sender as Player).emit(ChatEvents.mode, payload());
});

Events.on("consoleCommand", (command: string, args: string[]): void => {
    if (command !== "chatmode") {
        return;
    }
    const wanted: string | undefined = args[0]?.toLowerCase();
    if (wanted !== "native" && wanted !== "custom") {
        console.log(`chat box: ${mode}. chatmode native | custom`);
        return;
    }
    mode = wanted;
    try {
        writeFileSync(kSettingsFile, `${JSON.stringify({ mode }, null, 2)}\n`, "utf8");
    } catch (thrown: unknown) {
        console.error(`chat-settings.json could not be written: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
    }
    Events.emitAllClients(ChatEvents.mode, payload());
    console.log(`chat box is now ${mode} for everyone`);
});
