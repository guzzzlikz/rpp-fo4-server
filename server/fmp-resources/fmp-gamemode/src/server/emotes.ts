// Emotes: one of the game's own idle animations played on the player, which everyone around them sees
// (Player.playIdle). FMP does not sync most animations between players; an idle the server plays is
// the one kind every client is told to play.
//
// Players pick them from the wheel (key P, src/client/emotes.ts) or with "/emote <name>". The list
// lives in emotes.json beside package.json, so it grows without a build: add an entry, then
// `ensure fmp-gamemode`. "/emote try <EditorID>" (admin) tests an ID in the game first. An idle's own
// conditions apply: sitting ones want furniture and do nothing without it.

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { type EmoteEntry, EmoteEvents, type EmoteList, readEmotePlay } from "../shared/emotes";
import { accountName, adminLevel, isLoggedIn } from "./accounts";
import { AdminLevel, registerCommands, reply } from "./chat";

// From dist/server back to the resource folder.
const kEmotesFile: string = join(__dirname, "..", "..", "emotes.json");
const kEmoteName = /^[a-z0-9_-]{1,24}$/;
// One emote per player this often at most: the wheel can be clicked fast.
const kCooldownMs = 800;

interface Emote {
    idle: string;
    label: string;
}

// An entry is { "idle": "<EditorID>", "label": "<shown>" }, or just "<EditorID>".
const loadEmotes = (): Map<string, Emote> => {
    const emotes = new Map<string, Emote>();
    try {
        const parsed: unknown = JSON.parse(readFileSync(kEmotesFile, "utf8"));
        if (typeof parsed !== "object" || parsed === null) {
            throw new Error("not a JSON object");
        }
        for (const [name, value] of Object.entries(parsed as Record<string, unknown>)) {
            if (name.startsWith("//")) {
                continue;
            }
            const key: string = name.toLowerCase();
            const fields: Record<string, unknown> = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : { idle: value };
            const idle: unknown = fields["idle"];
            const label: unknown = fields["label"];
            if (!kEmoteName.test(key) || typeof idle !== "string" || idle.trim() === "") {
                console.warn(`emotes.json: skipped "${name}": a name is 1-24 of a-z 0-9 _ -, with an "idle" editor ID`);
                continue;
            }
            emotes.set(key, { idle: idle.trim(), label: typeof label === "string" && label.trim() !== "" ? label.trim() : key });
        }
    } catch (thrown: unknown) {
        console.error(`emotes.json could not be read (${thrown instanceof Error ? thrown.message : String(thrown)}); there are no emotes`);
    }
    console.log(`${emotes.size} emote(s): ${[...emotes.keys()].join(", ") || "none"}`);
    return emotes;
};

const emotes: Map<string, Emote> = loadEmotes();
const lastPlayed = new Map<number, number>();

const list = (): string => (emotes.size === 0 ? "Эмоций пока нет." : `Эмоции: ${[...emotes.keys()].join(", ")}. Колесо: клавиша P.`);

// Plays `idle` on the player. False, with the reason told to them, when it cannot.
const play = (player: Player, idle: string): boolean => {
    if (player.isDead) {
        reply(player, "Нельзя, пока вы без сознания.");
        return false;
    }
    const now: number = Date.now();
    if (now - (lastPlayed.get(player.id) ?? 0) < kCooldownMs) {
        return false;
    }
    lastPlayed.set(player.id, now);
    try {
        player.playIdle(idle);
        return true;
    } catch (thrown: unknown) {
        console.warn(`${accountName(player)}: idle ${idle} refused: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
        reply(player, `Анимация ${idle} недоступна на этом сервере.`);
        return false;
    }
};

const playEmote = (player: Player, name: string): void => {
    const emote: Emote | undefined = emotes.get(name);
    if (emote === undefined) {
        reply(player, `Нет эмоции «${name}». ${list()}`);
        return;
    }
    play(player, emote.idle);
};

// "/emote try <EditorID>": admins test an idle by its editor ID before it goes into emotes.json.
const tryIdle = (player: Player, idle: string | undefined): void => {
    if (adminLevel(player) < AdminLevel.admin) {
        reply(player, "/emote try только для администрации.");
        return;
    }
    if (idle === undefined || idle === "") {
        reply(player, "/emote try <EditorID>: проверить анимацию по EditorID");
        return;
    }
    if (play(player, idle)) {
        console.log(`${accountName(player)} tried idle ${idle}`);
        reply(player, `Отправлено: ${idle}. Если поза видна, добавьте её в emotes.json.`);
    }
};

registerCommands(AdminLevel.player, {
    // "/emote": the list. "/emote <name>": plays it. "/emote stop": back to the stance.
    emote: (player: Player, args: string[]): void => {
        const name: string = (args[0] ?? "").toLowerCase();
        if (name === "" || name === "list") {
            reply(player, list());
        } else if (name === "stop") {
            player.stopIdle();
        } else if (name === "try") {
            tryIdle(player, args[1]);
        } else {
            playEmote(player, name);
        }
    },
});

// --- the wheel ------------------------------------------------------------------------------------

Events.onClient(EmoteEvents.list, (sender: unknown): void => {
    const player = sender as Player;
    const entries: EmoteEntry[] = [...emotes.entries()].map(([name, emote]: [string, Emote]): EmoteEntry => ({ name, label: emote.label }));
    player.emit(EmoteEvents.list, JSON.stringify({ emotes: entries } satisfies EmoteList));
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
});
