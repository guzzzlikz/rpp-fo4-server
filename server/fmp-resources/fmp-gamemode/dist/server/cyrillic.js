"use strict";
// Cyrillic and FMP's native chat box. The box lives in FMP's client and cannot be changed from here;
// what can be done from the server:
//   - Diagnosis: a chat line with anything but plain ASCII in it, or with "?" where letters were
//     typed, is logged with its code points. That shows whether Cyrillic reaches the server at all
//     (then only the box's font is missing it) or the box's input drops it on the player's side.
//   - Transliteration: with "chattranslit on" in the server console, every chat line the gamemode
//     sends has its Cyrillic spelled in Latin ("Привет" -> "Privet"), for a box that receives the
//     text but cannot draw it. Off by default; kept in cyrillic-settings.json beside package.json.
Object.defineProperty(exports, "__esModule", { value: true });
exports.forChat = exports.transliterate = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const kSettingsFile = (0, node_path_1.join)(__dirname, "..", "..", "cyrillic-settings.json");
const kLatin = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ъ: "", ы: "y", ь: "'", э: "e", ю: "yu", я: "ya",
    // Ukrainian and Belarusian letters players may type too.
    і: "i", ї: "yi", є: "ye", ґ: "g", ў: "u",
};
const latinFor = (letter) => {
    const lower = letter.toLowerCase();
    const latin = kLatin[lower];
    if (latin === undefined || lower === letter || latin === "") {
        return latin;
    }
    // Capital: capitalise the first Latin letter ("Щ" -> "Shch").
    return latin.charAt(0).toUpperCase() + latin.slice(1);
};
const transliterate = (text) => [...text].map((letter) => latinFor(letter) ?? letter).join("");
exports.transliterate = transliterate;
const load = () => {
    try {
        const parsed = JSON.parse((0, node_fs_1.readFileSync)(kSettingsFile, "utf8"));
        return typeof parsed === "object" && parsed !== null && parsed["translit"] === true;
    }
    catch {
        return false;
    }
};
let translit = load();
console.log(`chat transliteration: ${translit ? "on" : "off"}`);
// Every chat line the gamemode sends goes through here.
const forChat = (text) => (translit ? (0, exports.transliterate)(text) : text);
exports.forChat = forChat;
// --- diagnosis -------------------------------------------------------------------------------------
const codePoints = (text) => [...text]
    .filter((letter) => (letter.codePointAt(0) ?? 0) > 0x7e || letter === "?")
    .slice(0, 12)
    .map((letter) => `U+${(letter.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0")}`)
    .join(" ");
const diagnose = (player, kind, text) => {
    if (/[^\x20-\x7e]|\?/.test(text)) {
        console.log(`chat check: ${kind} from ${player.nickname}: ${JSON.stringify(text)} [${codePoints(text)}]`);
    }
};
Events.on("playerChat", (player, text) => {
    diagnose(player, "line", text);
});
Events.on("playerCommand", (player, command, args) => {
    diagnose(player, `/${command}`, args.join(" "));
});
Events.on("consoleCommand", (command, args) => {
    if (command !== "chattranslit") {
        return;
    }
    const wanted = args[0]?.toLowerCase();
    if (wanted !== "on" && wanted !== "off") {
        console.log(`chat transliteration: ${translit ? "on" : "off"}. chattranslit on | off`);
        return;
    }
    translit = wanted === "on";
    try {
        (0, node_fs_1.writeFileSync)(kSettingsFile, `${JSON.stringify({ translit }, null, 2)}\n`, "utf8");
    }
    catch (thrown) {
        console.error(`cyrillic-settings.json could not be written: ${thrown instanceof Error ? thrown.message : String(thrown)}`);
    }
    console.log(`chat transliteration is now ${translit ? "on" : "off"}`);
});
