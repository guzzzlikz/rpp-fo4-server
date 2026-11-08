// Cyrillic and FMP's native chat box. The box lives in FMP's client and cannot be changed from here;
// what can be done from the server:
//   - Diagnosis: a chat line with anything but plain ASCII in it, or with "?" where letters were
//     typed, is logged with its code points. That shows whether Cyrillic reaches the server at all
//     (then only the box's font is missing it) or the box's input drops it on the player's side.
//   - Transliteration: with "chattranslit on" in the server console, every chat line the gamemode
//     sends has its Cyrillic spelled in Latin ("Привет" -> "Privet"), for a box that receives the
//     text but cannot draw it. Off by default; kept in cyrillic-settings.json beside package.json.

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const kSettingsFile: string = join(__dirname, "..", "..", "cyrillic-settings.json");

const kLatin: Readonly<Record<string, string>> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ъ: "", ы: "y", ь: "'", э: "e", ю: "yu", я: "ya",
    // Ukrainian and Belarusian letters players may type too.
    і: "i", ї: "yi", є: "ye", ґ: "g", ў: "u",
};

const latinFor = (letter: string): string | undefined => {
    const lower: string = letter.toLowerCase();
    const latin: string | undefined = kLatin[lower];
    if (latin === undefined || lower === letter || latin === "") {
        return latin;
    }
    // Capital: capitalise the first Latin letter ("Щ" -> "Shch").
    return latin.charAt(0).toUpperCase() + latin.slice(1);
};

export const transliterate = (text: string): string => [...text].map((letter: string): string => latinFor(letter) ?? letter).join("");

const load = (): boolean => {
    try {
        const parsed: unknown = JSON.parse(readFileSync(kSettingsFile, "utf8"));
        return typeof parsed === "object" && parsed !== null && (parsed as Record<string, unknown>)["translit"] === true;
    } catch {
        return false;
    }
};

let translit: boolean = load();
console.log(`chat transliteration: ${translit ? "on" : "off"}`);

// Every chat line the gamemode sends goes through here.
export const forChat = (text: string): string => (translit ? transliterate(text) : text);

// --- diagnosis -------------------------------------------------------------------------------------

const codePoints = (text: string): string =>
    [...text]
        .filter((letter: string): boolean => (letter.codePointAt(0) ?? 0) > 0x7e || letter === "?")
        .slice(0, 12)
        .map((letter: string): string => `U+${(letter.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`)
        .join(" ");

const diagnose = (player: Player, kind: string, text: string): void => {
    if (/[^\x20-\x7e]|\?/.test(text)) {
        console.log(`chat check: ${kind} from ${player.nickname}: ${JSON.stringify(text)} [${codePoints(text)}]`);
    }
};

Events.on("playerChat", (player: Player, text: string): void => {
    diagnose(player, "line", text);
});

Events.on("playerCommand", (player: Player, command: string, args: string[]): void => {
    diagnose(player, `/${command}`, args.join(" "));
});

Events.on("consoleCommand", (command: string, args: string[]): void => {
    if (command !== "chattranslit") {
        return;
    }
    const wanted: string | undefined = args[0]?.toLowerCase();
    if (wanted !== "on" && wanted !== "off") {
        console.log(`chat transliteration: ${translit ? "on" : "off"}. chattranslit on | off`);
        return;
    }
    translit = wanted === "on";
    try {
        writeFileSync(kSettingsFile, `${JSON.stringify({ translit }, null, 2)}\n`, "utf8");
    } catch (thrown: unknown) {
        console.error(`cyrillic-settings.json could not be written: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
    }
    console.log(`chat transliteration is now ${translit ? "on" : "off"}`);
});
