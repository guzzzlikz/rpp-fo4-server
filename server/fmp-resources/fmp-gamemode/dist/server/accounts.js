"use strict";
// Accounts: nobody plays until they have logged in. A player who joins is held in a virtual world of
// their own at the lobby, where their client flies a cinematic camera over the wasteland behind the
// login page. Logging in (or registering a new username) brings back the character and the place the
// account last stood, from the SQLite database. The conversation itself is in src/shared/auth.ts.
//
// The account is the username typed on the page, not the launcher's nickname: players who never set a
// nickname all join as "Player", and keying on it put them all into one character. One account is
// played by one player at a time.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.forgetAccount = exports.refreshAdminLevel = exports.loggedInPlayers = exports.adminLevel = exports.accountName = exports.characterName = exports.isLoggedIn = void 0;
const node_crypto_1 = require("node:crypto");
const auth_1 = require("../shared/auth");
const errors_1 = require("../shared/errors");
const chat_1 = require("./chat");
const Creator = __importStar(require("./creator"));
const Database = __importStar(require("./database"));
const Equipment = __importStar(require("./equipment"));
const places_1 = require("./places");
// Where a player waits while logging in: Sanctuary, the cell the client loads the session's world in
// (core/frontend/main_menu.h, kSessionCell). The move there runs under the join's loading screen,
// which the client keeps up until the login page is on screen (src/client), and the cells under
// every shot are loaded around the player.
const kLobby = places_1.Places.sanctuary;
// Where a new character starts.
const kSpawn = places_1.Places.sanctuary;
// The cinematic behind the login page, flown in a loop, high enough to clear the hills. Every shot
// stays within two cells of the lobby on each axis (8192 units), the grid the game keeps loaded;
// Red Rocket and Concord are beyond it and would look into fog.
const kShots = [
    // In from the south-east over the river, coming round onto the cul-de-sac.
    { from: { x: -74500, y: 83500, z: 9500 }, to: { x: -77500, y: 85000, z: 9300 }, lookAt: (0, places_1.above)(places_1.Places.sanctuary.position, 150), seconds: 22 },
    // A slow arc west of the houses, the bridge road in frame.
    { from: { x: -86500, y: 91500, z: 9400 }, to: { x: -85500, y: 85500, z: 9200 }, lookAt: (0, places_1.above)(places_1.Places.sanctuary.position, 150), seconds: 20 },
    // High from the north, off the Vault 111 hill, down over the whole of Sanctuary.
    { from: { x: -83500, y: 95500, z: 11200 }, to: { x: -79000, y: 94500, z: 10900 }, lookAt: (0, places_1.above)(places_1.Places.sanctuary.position, 300), seconds: 24 },
];
// Each player in the lobby is alone in a world of their own, above any a script would use.
const kLobbyWorldBase = 0x10000;
const kLoginTimeoutMs = 5 * 60 * 1000;
// A client that never reports its login camera gone is placed anyway.
const kArrivalTimeoutMs = 5000;
// How often a player who was down at login is asked again whether their game has them up.
const kRespawnPollMs = 250;
const kAutosaveMs = 2 * 60 * 1000;
const kHashLength = 64;
const kSaltBytes = 16;
const sessions = new Map();
const identityOf = (player) => sessions.get(player.id)?.identity ?? null;
const isLoggedIn = (player) => identityOf(player) !== null;
exports.isLoggedIn = isLoggedIn;
// Their character's name once logged in; their nickname before.
const characterName = (player) => identityOf(player)?.characterName ?? player.nickname;
exports.characterName = characterName;
// Their username once logged in; their launcher nickname before.
const accountName = (player) => identityOf(player)?.accountName ?? player.nickname;
exports.accountName = accountName;
const adminLevel = (player) => identityOf(player)?.adminLevel ?? chat_1.AdminLevel.player;
exports.adminLevel = adminLevel;
// The players who have logged in.
const loggedInPlayers = () => [...sessions.values()].filter((session) => session.identity !== null).map((session) => session.player);
exports.loggedInPlayers = loggedInPlayers;
const sessionOfAccount = (accountId) => [...sessions.values()].find((session) => session.identity?.accountId === accountId);
// Applies a rank changed in the database to its account's player, if they are on.
const refreshAdminLevel = (name, level) => {
    for (const session of sessions.values()) {
        if (session.identity !== null && session.identity.accountName.toLowerCase() === name.toLowerCase()) {
            session.identity.adminLevel = level;
            return session.player;
        }
    }
    return null;
};
exports.refreshAdminLevel = refreshAdminLevel;
// Before an account is deleted: whoever plays it is kicked without being saved, so that nothing
// writes the account back. Their nickname, or null when nobody had it.
const forgetAccount = (accountId, reason) => {
    const session = sessionOfAccount(accountId);
    if (session === undefined) {
        return null;
    }
    session.identity = null;
    session.player.kick(reason);
    return session.player.nickname;
};
exports.forgetAccount = forgetAccount;
const send = (player, event, payload) => {
    player.emit(event, JSON.stringify(payload));
};
const hashPassword = (password, salt) => (0, node_crypto_1.scryptSync)(password, salt, kHashLength).toString("hex");
const passwordMatches = (password, account) => {
    const expected = Buffer.from(account.passwordHash, "hex");
    const actual = (0, node_crypto_1.scryptSync)(password, account.passwordSalt, kHashLength);
    return expected.length === actual.length && (0, node_crypto_1.timingSafeEqual)(expected, actual);
};
const prompt = (session, error = null) => {
    send(session.player, auth_1.AuthEvents.prompt, { username: session.username, mode: session.mode, shots: [...kShots], attemptsLeft: session.attemptsLeft, error });
};
const open = (player, characterReady) => {
    // A nickname set in the launcher is offered as the username, and the tab follows whether it is
    // taken; the default "Player" is offered to nobody.
    const suggested = (0, auth_1.isUsableUsername)(player.nickname) ? player.nickname : "";
    const mode = suggested !== "" && Database.findAccount(suggested) !== null ? "login" : "register";
    const session = { player, identity: null, arrival: null, attemptsLeft: auth_1.kMaxAttempts, username: suggested, mode, loginTimer: null, characterReady, pendingDocument: null, playSecondsBefore: 0, playingSince: 0 };
    sessions.set(player.id, session);
    return session;
};
const holdInLobby = (session) => {
    const player = session.player;
    player.setVirtualWorld(kLobbyWorldBase + player.id);
    player.setNametagVisible(false);
    player.teleport((0, places_1.toVector)(kLobby.position), kLobby.heading, { worldSpace: places_1.kCommonwealth });
    session.loginTimer = setTimeout(() => {
        if (sessions.get(player.id) === session && session.identity === null) {
            player.kick("Слишком долгий вход: время истекло");
        }
    }, kLoginTimeoutMs);
};
const applyDocument = (session) => {
    if (session.pendingDocument === null || !session.characterReady) {
        return;
    }
    try {
        session.player.setCharacter(session.pendingDocument);
    }
    catch (thrown) {
        console.error(`${session.player.nickname}: stored character rejected: ${(0, errors_1.errorMessage)(thrown)}`);
    }
    session.pendingDocument = null;
};
const stopLoginTimer = (session) => {
    if (session.loginTimer !== null) {
        clearTimeout(session.loginTimer);
        session.loginTimer = null;
    }
};
const enterWorld = (session, identity, firstTime) => {
    const player = session.player;
    const accountId = identity.accountId;
    stopLoginTimer(session);
    session.identity = identity;
    Database.touchAccount(accountId, player.getIP());
    const stored = firstTime ? null : Database.findCharacter(accountId);
    session.pendingDocument = stored?.document ?? null;
    session.playSecondsBefore = stored?.playSeconds ?? 0;
    session.playingSince = Date.now();
    applyDocument(session);
    // The character's name in their own game (its menus show it, and the SPECIAL menu will not close
    // without one) and above their head for everyone else.
    player.setGameName(identity.characterName);
    player.setNametagText(identity.characterName);
    player.setNametagVisible(true);
    // Until the creator has run to its end once, it follows every login.
    const creating = stored?.created !== true;
    send(player, auth_1.AuthEvents.done, { username: identity.accountName, characterName: identity.characterName, firstTime, creating });
    console.log(`${player.nickname} ${firstTime ? "registered" : "logged in"} as ${identity.accountName} / ${identity.characterName} (account ${accountId})${creating ? ", to the character creator" : ""}`);
    session.arrival = { stored, timer: setTimeout(() => arrive(session), kArrivalTimeoutMs) };
};
// Places a player who logged in: their look, the world everyone shares, where they last stood (or the
// spawn), then the creator or the welcome. The move shows no loading screen: their client is under
// black since the cut, their game streams the place in behind it, and `placed` tells the client to
// fade back in.
const arrive = (session) => {
    const arrival = session.arrival;
    const identity = session.identity;
    if (arrival === null || identity === null || sessions.get(session.player.id) !== session) {
        return;
    }
    clearTimeout(arrival.timer);
    session.arrival = null;
    const player = session.player;
    const stored = arrival.stored;
    let creating = stored?.created !== true;
    if (stored?.appearance != null) {
        try {
            player.setAppearance(stored.appearance);
        }
        catch (thrown) {
            console.warn(`${player.nickname}: stored look refused (${(0, errors_1.errorMessage)(thrown)}); making a new one`);
            creating = true;
        }
    }
    // A player who went down in the lobby is a ragdoll, and a ragdoll does not follow a move: it
    // stays where it lay while the actor changes cell, and the respawn then stands them up there, in
    // the void. So they get up first, where they fell, and are placed once their game reports them
    // alive again.
    if (player.isDead) {
        if (arrival.respawning !== true) {
            player.respawn();
        }
        session.arrival = { stored, respawning: true, timer: setTimeout(() => arrive(session), kRespawnPollMs) };
        return;
    }
    player.setVirtualWorld(0);
    if (stored?.position) {
        player.teleport((0, places_1.toVector)(stored.position), stored.heading, (0, places_1.teleportSpace)(stored.space), { loadScreen: false });
    }
    else {
        player.teleport((0, places_1.toVector)(kSpawn.position), kSpawn.heading, { worldSpace: places_1.kCommonwealth }, { loadScreen: false });
    }
    send(player, auth_1.AuthEvents.placed, null);
    // What they had in hands and wore when they left goes back on: the document only kept the bag.
    Equipment.begin(player);
    Equipment.track(player, Database.findEquipment(identity.accountId));
    if (creating) {
        Creator.begin(player, identity.accountId, identity.characterName);
    }
    else {
        (0, chat_1.reply)(player, `Welcome back, ${identity.characterName}.`);
    }
};
const save = (session) => {
    if (session.identity === null) {
        return;
    }
    const player = session.player;
    const position = player.position;
    Database.saveCharacter(session.identity.accountId, {
        document: session.characterReady ? player.getCharacter() : null,
        space: player.getSpace() ?? { worldSpace: places_1.kCommonwealth, interiorCell: 0 },
        position: { x: position.x, y: position.y, z: position.z },
        heading: player.heading,
        playSeconds: session.playSecondsBefore + Math.floor((Date.now() - session.playingSince) / 1000),
    });
    const equipment = Equipment.lastEquipment(player);
    if (equipment !== null) {
        Database.saveEquipment(session.identity.accountId, equipment);
    }
};
const register = (session, submitted) => {
    const { username, password, confirm, characterName: name } = submitted;
    if (!(0, auth_1.isUsableUsername)(username)) {
        prompt(session, "Придумайте свой логин, Player занят по умолчанию");
        return;
    }
    if (Database.findAccount(username) !== null) {
        prompt(session, `Логин ${username} уже занят. Войдите или выберите другой`);
        return;
    }
    const nameError = (0, auth_1.characterNameError)(name);
    if (nameError !== null) {
        prompt(session, nameError);
        return;
    }
    if (Database.isCharacterNameTaken(name)) {
        prompt(session, `Персонаж ${name} уже существует`);
        return;
    }
    if (password.length < auth_1.kPasswordMin || password.length > auth_1.kPasswordMax) {
        prompt(session, `Пароль: от ${auth_1.kPasswordMin} до ${auth_1.kPasswordMax} символов`);
        return;
    }
    if (confirm !== password) {
        prompt(session, "Пароли не совпадают");
        return;
    }
    const salt = (0, node_crypto_1.randomBytes)(kSaltBytes).toString("hex");
    const accountId = Database.createAccount(username, hashPassword(password, salt), salt, session.player.steamId, name);
    enterWorld(session, { accountId, accountName: username, characterName: name, adminLevel: chat_1.AdminLevel.player }, true);
};
const logIn = (session, submitted) => {
    const account = Database.findAccount(submitted.username);
    // An unknown username and a wrong password read the same, and cost the same attempt.
    if (account === null || !passwordMatches(submitted.password, account)) {
        session.attemptsLeft--;
        console.warn(`${submitted.username}: failed login from ${session.player.nickname} (${session.player.getIP()}), ${session.attemptsLeft} attempts left`);
        if (session.attemptsLeft <= 0) {
            session.player.kick("Слишком много неудачных попыток входа");
            return;
        }
        prompt(session, "Неверный логин или пароль");
        return;
    }
    const playing = sessionOfAccount(account.id);
    if (playing !== undefined) {
        console.warn(`${account.name}: second login from ${session.player.nickname} (${session.player.getIP()}) refused, already played by ${playing.player.nickname}`);
        prompt(session, `${account.name} уже в игре`);
        return;
    }
    const level = (0, chat_1.isAdminLevel)(account.adminLevel) ? account.adminLevel : chat_1.AdminLevel.player;
    enterWorld(session, { accountId: account.id, accountName: account.name, characterName: account.characterName ?? account.name, adminLevel: level }, false);
};
Events.on("playerConnect", (player) => {
    open(player, false);
});
Events.on("playerReady", (player) => {
    const session = sessions.get(player.id);
    if (session !== undefined && session.identity === null) {
        holdInLobby(session);
    }
});
Events.on("playerCharacterLoad", (player) => {
    const session = sessions.get(player.id);
    if (session !== undefined) {
        session.characterReady = true;
        applyDocument(session);
    }
});
// A look changed in the world (a barber, a script) is the character's from then on. The creator stores
// its own once its editor has closed.
Events.on("playerAppearanceChange", (player) => {
    const identity = identityOf(player);
    const appearance = player.getAppearance();
    if (identity !== null && appearance !== null && !Creator.isCreating(player)) {
        Database.saveAppearance(identity.accountId, appearance);
    }
});
Events.on("playerDisconnect", (player) => {
    const session = sessions.get(player.id);
    if (session === undefined) {
        return;
    }
    save(session);
    Equipment.untrack(player);
    stopLoginTimer(session);
    if (session.arrival !== null) {
        clearTimeout(session.arrival.timer);
    }
    sessions.delete(player.id);
});
// A player with no session was already in the world when the gamemode (re)started: their character
// is established, and they log in again like anybody else.
Events.onClient(auth_1.AuthEvents.hello, (sender) => {
    const player = sender;
    const known = sessions.get(player.id);
    const session = known ?? open(player, true);
    if (session.identity !== null) {
        return;
    }
    if (known === undefined) {
        holdInLobby(session);
    }
    prompt(session);
});
Events.onClient(auth_1.AuthEvents.cut, (sender) => {
    const session = sessions.get(sender.id);
    if (session !== undefined) {
        arrive(session);
    }
});
Events.onClient(auth_1.AuthEvents.submit, (sender, payload) => {
    const session = sessions.get(sender.id);
    if (session === undefined || session.identity !== null) {
        return;
    }
    const submitted = (0, auth_1.readAuthSubmit)(payload);
    session.username = submitted.username;
    session.mode = submitted.mode;
    const error = (0, auth_1.usernameError)(submitted.username);
    if (error !== null) {
        prompt(session, error);
        return;
    }
    if (submitted.mode === "register") {
        register(session, submitted);
    }
    else {
        logIn(session, submitted);
    }
});
const autosave = setInterval(() => {
    sessions.forEach(save);
}, kAutosaveMs);
Events.on("resourceStop", (resourceName) => {
    if (resourceName !== "fmp-gamemode") {
        return;
    }
    clearInterval(autosave);
    sessions.forEach(save);
    Database.close();
});
