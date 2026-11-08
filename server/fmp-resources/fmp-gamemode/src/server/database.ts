// The gamemode's own SQLite database: accounts and the character each one plays, through
// better-sqlite3. Its API is synchronous, which suits the server's single script thread: a query
// finishes before the handler that asked returns, so two events can never interleave a read and a
// write.

import BetterSqlite3 from "better-sqlite3";
import { mkdirSync } from "node:fs";

import type { Point } from "../shared/auth";

// Beside the server, relative to where it runs.
const kFolder = "fmp-data";
const kPath = `${kFolder}/gamemode.sqlite`;

// Each entry moves the schema one version on; PRAGMA user_version records how many have run.
const kMigrations: readonly string[] = [
    `CREATE TABLE accounts (
       id            INTEGER PRIMARY KEY AUTOINCREMENT,
       name          TEXT    NOT NULL UNIQUE COLLATE NOCASE,
       password_hash TEXT    NOT NULL,
       password_salt TEXT    NOT NULL,
       steam_id      TEXT    NOT NULL,
       created_at    INTEGER NOT NULL,
       last_login    INTEGER,
       last_ip       TEXT
     );
     CREATE TABLE characters (
       account_id    INTEGER PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
       document      TEXT,
       world_space   INTEGER NOT NULL DEFAULT 0,
       interior_cell INTEGER NOT NULL DEFAULT 0,
       x             REAL,
       y             REAL,
       z             REAL,
       heading       REAL    NOT NULL DEFAULT 0,
       play_seconds  INTEGER NOT NULL DEFAULT 0,
       updated_at    INTEGER NOT NULL
     );`,
    // Staff rank, and the name the character goes by in the world.
    `ALTER TABLE accounts ADD COLUMN admin_level INTEGER NOT NULL DEFAULT 0;
     ALTER TABLE characters ADD COLUMN name TEXT;
     CREATE UNIQUE INDEX characters_name ON characters (name COLLATE NOCASE);`,
    // The look, as Player.getAppearance gives it; null until the character creator has run.
    `ALTER TABLE characters ADD COLUMN appearance TEXT;`,
    // Set once the character creator has run to its end: until then every login runs it again.
    `ALTER TABLE characters ADD COLUMN created INTEGER NOT NULL DEFAULT 0;`,
];

export interface Account {
    id: number;
    name: string;
    passwordHash: string;
    passwordSalt: string;
    adminLevel: number;
    // Null for an account whose character was never named.
    characterName: string | null;
}

// A character as the database keeps it. Saved with a null document, it keeps the one already stored:
// the character was not established yet, but where the player stood still counts.
export interface StoredCharacter {
    document: Partial<CharacterDocument> | null;
    // Null until the character creator has stored one.
    appearance: string | null;
    // The character creator ran to its end.
    created: boolean;
    space: PlayerSpace;
    position: Point | null;
    heading: number;
    playSeconds: number;
}

// The rows as SQLite hands them back, column for column.
interface AccountRow {
    id: number;
    name: string;
    password_hash: string;
    password_salt: string;
    admin_level: number;
    character_name: string | null;
}

interface CharacterRow {
    document: string | null;
    appearance: string | null;
    created: number;
    world_space: number;
    interior_cell: number;
    x: number | null;
    y: number | null;
    z: number | null;
    heading: number;
    play_seconds: number;
}

const open = (): BetterSqlite3.Database => {
    mkdirSync(kFolder, { recursive: true });
    const db: BetterSqlite3.Database = new BetterSqlite3(kPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    const version = Number(db.pragma("user_version", { simple: true }));
    const migrate: BetterSqlite3.Transaction<() => void> = db.transaction((): void => {
        kMigrations.slice(version).forEach((migration: string, index: number): void => {
            db.exec(migration);
            db.pragma(`user_version = ${version + index + 1}`);
        });
    });
    migrate();
    console.log(`database ${kPath} at schema ${kMigrations.length}`);
    return db;
};

const db: BetterSqlite3.Database = open();

const statements = {
    findAccount: db.prepare<[string], AccountRow>("SELECT a.id, a.name, a.password_hash, a.password_salt, a.admin_level, c.name AS character_name FROM accounts a LEFT JOIN characters c ON c.account_id = a.id WHERE a.name = ?"),
    createAccount: db.prepare<[string, string, string, string, number]>("INSERT INTO accounts (name, password_hash, password_salt, steam_id, created_at) VALUES (?, ?, ?, ?, ?)"),
    createCharacter: db.prepare<[number, string, number]>("INSERT INTO characters (account_id, name, updated_at) VALUES (?, ?, ?)"),
    characterNameTaken: db.prepare<[string], { taken: number }>("SELECT 1 AS taken FROM characters WHERE name = ? COLLATE NOCASE"),
    setAdminLevel: db.prepare<[number, string]>("UPDATE accounts SET admin_level = ? WHERE name = ?"),
    saveAppearance: db.prepare<[string, number, number]>("UPDATE characters SET appearance = ?, updated_at = ? WHERE account_id = ?"),
    markCreated: db.prepare<[number, number]>("UPDATE characters SET created = 1, updated_at = ? WHERE account_id = ?"),
    touchAccount: db.prepare<[number, string, number]>("UPDATE accounts SET last_login = ?, last_ip = ? WHERE id = ?"),
    findCharacter: db.prepare<[number], CharacterRow>("SELECT document, appearance, created, world_space, interior_cell, x, y, z, heading, play_seconds FROM characters WHERE account_id = ?"),
    saveCharacter: db.prepare<[number, string | null, number, number, number | null, number | null, number | null, number, number, number]>(
        `INSERT INTO characters (account_id, document, world_space, interior_cell, x, y, z, heading, play_seconds, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           document = COALESCE(excluded.document, document), world_space = excluded.world_space, interior_cell = excluded.interior_cell,
           x = excluded.x, y = excluded.y, z = excluded.z, heading = excluded.heading, play_seconds = excluded.play_seconds, updated_at = excluded.updated_at`,
    ),
} as const;

const now = (): number => Math.floor(Date.now() / 1000);

export const findAccount = (name: string): Account | null => {
    const row: AccountRow | undefined = statements.findAccount.get(name);
    return row === undefined ? null : { id: row.id, name: row.name, passwordHash: row.password_hash, passwordSalt: row.password_salt, adminLevel: row.admin_level, characterName: row.character_name };
};

export const isCharacterNameTaken = (characterName: string): boolean => statements.characterNameTaken.get(characterName) !== undefined;

// The account and its named character, together or not at all.
const createAccountWithCharacter = db.transaction((name: string, passwordHash: string, passwordSalt: string, steamId: string, characterName: string): number => {
    const id = Number(statements.createAccount.run(name, passwordHash, passwordSalt, steamId, now()).lastInsertRowid);
    statements.createCharacter.run(id, characterName, now());
    return id;
});

export const createAccount = (name: string, passwordHash: string, passwordSalt: string, steamId: string, characterName: string): number => createAccountWithCharacter(name, passwordHash, passwordSalt, steamId, characterName);

// False when no account has that name.
export const setAdminLevel = (name: string, level: number): boolean => statements.setAdminLevel.run(level, name).changes > 0;

export const touchAccount = (id: number, ip: string): void => {
    statements.touchAccount.run(now(), ip, id);
};

export const findCharacter = (accountId: number): StoredCharacter | null => {
    const row: CharacterRow | undefined = statements.findCharacter.get(accountId);
    if (row === undefined) {
        return null;
    }
    return {
        document: row.document === null ? null : (JSON.parse(row.document) as Partial<CharacterDocument>),
        appearance: row.appearance,
        created: row.created !== 0,
        space: { worldSpace: row.world_space, interiorCell: row.interior_cell },
        position: row.x !== null && row.y !== null && row.z !== null ? { x: row.x, y: row.y, z: row.z } : null,
        heading: row.heading,
        playSeconds: row.play_seconds,
    };
};

export const saveCharacter = (accountId: number, character: Omit<StoredCharacter, "appearance" | "created">): void => {
    const document: string | null = character.document === null ? null : JSON.stringify(character.document);
    const position: Point | null = character.position;
    statements.saveCharacter.run(accountId, document, character.space.worldSpace, character.space.interiorCell, position?.x ?? null, position?.y ?? null, position?.z ?? null, character.heading, character.playSeconds, now());
};

export const saveAppearance = (accountId: number, appearance: string): void => {
    statements.saveAppearance.run(appearance, now(), accountId);
};

export const markCreated = (accountId: number): void => {
    statements.markCreated.run(now(), accountId);
};

// Last thing the gamemode does as it stops, once every session is saved.
export const close = (): void => {
    db.close();
};
