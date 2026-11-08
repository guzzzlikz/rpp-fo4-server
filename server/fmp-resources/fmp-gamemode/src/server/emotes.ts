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

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { type EmoteEntry, EmoteEvents, type EmoteList, readEmotePlay } from "../shared/emotes";
import { accountName, adminLevel, isLoggedIn } from "./accounts";
import { AdminLevel, registerCommands, reply } from "./chat";

// From dist/server back to the resource folder.
const kEmotesFile: string = join(__dirname, "..", "..", "emotes.json");
const kEmoteName = /^[a-z0-9_-]{1,24}$/;
const kEditorId = /^[A-Za-z0-9_]{1,64}$/;
const kCandidatesKey = "_candidates";
const kComment =
    "Эмоции для колеса (клавиша P) и /emote. Имя -> { idle: EditorID анимации из Fallout4.esm, label: подпись }. Добавлять из игры: /emote test, /emote add <имя> <EditorID> <подпись>. Подробно: docs/resources/fmp-gamemode.md";
// One emote per player this often at most: the wheel can be clicked fast.
const kCooldownMs = 800;

interface Emote {
    idle: string;
    label: string;
}

const emotes = new Map<string, Emote>();
// Guessed editor IDs nobody has confirmed yet, in the order /emote test walks them.
let candidates: string[] = [];

const describe = (thrown: unknown): string => (thrown instanceof Error ? thrown.message : String(thrown));

// An entry is { "idle": "<EditorID>", "label": "<shown>" }, or just "<EditorID>".
const load = (): void => {
    emotes.clear();
    candidates = [];
    try {
        const parsed: unknown = JSON.parse(readFileSync(kEmotesFile, "utf8"));
        if (typeof parsed !== "object" || parsed === null) {
            throw new Error("not a JSON object");
        }
        for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (name.startsWith("//")) {
                continue;
            }
            if (name === kCandidatesKey) {
                candidates = Array.isArray(value) ? value.filter((id: unknown): id is string => typeof id === "string" && kEditorId.test(id)) : [];
                continue;
            }
            const key: string = name.toLowerCase();
            const fields: Record<string, unknown> = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : { idle: value };
            const idle: unknown = fields["idle"];
            const label: unknown = fields["label"];
            if (!kEmoteName.test(key) || typeof idle !== "string" || !kEditorId.test(idle.trim())) {
                console.warn(`emotes.json: skipped "${name}": a name is 1-24 of a-z 0-9 _ -, with an "idle" editor ID`);
                continue;
            }
            emotes.set(key, { idle: idle.trim(), label: typeof label === "string" && label.trim() !== "" ? label.trim() : key });
        }
    } catch (thrown: unknown) {
        console.error(`emotes.json could not be read (${describe(thrown)}); there are no emotes`);
    }
    console.log(`${emotes.size} emote(s): ${[...emotes.keys()].join(", ") || "none"}; ${candidates.length} candidate(s) to test`);
};

const save = (): void => {
    const document: Record<string, unknown> = { "//": kComment };
    for (const [name, emote] of emotes) {
        document[name] = { idle: emote.idle, label: emote.label };
    }
    document[kCandidatesKey] = candidates;
    writeFileSync(kEmotesFile, `${JSON.stringify(document, null, 2)}\n`, "utf8");
};

const entries = (): EmoteEntry[] => [...emotes.entries()].map(([name, emote]: [string, Emote]): EmoteEntry => ({ name, label: emote.label }));

const sendList = (player: Player): void => {
    player.emit(EmoteEvents.list, JSON.stringify({ emotes: entries() } satisfies EmoteList));
};

// Every wheel follows a change at once.
const broadcastList = (): void => {
    Events.emitAllClients(EmoteEvents.list, JSON.stringify({ emotes: entries() } satisfies EmoteList));
};

load();

const lastPlayed = new Map<number, number>();
// Admin player id -> the next candidate /emote test plays.
const testCursor = new Map<number, number>();

const list = (): string => (emotes.size === 0 ? "Эмоций пока нет." : `Эмоции: ${[...emotes.keys()].join(", ")}. Колесо: клавиша P.`);

type PlayResult = "played" | "refused" | "blocked";

// Plays `idle` on the player. "refused": the server has no such idle; "blocked": they are down or
// clicking too fast. The player is told why it did not play.
const play = (player: Player, idle: string, cooldown = true): PlayResult => {
    if (player.isDead) {
        reply(player, "Нельзя, пока вы без сознания.");
        return "blocked";
    }
    const now: number = Date.now();
    if (cooldown && now - (lastPlayed.get(player.id) ?? 0) < kCooldownMs) {
        return "blocked";
    }
    lastPlayed.set(player.id, now);
    try {
        player.playIdle(idle);
        return "played";
    } catch (thrown: unknown) {
        console.warn(`${accountName(player)}: idle ${idle} refused: ${describe(thrown)}`);
        return "refused";
    }
};

const playEmote = (player: Player, name: string): void => {
    const emote: Emote | undefined = emotes.get(name);
    if (emote === undefined) {
        reply(player, `Нет эмоции «${name}». ${list()}`);
        return;
    }
    if (play(player, emote.idle) === "refused") {
        reply(player, `Анимация ${emote.idle} недоступна на этом сервере.`);
    }
};

const isStaff = (player: Player): boolean => adminLevel(player) >= AdminLevel.admin;

// "/emote try <EditorID>": any idle by its editor ID.
const tryIdle = (player: Player, idle: string | undefined): void => {
    if (idle === undefined || !kEditorId.test(idle)) {
        reply(player, "/emote try <EditorID>: проверить анимацию по EditorID");
        return;
    }
    const result: PlayResult = play(player, idle, false);
    if (result === "played") {
        console.log(`${accountName(player)} tried idle ${idle}`);
        reply(player, `${idle}: отправлено. Видно позу? Добавить: /emote add <имя> ${idle} <подпись>`);
    } else if (result === "refused") {
        reply(player, `${idle}: такой анимации нет.`);
    }
};

// "/emote test [n]": the next candidate (or number n), so staff can walk the list in a row.
const testNext = (player: Player, at: string | undefined): void => {
    if (candidates.length === 0) {
        reply(player, "Кандидатов не осталось. Ищите EditorID в FO4Edit и проверяйте через /emote try.");
        return;
    }
    const wanted: number = at !== undefined && /^\d+$/.test(at) ? Number(at) - 1 : (testCursor.get(player.id) ?? 0);
    const index: number = ((wanted % candidates.length) + candidates.length) % candidates.length;
    const idle: string = candidates[index] ?? "";
    testCursor.set(player.id, index + 1);
    const result: PlayResult = play(player, idle, false);
    const position = `${index + 1}/${candidates.length}`;
    if (result === "played") {
        console.log(`${accountName(player)} tested candidate ${position} ${idle}: sent`);
        reply(player, `Кандидат ${position}: ${idle}, отправлено. Видно позу? /emote add <имя> ${idle} <подпись>. Дальше: /emote test`);
    } else if (result === "refused") {
        console.log(`${accountName(player)} tested candidate ${position} ${idle}: no such idle`);
        reply(player, `Кандидат ${position}: ${idle}, такой анимации нет. Дальше: /emote test`);
    }
};

// "/emote add <name> <EditorID> <label...>": puts it on the wheel and writes emotes.json.
const add = (player: Player, args: string[]): void => {
    const [rawName, idle, ...labelWords]: string[] = args;
    const name: string = (rawName ?? "").toLowerCase();
    const label: string = labelWords.join(" ").trim();
    if (!kEmoteName.test(name) || idle === undefined || !kEditorId.test(idle) || label === "") {
        reply(player, "/emote add <имя> <EditorID> <подпись>: имя из a-z 0-9 _ -, например /emote add salute Salute Отдать честь");
        return;
    }
    if (["list", "stop", "try", "test", "add", "remove"].includes(name)) {
        reply(player, `Имя «${name}» занято командой, выберите другое.`);
        return;
    }
    // Checked by playing it: a server with the game's data refuses an editor ID it does not have.
    if (play(player, idle, false) === "refused") {
        reply(player, `${idle}: такой анимации нет, не добавлено.`);
        return;
    }
    const replaced: boolean = emotes.has(name);
    emotes.set(name, { idle, label });
    candidates = candidates.filter((candidate: string): boolean => candidate !== idle);
    try {
        save();
    } catch (thrown: unknown) {
        console.error(`emotes.json could not be written: ${describe(thrown)}`);
        reply(player, "Добавлено до перезапуска, но emotes.json записать не удалось: смотрите лог сервера.");
    }
    console.log(`${accountName(player)} ${replaced ? "changed" : "added"} emote ${name} = ${idle} "${label}"`);
    reply(player, `Эмоция «${label}» (${name} = ${idle}) ${replaced ? "обновлена" : "добавлена"} в колесо.`);
    broadcastList();
};

// "/emote remove <name>".
const remove = (player: Player, rawName: string | undefined): void => {
    const name: string = (rawName ?? "").toLowerCase();
    if (!emotes.delete(name)) {
        reply(player, `Нет эмоции «${name}». ${list()}`);
        return;
    }
    try {
        save();
    } catch (thrown: unknown) {
        console.error(`emotes.json could not be written: ${describe(thrown)}`);
    }
    console.log(`${accountName(player)} removed emote ${name}`);
    reply(player, `Эмоция ${name} убрана из колеса.`);
    broadcastList();
};

const kStaffCommands: Readonly<Record<string, (player: Player, args: string[]) => void>> = {
    try: (player: Player, args: string[]): void => tryIdle(player, args[0]),
    test: (player: Player, args: string[]): void => testNext(player, args[0]),
    add,
    remove: (player: Player, args: string[]): void => remove(player, args[0]),
};

registerCommands(AdminLevel.player, {
    // "/emote": the list. "/emote <name>": plays it. "/emote stop": back to the stance.
    // Staff: "/emote try|test|add|remove ...".
    emote: (player: Player, args: string[]): void => {
        const [first, ...rest]: string[] = args;
        const name: string = (first ?? "").toLowerCase();
        const staff = kStaffCommands[name];
        if (name === "" || name === "list") {
            reply(player, list());
        } else if (name === "stop") {
            player.stopIdle();
        } else if (staff !== undefined) {
            if (isStaff(player)) {
                staff(player, rest);
            } else {
                reply(player, `/emote ${name} только для администрации.`);
            }
        } else {
            playEmote(player, name);
        }
    },
});

// --- the wheel ------------------------------------------------------------------------------------

Events.onClient(EmoteEvents.list, (sender: unknown): void => {
    sendList(sender as Player);
});

Events.onClient(EmoteEvents.play, (sender: unknown, payload: unknown): void => {
    const player = sender as Player;
    if (isLoggedIn(player)) {
        playEmote(player, readEmotePlay(payload).name);
    }
});

Events.onClient(EmoteEvents.stop, (sender: unknown): void => {
    const player = sender as Player;
    if (isLoggedIn(player)) {
        player.stopIdle();
    }
});

Events.on("playerDisconnect", (player: Player): void => {
    lastPlayed.delete(player.id);
    testCursor.delete(player.id);
});
