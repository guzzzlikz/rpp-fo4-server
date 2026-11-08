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

export const AuthEvents = {
    hello: "rp:auth:hello",
    submit: "rp:auth:submit",
    prompt: "rp:auth:prompt",
    done: "rp:auth:done",
    cut: "rp:auth:cut",
    placed: "rp:auth:placed",
    menuClosed: "rp:auth:menuClosed",
} as const;

// The game menus the character creator walks through, by their registered names: the look editor,
// then for a new character the SPECIAL menu the Vault 111 exit opens.
export const CreatorMenus = {
    look: "LooksMenu",
    special: "SPECIALMenu",
} as const;

export type CreatorMenu = (typeof CreatorMenus)[keyof typeof CreatorMenus];

export interface CreatorMenuClosed {
    menu: CreatorMenu;
}

export const isCreatorMenu = (name: unknown): name is CreatorMenu => name === CreatorMenus.look || name === CreatorMenus.special;

export interface Point {
    x: number;
    y: number;
    z: number;
}

// One shot of the cinematic behind the login page: a glide from `from` to `to`, looking at `lookAt`.
export interface CinematicShot {
    from: Point;
    to: Point;
    lookAt: Point;
    seconds: number;
}

// The account is chosen on the login page by its username, not taken from the launcher's nickname:
// every player who never set a nickname joins as "Player", and keying accounts on that put everyone
// on one LAN into the same character.
export type AuthMode = "login" | "register";

export interface AuthPrompt {
    // The username to prefill: the last one typed, or the launcher's nickname when it is a usable one.
    username: string;
    // The tab to show: the one the last submit came from, or a guess for the first prompt.
    mode: AuthMode;
    shots: CinematicShot[];
    attemptsLeft: number;
    error: string | null;
}

// `confirm` and `characterName` are empty when logging in.
export interface AuthSubmit {
    mode: AuthMode;
    username: string;
    password: string;
    confirm: string;
    characterName: string;
}

// `characterName` is who the player is in the world: their nametag and their name in chat. With
// `creating`, the character creator follows: the server opens its menus once the login page is gone.
export interface AuthDone {
    username: string;
    characterName: string;
    firstTime: boolean;
    creating: boolean;
}

export const kPasswordMin = 6;
export const kPasswordMax = 128;
export const kMaxAttempts = 5;

// A username: what the account is called, what staff rank it by ("setadmin <username> owner") and what
// out-of-character chat shows. Letters, digits and underscores; unique regardless of case.
export const kUsernameMin = 3;
export const kUsernameMax = 20;
const kUsername = new RegExp(`^[A-Za-z0-9_]{${kUsernameMin},${kUsernameMax}}$`);

// The launcher's default nickname: never offered as a username, since everybody who did not set one has it.
export const kDefaultNickname = "Player";

export const usernameError = (username: string): string | null =>
    kUsername.test(username) ? null : `A username is ${kUsernameMin} to ${kUsernameMax} letters, digits or underscores`;

export const isUsableUsername = (name: string): boolean => usernameError(name) === null && name.toLowerCase() !== kDefaultNickname.toLowerCase();

// A character is a first and a last name, each a capital and then lower case letters: "John Smith".
const kCharacterNamePart = /^[A-Z][a-z]{1,15}$/;

// The name as typed, tidied: surrounding and repeated spaces dropped, each part capitalized.
export const normalizeCharacterName = (name: string): string => name.trim().split(/\s+/).map((part: string): string => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(" ");

// Why a character name is refused, or null when it is a valid one. Expects it normalized.
export const characterNameError = (name: string): string | null => {
    const parts: string[] = name.split(" ");
    return parts.length === 2 && parts.every((part: string): boolean => kCharacterNamePart.test(part)) ? null : "Name your character with a first and a last name, like John Smith";
};

// A submit as it arrives, from the client or from the page: untrusted, so anything but a string is empty.
export const readAuthSubmit = (payload: unknown): AuthSubmit => {
    const fields: Record<string, unknown> = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
    const text = (value: unknown): string => (typeof value === "string" ? value : "");
    return {
        mode: fields["mode"] === "register" ? "register" : "login",
        username: text(fields["username"]).trim(),
        password: text(fields["password"]),
        confirm: text(fields["confirm"]),
        characterName: normalizeCharacterName(text(fields["characterName"])),
    };
};
