// Accounts: nobody plays until they have logged in. A player who joins is held in a virtual world of
// their own at the lobby, where their client flies a cinematic camera over the wasteland behind the
// login page. Logging in (or registering a new username) brings back the character and the place the
// account last stood, from the SQLite database. The conversation itself is in src/shared/auth.ts.
//
// The account is the username typed on the page, not the launcher's nickname: players who never set a
// nickname all join as "Player", and keying on it put them all into one character. One account is
// played by one player at a time.

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

import { type AuthDone, AuthEvents, type AuthMode, type AuthPrompt, type AuthSubmit, type CinematicShot, characterNameError, isUsableUsername, kMaxAttempts, kPasswordMax, kPasswordMin, readAuthSubmit, usernameError } from "../shared/auth";
import { errorMessage } from "../shared/errors";
import { AdminLevel, isAdminLevel, reply } from "./chat";
import * as Creator from "./creator";
import * as Database from "./database";
import * as Equipment from "./equipment";
import { clearKnockDown } from "./getup";
import { Places, above, kCommonwealth, teleportSpace, toVector } from "./places";

// Where a player waits while logging in: Sanctuary, the cell the client loads the session's world in
// (core/frontend/main_menu.h, kSessionCell). The move there runs under the join's loading screen,
// which the client keeps up until the login page is on screen (src/client), and the cells under
// every shot are loaded around the player.
const kLobby = Places.sanctuary;

// Where a new character starts.
const kSpawn = Places.sanctuary;

// The cinematic behind the login page, flown in a loop, high enough to clear the hills. Every shot
// stays within two cells of the lobby on each axis (8192 units), the grid the game keeps loaded;
// Red Rocket and Concord are beyond it and would look into fog.
const kShots: readonly CinematicShot[] = [
    // In from the south-east over the river, coming round onto the cul-de-sac.
    { from: { x: -74500, y: 83500, z: 9500 }, to: { x: -77500, y: 85000, z: 9300 }, lookAt: above(Places.sanctuary.position, 150), seconds: 22 },
    // A slow arc west of the houses, the bridge road in frame.
    { from: { x: -86500, y: 91500, z: 9400 }, to: { x: -85500, y: 85500, z: 9200 }, lookAt: above(Places.sanctuary.position, 150), seconds: 20 },
    // High from the north, off the Vault 111 hill, down over the whole of Sanctuary.
    { from: { x: -83500, y: 95500, z: 11200 }, to: { x: -79000, y: 94500, z: 10900 }, lookAt: above(Places.sanctuary.position, 300), seconds: 24 },
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

// Who a logged-in player is.
interface Identity {
    accountId: number;
    // The username, as the account was registered.
    accountName: string;
    characterName: string;
    adminLevel: AdminLevel;
}

interface Session {
    player: Player;
    // Null until the player logs in.
    identity: Identity | null;
    attemptsLeft: number;
    // What the page last sent, to show it again with an error.
    username: string;
    mode: AuthMode;
    loginTimer: Timeout | null;
    // playerCharacterLoad has fired: setCharacter works from here.
    characterReady: boolean;
    // What the account had stored, waiting for the character to be established.
    pendingDocument: Partial<CharacterDocument> | null;
    playSecondsBefore: number;
    playingSince: number;
    // Logged in, waiting for their client to clear the login camera before they are placed.
    arrival: Arrival | null;
}

// What placing a player who just logged in needs, held until their client says the login camera is
// gone (AuthEvents.cut): a teleport while the cinematic's fly camera still runs leaves the camera
// stranded.
interface Arrival {
    stored: Database.StoredCharacter | null;
    timer: Timeout;
    // The player was down at the cut and has been told to get up; placed once their game reports it.
    respawning?: boolean;
}

const sessions = new Map<number, Session>();

const identityOf = (player: Player): Identity | null => sessions.get(player.id)?.identity ?? null;

export const isLoggedIn = (player: Player): boolean => identityOf(player) !== null;

// Their character's name once logged in; their nickname before.
export const characterName = (player: Player): string => identityOf(player)?.characterName ?? player.nickname;

// Their username once logged in; their launcher nickname before.
export const accountName = (player: Player): string => identityOf(player)?.accountName ?? player.nickname;

export const adminLevel = (player: Player): AdminLevel => identityOf(player)?.adminLevel ?? AdminLevel.player;

// The players who have logged in.
export const loggedInPlayers = (): Player[] => [...sessions.values()].filter((session: Session): boolean => session.identity !== null).map((session: Session): Player => session.player);

const sessionOfAccount = (accountId: number): Session | undefined =>
    [...sessions.values()].find((session: Session): boolean => session.identity?.accountId === accountId);

// Applies a rank changed in the database to its account's player, if they are on.
export const refreshAdminLevel = (name: string, level: AdminLevel): Player | null => {
    for (const session of sessions.values()) {
        if (session.identity !== null && session.identity.accountName.toLowerCase() === name.toLowerCase()) {
            session.identity.adminLevel = level;
            return session.player;
        }
    }
    return null;
};

// Before an account is deleted: whoever plays it is kicked without being saved, so that nothing
// writes the account back. Their nickname, or null when nobody had it.
export const forgetAccount = (accountId: number, reason: string): string | null => {
    const session: Session | undefined = sessionOfAccount(accountId);
    if (session === undefined) {
        return null;
    }
    session.identity = null;
    session.player.kick(reason);
    return session.player.nickname;
};

const send = <T>(player: Player, event: string, payload: T): void => {
    player.emit(event, JSON.stringify(payload));
};

const hashPassword = (password: string, salt: string): string => scryptSync(password, salt, kHashLength).toString("hex");

const passwordMatches = (password: string, account: Database.Account): boolean => {
    const expected: Buffer = Buffer.from(account.passwordHash, "hex");
    const actual: Buffer = scryptSync(password, account.passwordSalt, kHashLength);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
};

const prompt = (session: Session, error: string | null = null): void => {
    send<AuthPrompt>(session.player, AuthEvents.prompt, { username: session.username, mode: session.mode, shots: [...kShots], attemptsLeft: session.attemptsLeft, error });
};

const open = (player: Player, characterReady: boolean): Session => {
    // A nickname set in the launcher is offered as the username, and the tab follows whether it is
    // taken; the default "Player" is offered to nobody.
    const suggested: string = isUsableUsername(player.nickname) ? player.nickname : "";
    const mode: AuthMode = suggested !== "" && Database.findAccount(suggested) !== null ? "login" : "register";
    const session: Session = { player, identity: null, arrival: null, attemptsLeft: kMaxAttempts, username: suggested, mode, loginTimer: null, characterReady, pendingDocument: null, playSecondsBefore: 0, playingSince: 0 };
    sessions.set(player.id, session);
    return session;
};

const holdInLobby = (session: Session): void => {
    const player: Player = session.player;
    player.setVirtualWorld(kLobbyWorldBase + player.id);
    player.setNametagVisible(false);
    player.teleport(toVector(kLobby.position), kLobby.heading, { worldSpace: kCommonwealth });
    session.loginTimer = setTimeout((): void => {
        if (sessions.get(player.id) === session && session.identity === null) {
            player.kick("Слишком долгий вход: время истекло");
        }
    }, kLoginTimeoutMs);
};

const applyDocument = (session: Session): void => {
    if (session.pendingDocument === null || !session.characterReady) {
        return;
    }
    try {
        session.player.setCharacter(session.pendingDocument);
    } catch (thrown: unknown) {
        console.error(`${session.player.nickname}: stored character rejected: ${errorMessage(thrown)}`);
    }
    session.pendingDocument = null;
};

const stopLoginTimer = (session: Session): void => {
    if (session.loginTimer !== null) {
        clearTimeout(session.loginTimer);
        session.loginTimer = null;
    }
};

const enterWorld = (session: Session, identity: Identity, firstTime: boolean): void => {
    const player: Player = session.player;
    const accountId: number = identity.accountId;
    stopLoginTimer(session);
    session.identity = identity;
    Database.touchAccount(accountId, player.getIP());

    const stored: Database.StoredCharacter | null = firstTime ? null : Database.findCharacter(accountId);
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
    const creating: boolean = stored?.created !== true;
    send<AuthDone>(player, AuthEvents.done, { username: identity.accountName, characterName: identity.characterName, firstTime, creating });
    console.log(`${player.nickname} ${firstTime ? "registered" : "logged in"} as ${identity.accountName} / ${identity.characterName} (account ${accountId})${creating ? ", to the character creator" : ""}`);
    session.arrival = { stored, timer: setTimeout((): void => arrive(session), kArrivalTimeoutMs) };
};

// Places a player who logged in: their look, the world everyone shares, where they last stood (or the
// spawn), then the creator or the welcome. The move shows no loading screen: their client is under
// black since the cut, their game streams the place in behind it, and `placed` tells the client to
// fade back in.
const arrive = (session: Session): void => {
    const arrival: Arrival | null = session.arrival;
    const identity: Identity | null = session.identity;
    if (arrival === null || identity === null || sessions.get(session.player.id) !== session) {
        return;
    }
    clearTimeout(arrival.timer);
    session.arrival = null;
    const player: Player = session.player;
    const stored: Database.StoredCharacter | null = arrival.stored;

    let creating: boolean = stored?.created !== true;
    if (stored?.appearance != null) {
        try {
            player.setAppearance(stored.appearance);
        } catch (thrown: unknown) {
            console.warn(`${player.nickname}: stored look refused (${errorMessage(thrown)}); making a new one`);
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
        session.arrival = { stored, respawning: true, timer: setTimeout((): void => arrive(session), kRespawnPollMs) };
        return;
    }

    player.setVirtualWorld(0);
    // Left in the middle of the fall that gets a body up (getup.ts): their character kept the paralysis.
    clearKnockDown(player);
    if (stored?.position) {
        player.teleport(toVector(stored.position), stored.heading, teleportSpace(stored.space), { loadScreen: false });
    } else {
        player.teleport(toVector(kSpawn.position), kSpawn.heading, { worldSpace: kCommonwealth }, { loadScreen: false });
    }
    send<null>(player, AuthEvents.placed, null);
    // What they had in hands and wore when they left goes back on: the document only kept the bag.
    Equipment.begin(player);
    Equipment.track(player, Database.findEquipment(identity.accountId));

    if (creating) {
        Creator.begin(player, identity.accountId, identity.characterName);
    } else {
        reply(player, `Welcome back, ${identity.characterName}.`);
    }
};

const save = (session: Session): void => {
    if (session.identity === null) {
        return;
    }
    const player: Player = session.player;
    const position: Vector3 = player.position;
    Database.saveCharacter(session.identity.accountId, {
        document: session.characterReady ? player.getCharacter() : null,
        space: player.getSpace() ?? { worldSpace: kCommonwealth, interiorCell: 0 },
        position: { x: position.x, y: position.y, z: position.z },
        heading: player.heading,
        playSeconds: session.playSecondsBefore + Math.floor((Date.now() - session.playingSince) / 1000),
    });
    const equipment: Equipment.Equipment | null = Equipment.lastEquipment(player);
    if (equipment !== null) {
        Database.saveEquipment(session.identity.accountId, equipment);
    }
};

const register = (session: Session, submitted: AuthSubmit): void => {
    const { username, password, confirm, characterName: name }: AuthSubmit = submitted;
    if (!isUsableUsername(username)) {
        prompt(session, "Придумайте свой логин, Player занят по умолчанию");
        return;
    }
    if (Database.findAccount(username) !== null) {
        prompt(session, `Логин ${username} уже занят. Войдите или выберите другой`);
        return;
    }
    const nameError: string | null = characterNameError(name);
    if (nameError !== null) {
        prompt(session, nameError);
        return;
    }
    if (Database.isCharacterNameTaken(name)) {
        prompt(session, `Персонаж ${name} уже существует`);
        return;
    }
    if (password.length < kPasswordMin || password.length > kPasswordMax) {
        prompt(session, `Пароль: от ${kPasswordMin} до ${kPasswordMax} символов`);
        return;
    }
    if (confirm !== password) {
        prompt(session, "Пароли не совпадают");
        return;
    }
    const salt: string = randomBytes(kSaltBytes).toString("hex");
    const accountId: number = Database.createAccount(username, hashPassword(password, salt), salt, session.player.steamId, name);
    enterWorld(session, { accountId, accountName: username, characterName: name, adminLevel: AdminLevel.player }, true);
};

const logIn = (session: Session, submitted: AuthSubmit): void => {
    const account: Database.Account | null = Database.findAccount(submitted.username);
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
    const playing: Session | undefined = sessionOfAccount(account.id);
    if (playing !== undefined) {
        console.warn(`${account.name}: second login from ${session.player.nickname} (${session.player.getIP()}) refused, already played by ${playing.player.nickname}`);
        prompt(session, `${account.name} уже в игре`);
        return;
    }
    const level: AdminLevel = isAdminLevel(account.adminLevel) ? account.adminLevel : AdminLevel.player;
    enterWorld(session, { accountId: account.id, accountName: account.name, characterName: account.characterName ?? account.name, adminLevel: level }, false);
};

Events.on("playerConnect", (player: Player): void => {
    open(player, false);
});

Events.on("playerReady", (player: Player): void => {
    const session: Session | undefined = sessions.get(player.id);
    if (session !== undefined && session.identity === null) {
        holdInLobby(session);
    }
});

Events.on("playerCharacterLoad", (player: Player): void => {
    const session: Session | undefined = sessions.get(player.id);
    if (session !== undefined) {
        session.characterReady = true;
        applyDocument(session);
    }
});

// A look changed in the world (a barber, a script) is the character's from then on. The creator stores
// its own once its editor has closed.
Events.on("playerAppearanceChange", (player: Player): void => {
    const identity: Identity | null = identityOf(player);
    const appearance: string | null = player.getAppearance();
    if (identity !== null && appearance !== null && !Creator.isCreating(player)) {
        Database.saveAppearance(identity.accountId, appearance);
    }
});

Events.on("playerDisconnect", (player: Player): void => {
    const session: Session | undefined = sessions.get(player.id);
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
Events.onClient(AuthEvents.hello, (sender: unknown): void => {
    const player = sender as Player;
    const known: Session | undefined = sessions.get(player.id);
    const session: Session = known ?? open(player, true);
    if (session.identity !== null) {
        return;
    }
    if (known === undefined) {
        holdInLobby(session);
    }
    prompt(session);
});

Events.onClient(AuthEvents.cut, (sender: unknown): void => {
    const session: Session | undefined = sessions.get((sender as Player).id);
    if (session !== undefined) {
        arrive(session);
    }
});

Events.onClient(AuthEvents.submit, (sender: unknown, payload: unknown): void => {
    const session: Session | undefined = sessions.get((sender as Player).id);
    if (session === undefined || session.identity !== null) {
        return;
    }
    const submitted: AuthSubmit = readAuthSubmit(payload);
    session.username = submitted.username;
    session.mode = submitted.mode;
    const error: string | null = usernameError(submitted.username);
    if (error !== null) {
        prompt(session, error);
        return;
    }
    if (submitted.mode === "register") {
        register(session, submitted);
    } else {
        logIn(session, submitted);
    }
});

const autosave: Timeout = setInterval((): void => {
    sessions.forEach(save);
}, kAutosaveMs);

Events.on("resourceStop", (resourceName: string): void => {
    if (resourceName !== "fmp-gamemode") {
        return;
    }
    clearInterval(autosave);
    sessions.forEach(save);
    Database.close();
});
