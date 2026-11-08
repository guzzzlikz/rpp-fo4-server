"use strict";
// The login conversation, compiled into both halves so they agree on it by construction. Nothing here
// touches a scripting global: the server and the client each load this as it is.
//
//   client -> server  hello       the client is in the world and its login page can show
//                     submit      AuthSubmit
//                     cut         after done: the login camera and page are gone, under black
//                     menuClosed  CreatorMenuClosed: a creator step's game menu closed
//   server -> client  prompt      AuthPrompt
//                     done        AuthDone
//                     placed      after cut: the player stands where they play; bring the screen back
Object.defineProperty(exports, "__esModule", { value: true });
exports.readAuthSubmit = exports.characterNameError = exports.normalizeCharacterName = exports.isUsableUsername = exports.usernameError = exports.kDefaultNickname = exports.kUsernameMax = exports.kUsernameMin = exports.kMaxAttempts = exports.kPasswordMax = exports.kPasswordMin = exports.isCreatorMenu = exports.CreatorMenus = exports.AuthEvents = void 0;
exports.AuthEvents = {
    hello: "rp:auth:hello",
    submit: "rp:auth:submit",
    prompt: "rp:auth:prompt",
    done: "rp:auth:done",
    cut: "rp:auth:cut",
    placed: "rp:auth:placed",
    menuClosed: "rp:auth:menuClosed",
};
// The game menus the character creator walks through, by their registered names: the look editor,
// then for a new character the SPECIAL menu the Vault 111 exit opens.
exports.CreatorMenus = {
    look: "LooksMenu",
    special: "SPECIALMenu",
};
const isCreatorMenu = (name) => name === exports.CreatorMenus.look || name === exports.CreatorMenus.special;
exports.isCreatorMenu = isCreatorMenu;
exports.kPasswordMin = 6;
exports.kPasswordMax = 128;
exports.kMaxAttempts = 5;
// A username: what the account is called, what staff rank it by ("setadmin <username> owner") and what
// out-of-character chat shows. Letters, digits and underscores; unique regardless of case.
exports.kUsernameMin = 3;
exports.kUsernameMax = 20;
const kUsername = new RegExp(`^[A-Za-z0-9_]{${exports.kUsernameMin},${exports.kUsernameMax}}$`);
// The launcher's default nickname: never offered as a username, since everybody who did not set one has it.
exports.kDefaultNickname = "Player";
const usernameError = (username) => kUsername.test(username) ? null : `Логин: от ${exports.kUsernameMin} до ${exports.kUsernameMax} латинских букв, цифр или _`;
exports.usernameError = usernameError;
const isUsableUsername = (name) => (0, exports.usernameError)(name) === null && name.toLowerCase() !== exports.kDefaultNickname.toLowerCase();
exports.isUsableUsername = isUsableUsername;
// A character is a first and a last name, each a capital and then lower case letters: "John Smith".
const kCharacterNamePart = /^[A-Z][a-z]{1,15}$/;
// The name as typed, tidied: surrounding and repeated spaces dropped, each part capitalized.
const normalizeCharacterName = (name) => name.trim().split(/\s+/).map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");
exports.normalizeCharacterName = normalizeCharacterName;
// Why a character name is refused, or null when it is a valid one. Expects it normalized.
const characterNameError = (name) => {
    const parts = name.split(" ");
    return parts.length === 2 && parts.every((part) => kCharacterNamePart.test(part)) ? null : "Назовите персонажа именем и фамилией латиницей, например John Smith";
};
exports.characterNameError = characterNameError;
// A submit as it arrives, from the client or from the page: untrusted, so anything but a string is empty.
const readAuthSubmit = (payload) => {
    const fields = typeof payload === "object" && payload !== null ? payload : {};
    const text = (value) => (typeof value === "string" ? value : "");
    return {
        mode: fields["mode"] === "register" ? "register" : "login",
        username: text(fields["username"]).trim(),
        password: text(fields["password"]),
        confirm: text(fields["confirm"]),
        characterName: (0, exports.normalizeCharacterName)(text(fields["characterName"])),
    };
};
exports.readAuthSubmit = readAuthSubmit;
