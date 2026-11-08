"use strict";
// Emotes: one of the game's own idle animations played on the player, which everyone around them sees
// (Player.playIdle). FMP does not sync most animations between players; an idle the server plays is
// the one kind every client is told to play.
//
// Players pick them from the wheel (key P, src/client/emotes.ts) or with "/emote <name>". The list
// lives in emotes.json beside package.json, so it grows without a build: add an entry, then
// `ensure fmp-gamemode`. "/emote try <EditorID>" (admin) tests an ID in the game first. An idle's own
// conditions apply: sitting ones want furniture and do nothing without it.
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const emotes_1 = require("../shared/emotes");
const accounts_1 = require("./accounts");
const chat_1 = require("./chat");
// From dist/server back to the resource folder.
const kEmotesFile = (0, node_path_1.join)(__dirname, "..", "..", "emotes.json");
const kEmoteName = /^[a-z0-9_-]{1,24}$/;
// One emote per player this often at most: the wheel can be clicked fast.
const kCooldownMs = 800;
// An entry is { "idle": "<EditorID>", "label": "<shown>" }, or just "<EditorID>".
const loadEmotes = () => {
    const emotes = new Map();
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(kEmotesFile, "utf8"));
        if (typeof parsed !== "object" || parsed === null) {
            throw new Error("not a JSON object");
        }
        for (const [name, value] of Object.entries(parsed)) {
            if (name.startsWith("//")) {
                continue;
            }
            const key = name.toLowerCase();
            const fields = typeof value === "object" && value !== null ? value : { idle: value };
            const idle = fields["idle"];
            const label = fields["label"];
            if (!kEmoteName.test(key) || typeof idle !== "string" || idle.trim() === "") {
                console.warn(`emotes.json: skipped "${name}": a name is 1-24 of a-z 0-9 _ -, with an "idle" editor ID`);
                continue;
            }
            emotes.set(key, { idle: idle.trim(), label: typeof label === "string" && label.trim() !== "" ? label.trim() : key });
        }
    }
    catch (thrown) {
        console.error(`emotes.json could not be read (${thrown instanceof Error ? thrown.message : String(thrown)}); there are no emotes`);
    }
    console.log(`${emotes.size} emote(s): ${[...emotes.keys()].join(", ") || "none"}`);
    return emotes;
};
const emotes = loadEmotes();
const lastPlayed = new Map();
const list = () => (emotes.size === 0 ? "Эмоций пока нет." : `Эмоции: ${[...emotes.keys()].join(", ")}. Колесо: клавиша P.`);
// Plays `idle` on the player. False, with the reason told to them, when it cannot.
const play = (player, idle) => {
    if (player.isDead) {
        (0, chat_1.reply)(player, "Нельзя, пока вы без сознания.");
        return false;
    }
    const now = Date.now();
    if (now - (lastPlayed.get(player.id) ?? 0) < kCooldownMs) {
        return false;
    }
    lastPlayed.set(player.id, now);
    try {
        player.playIdle(idle);
        return true;
    }
    catch (thrown) {
        console.warn(`${(0, accounts_1.accountName)(player)}: idle ${idle} refused: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
        (0, chat_1.reply)(player, `Анимация ${idle} недоступна на этом сервере.`);
        return false;
    }
};
const playEmote = (player, name) => {
    const emote = emotes.get(name);
    if (emote === undefined) {
        (0, chat_1.reply)(player, `Нет эмоции «${name}». ${list()}`);
        return;
    }
    play(player, emote.idle);
};
// "/emote try <EditorID>": admins test an idle by its editor ID before it goes into emotes.json.
const tryIdle = (player, idle) => {
    if ((0, accounts_1.adminLevel)(player) < chat_1.AdminLevel.admin) {
        (0, chat_1.reply)(player, "/emote try только для администрации.");
        return;
    }
    if (idle === undefined || idle === "") {
        (0, chat_1.reply)(player, "/emote try <EditorID>: проверить анимацию по EditorID");
        return;
    }
    if (play(player, idle)) {
        console.log(`${(0, accounts_1.accountName)(player)} tried idle ${idle}`);
        (0, chat_1.reply)(player, `Отправлено: ${idle}. Если поза видна, добавьте её в emotes.json.`);
    }
};
(0, chat_1.registerCommands)(chat_1.AdminLevel.player, {
    // "/emote": the list. "/emote <name>": plays it. "/emote stop": back to the stance.
    emote: (player, args) => {
        const name = (args[0] ?? "").toLowerCase();
        if (name === "" || name === "list") {
            (0, chat_1.reply)(player, list());
        }
        else if (name === "stop") {
            player.stopIdle();
        }
        else if (name === "try") {
            tryIdle(player, args[1]);
        }
        else {
            playEmote(player, name);
        }
    },
});
// --- the wheel ------------------------------------------------------------------------------------
Events.onClient(emotes_1.EmoteEvents.list, (sender) => {
    const player = sender;
    const entries = [...emotes.entries()].map(([name, emote]) => ({ name, label: emote.label }));
    player.emit(emotes_1.EmoteEvents.list, JSON.stringify({ emotes: entries }));
});
Events.onClient(emotes_1.EmoteEvents.play, (sender, payload) => {
    const player = sender;
    if ((0, accounts_1.isLoggedIn)(player)) {
        playEmote(player, (0, emotes_1.readEmotePlay)(payload).name);
    }
});
Events.onClient(emotes_1.EmoteEvents.stop, (sender) => {
    const player = sender;
    if ((0, accounts_1.isLoggedIn)(player)) {
        player.stopIdle();
    }
});
Events.on("playerDisconnect", (player) => {
    lastPlayed.delete(player.id);
});
