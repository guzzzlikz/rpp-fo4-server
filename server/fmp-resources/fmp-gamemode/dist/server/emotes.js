"use strict";
// Emotes: one of the game's own idle animations played on the player, which everyone around them sees
// (Player.playIdle). FMP does not sync most animations between players; an idle the server plays is
// the one kind every client is told to play.
//
// Players pick them from the wheel (key P, src/client/emotes.ts) or with "/emote <name>". The list
// lives in emotes.json beside package.json. Staff grow it from the game, no build and no reload:
//   /emote test           plays the next untested candidate from "_candidates" (guessed editor IDs)
//   /emote try <ID>       plays any editor ID
//   /emote add <name> <ID> <label...>   puts it on the wheel and writes emotes.json
//   /emote remove <name>
// A server with the game's data refuses an editor ID no IDLE record has, so a guess costs one command.
// An idle's own conditions apply: sitting ones want furniture and do nothing without it.
Object.defineProperty(exports, "__esModule", { value: true });
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const emotes_1 = require("../shared/emotes");
const accounts_1 = require("./accounts");
const chat_1 = require("./chat");
// From dist/server back to the resource folder.
const kEmotesFile = (0, node_path_1.join)(__dirname, "..", "..", "emotes.json");
const kEmoteName = /^[a-z0-9_-]{1,24}$/;
const kEditorId = /^[A-Za-z0-9_]{1,64}$/;
const kCandidatesKey = "_candidates";
const kComment = "Эмоции для колеса (клавиша P) и /emote. Имя -> { idle: EditorID анимации из Fallout4.esm, label: подпись }. Добавлять из игры: /emote test, /emote add <имя> <EditorID> <подпись>. Подробно: docs/resources/fmp-gamemode.md";
// One emote per player this often at most: the wheel can be clicked fast.
const kCooldownMs = 800;
const emotes = new Map();
// Guessed editor IDs nobody has confirmed yet, in the order /emote test walks them.
let candidates = [];
const describe = (thrown) => (thrown instanceof Error ? thrown.message : String(thrown));
// An entry is { "idle": "<EditorID>", "label": "<shown>" }, or just "<EditorID>".
const load = () => {
    emotes.clear();
    candidates = [];
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(kEmotesFile, "utf8"));
        if (typeof parsed !== "object" || parsed === null) {
            throw new Error("not a JSON object");
        }
        for (const [name, value] of Object.entries(parsed)) {
            if (name.startsWith("//")) {
                continue;
            }
            if (name === kCandidatesKey) {
                candidates = Array.isArray(value) ? value.filter((id) => typeof id === "string" && kEditorId.test(id)) : [];
                continue;
            }
            const key = name.toLowerCase();
            const fields = typeof value === "object" && value !== null ? value : { idle: value };
            const idle = fields["idle"];
            const label = fields["label"];
            if (!kEmoteName.test(key) || typeof idle !== "string" || !kEditorId.test(idle.trim())) {
                console.warn(`emotes.json: skipped "${name}": a name is 1-24 of a-z 0-9 _ -, with an "idle" editor ID`);
                continue;
            }
            emotes.set(key, { idle: idle.trim(), label: typeof label === "string" && label.trim() !== "" ? label.trim() : key });
        }
    }
    catch (thrown) {
        console.error(`emotes.json could not be read (${describe(thrown)}); there are no emotes`);
    }
    console.log(`${emotes.size} emote(s): ${[...emotes.keys()].join(", ") || "none"}; ${candidates.length} candidate(s) to test`);
};
const save = () => {
    const document = { "//": kComment };
    for (const [name, emote] of emotes) {
        document[name] = { idle: emote.idle, label: emote.label };
    }
    document[kCandidatesKey] = candidates;
    (0, node_fs_1.writeFileSync)(kEmotesFile, `${JSON.stringify(document, null, 2)}\n`, "utf8");
};
const entries = () => [...emotes.entries()].map(([name, emote]) => ({ name, label: emote.label }));
const sendList = (player) => {
    player.emit(emotes_1.EmoteEvents.list, JSON.stringify({ emotes: entries() }));
};
// Every wheel follows a change at once.
const broadcastList = () => {
    Events.emitAllClients(emotes_1.EmoteEvents.list, JSON.stringify({ emotes: entries() }));
};
load();
const lastPlayed = new Map();
// Admin player id -> the next candidate /emote test plays.
const testCursor = new Map();
const list = () => (emotes.size === 0 ? "Эмоций пока нет." : `Эмоции: ${[...emotes.keys()].join(", ")}. Колесо: клавиша P.`);
// Plays `idle` on the player. "refused": the server has no such idle; "blocked": they are down or
// clicking too fast. The player is told why it did not play.
const play = (player, idle, cooldown = true) => {
    if (player.isDead) {
        (0, chat_1.reply)(player, "Нельзя, пока вы без сознания.");
        return "blocked";
    }
    const now = Date.now();
    if (cooldown && now - (lastPlayed.get(player.id) ?? 0) < kCooldownMs) {
        return "blocked";
    }
    lastPlayed.set(player.id, now);
    try {
        player.playIdle(idle);
        return "played";
    }
    catch (thrown) {
        console.warn(`${(0, accounts_1.accountName)(player)}: idle ${idle} refused: ${describe(thrown)}`);
        return "refused";
    }
};
const playEmote = (player, name) => {
    const emote = emotes.get(name);
    if (emote === undefined) {
        (0, chat_1.reply)(player, `Нет эмоции «${name}». ${list()}`);
        return;
    }
    if (play(player, emote.idle) === "refused") {
        (0, chat_1.reply)(player, `Анимация ${emote.idle} недоступна на этом сервере.`);
    }
};
const isStaff = (player) => (0, accounts_1.adminLevel)(player) >= chat_1.AdminLevel.admin;
// "/emote try <EditorID>": any idle by its editor ID.
const tryIdle = (player, idle) => {
    if (idle === undefined || !kEditorId.test(idle)) {
        (0, chat_1.reply)(player, "/emote try <EditorID>: проверить анимацию по EditorID");
        return;
    }
    const result = play(player, idle, false);
    if (result === "played") {
        console.log(`${(0, accounts_1.accountName)(player)} tried idle ${idle}`);
        (0, chat_1.reply)(player, `${idle}: отправлено. Видно позу? Добавить: /emote add <имя> ${idle} <подпись>`);
    }
    else if (result === "refused") {
        (0, chat_1.reply)(player, `${idle}: такой анимации нет.`);
    }
};
// "/emote test [n]": the next candidate (or number n), so staff can walk the list in a row.
const testNext = (player, at) => {
    if (candidates.length === 0) {
        (0, chat_1.reply)(player, "Кандидатов не осталось. Ищите EditorID в FO4Edit и проверяйте через /emote try.");
        return;
    }
    const wanted = at !== undefined && /^\d+$/.test(at) ? Number(at) - 1 : (testCursor.get(player.id) ?? 0);
    const index = ((wanted % candidates.length) + candidates.length) % candidates.length;
    const idle = candidates[index] ?? "";
    testCursor.set(player.id, index + 1);
    const result = play(player, idle, false);
    const position = `${index + 1}/${candidates.length}`;
    if (result === "played") {
        console.log(`${(0, accounts_1.accountName)(player)} tested candidate ${position} ${idle}: sent`);
        (0, chat_1.reply)(player, `Кандидат ${position}: ${idle}, отправлено. Видно позу? /emote add <имя> ${idle} <подпись>. Дальше: /emote test`);
    }
    else if (result === "refused") {
        console.log(`${(0, accounts_1.accountName)(player)} tested candidate ${position} ${idle}: no such idle`);
        (0, chat_1.reply)(player, `Кандидат ${position}: ${idle}, такой анимации нет. Дальше: /emote test`);
    }
};
// "/emote add <name> <EditorID> <label...>": puts it on the wheel and writes emotes.json.
const add = (player, args) => {
    const [rawName, idle, ...labelWords] = args;
    const name = (rawName ?? "").toLowerCase();
    const label = labelWords.join(" ").trim();
    if (!kEmoteName.test(name) || idle === undefined || !kEditorId.test(idle) || label === "") {
        (0, chat_1.reply)(player, "/emote add <имя> <EditorID> <подпись>: имя из a-z 0-9 _ -, например /emote add salute Salute Отдать честь");
        return;
    }
    if (["list", "stop", "try", "test", "add", "remove"].includes(name)) {
        (0, chat_1.reply)(player, `Имя «${name}» занято командой, выберите другое.`);
        return;
    }
    // Checked by playing it: a server with the game's data refuses an editor ID it does not have.
    if (play(player, idle, false) === "refused") {
        (0, chat_1.reply)(player, `${idle}: такой анимации нет, не добавлено.`);
        return;
    }
    const replaced = emotes.has(name);
    emotes.set(name, { idle, label });
    candidates = candidates.filter((candidate) => candidate !== idle);
    try {
        save();
    }
    catch (thrown) {
        console.error(`emotes.json could not be written: ${describe(thrown)}`);
        (0, chat_1.reply)(player, "Добавлено до перезапуска, но emotes.json записать не удалось: смотрите лог сервера.");
    }
    console.log(`${(0, accounts_1.accountName)(player)} ${replaced ? "changed" : "added"} emote ${name} = ${idle} "${label}"`);
    (0, chat_1.reply)(player, `Эмоция «${label}» (${name} = ${idle}) ${replaced ? "обновлена" : "добавлена"} в колесо.`);
    broadcastList();
};
// "/emote remove <name>".
const remove = (player, rawName) => {
    const name = (rawName ?? "").toLowerCase();
    if (!emotes.delete(name)) {
        (0, chat_1.reply)(player, `Нет эмоции «${name}». ${list()}`);
        return;
    }
    try {
        save();
    }
    catch (thrown) {
        console.error(`emotes.json could not be written: ${describe(thrown)}`);
    }
    console.log(`${(0, accounts_1.accountName)(player)} removed emote ${name}`);
    (0, chat_1.reply)(player, `Эмоция ${name} убрана из колеса.`);
    broadcastList();
};
const kStaffCommands = {
    try: (player, args) => tryIdle(player, args[0]),
    test: (player, args) => testNext(player, args[0]),
    add,
    remove: (player, args) => remove(player, args[0]),
};
(0, chat_1.registerCommands)(chat_1.AdminLevel.player, {
    // "/emote": the list. "/emote <name>": plays it. "/emote stop": back to the stance.
    // Staff: "/emote try|test|add|remove ...".
    emote: (player, args) => {
        const [first, ...rest] = args;
        const name = (first ?? "").toLowerCase();
        const staff = kStaffCommands[name];
        if (name === "" || name === "list") {
            (0, chat_1.reply)(player, list());
        }
        else if (name === "stop") {
            player.stopIdle();
        }
        else if (staff !== undefined) {
            if (isStaff(player)) {
                staff(player, rest);
            }
            else {
                (0, chat_1.reply)(player, `/emote ${name} только для администрации.`);
            }
        }
        else {
            playEmote(player, name);
        }
    },
});
// --- the wheel ------------------------------------------------------------------------------------
Events.onClient(emotes_1.EmoteEvents.list, (sender) => {
    sendList(sender);
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
    testCursor.delete(player.id);
});
