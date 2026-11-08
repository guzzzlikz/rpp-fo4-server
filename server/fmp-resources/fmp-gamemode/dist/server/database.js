"use strict";
// The gamemode's own SQLite database: accounts and the character each one plays, through Node's
// built-in node:sqlite (no native addon: better-sqlite3's prebuilt binaries cannot load inside the
// Windows FMPServer.exe, whose Node lives in libnode.dll rather than node.exe). Its API is synchronous, which suits the server's single script thread: a query
// finishes before the handler that asked returns, so two events can never interleave a read and a
// write.
Object.defineProperty(exports, "__esModule", { value: true });
exports.close = exports.markCreated = exports.saveAppearance = exports.saveCharacter = exports.findCharacter = exports.touchAccount = exports.setAdminLevel = exports.createAccount = exports.isCharacterNameTaken = exports.findAccount = void 0;
const node_fs_1 = require("node:fs");
const node_sqlite_1 = require("node:sqlite");
// Beside the server, relative to where it runs.
const kFolder = "fmp-data";
const kPath = `${kFolder}/gamemode.sqlite`;
// Each entry moves the schema one version on; PRAGMA user_version records how many have run.
const kMigrations = [
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
// Runs `work` inside one transaction: all of it lands, or none of it does.
const inTransaction = (db, work) => {
    db.exec("BEGIN IMMEDIATE");
    try {
        const result = work();
        db.exec("COMMIT");
        return result;
    }
    catch (error) {
        if (db.isTransaction) {
            db.exec("ROLLBACK");
        }
        throw error;
    }
};
const open = () => {
    (0, node_fs_1.mkdirSync)(kFolder, { recursive: true });
    const db = new node_sqlite_1.DatabaseSync(kPath);
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA foreign_keys = ON");
    const version = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
    inTransaction(db, () => {
        kMigrations.slice(version).forEach((migration, index) => {
            db.exec(migration);
            db.exec(`PRAGMA user_version = ${version + index + 1}`);
        });
    });
    console.log(`database ${kPath} at schema ${kMigrations.length}`);
    return db;
};
const db = open();
const prepare = (sql) => {
    const statement = db.prepare(sql);
    return {
        get: (...params) => statement.get(...params),
        run: (...params) => {
            const result = statement.run(...params);
            return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
        },
    };
};
const statements = {
    findAccount: prepare("SELECT a.id, a.name, a.password_hash, a.password_salt, a.admin_level, c.name AS character_name FROM accounts a LEFT JOIN characters c ON c.account_id = a.id WHERE a.name = ?"),
    createAccount: prepare("INSERT INTO accounts (name, password_hash, password_salt, steam_id, created_at) VALUES (?, ?, ?, ?, ?)"),
    createCharacter: prepare("INSERT INTO characters (account_id, name, updated_at) VALUES (?, ?, ?)"),
    characterNameTaken: prepare("SELECT 1 AS taken FROM characters WHERE name = ? COLLATE NOCASE"),
    setAdminLevel: prepare("UPDATE accounts SET admin_level = ? WHERE name = ?"),
    saveAppearance: prepare("UPDATE characters SET appearance = ?, updated_at = ? WHERE account_id = ?"),
    markCreated: prepare("UPDATE characters SET created = 1, updated_at = ? WHERE account_id = ?"),
    touchAccount: prepare("UPDATE accounts SET last_login = ?, last_ip = ? WHERE id = ?"),
    findCharacter: prepare("SELECT document, appearance, created, world_space, interior_cell, x, y, z, heading, play_seconds FROM characters WHERE account_id = ?"),
    saveCharacter: prepare(`INSERT INTO characters (account_id, document, world_space, interior_cell, x, y, z, heading, play_seconds, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id) DO UPDATE SET
           document = COALESCE(excluded.document, document), world_space = excluded.world_space, interior_cell = excluded.interior_cell,
           x = excluded.x, y = excluded.y, z = excluded.z, heading = excluded.heading, play_seconds = excluded.play_seconds, updated_at = excluded.updated_at`),
};
const now = () => Math.floor(Date.now() / 1000);
const findAccount = (name) => {
    const row = statements.findAccount.get(name);
    return row === undefined ? null : { id: row.id, name: row.name, passwordHash: row.password_hash, passwordSalt: row.password_salt, adminLevel: row.admin_level, characterName: row.character_name };
};
exports.findAccount = findAccount;
const isCharacterNameTaken = (characterName) => statements.characterNameTaken.get(characterName) !== undefined;
exports.isCharacterNameTaken = isCharacterNameTaken;
// The account and its named character, together or not at all.
const createAccount = (name, passwordHash, passwordSalt, steamId, characterName) => inTransaction(db, () => {
    const id = statements.createAccount.run(name, passwordHash, passwordSalt, steamId, now()).lastInsertRowid;
    statements.createCharacter.run(id, characterName, now());
    return id;
});
exports.createAccount = createAccount;
// False when no account has that name.
const setAdminLevel = (name, level) => statements.setAdminLevel.run(level, name).changes > 0;
exports.setAdminLevel = setAdminLevel;
const touchAccount = (id, ip) => {
    statements.touchAccount.run(now(), ip, id);
};
exports.touchAccount = touchAccount;
const findCharacter = (accountId) => {
    const row = statements.findCharacter.get(accountId);
    if (row === undefined) {
        return null;
    }
    return {
        document: row.document === null ? null : JSON.parse(row.document),
        appearance: row.appearance,
        created: row.created !== 0,
        space: { worldSpace: row.world_space, interiorCell: row.interior_cell },
        position: row.x !== null && row.y !== null && row.z !== null ? { x: row.x, y: row.y, z: row.z } : null,
        heading: row.heading,
        playSeconds: row.play_seconds,
    };
};
exports.findCharacter = findCharacter;
const saveCharacter = (accountId, character) => {
    const document = character.document === null ? null : JSON.stringify(character.document);
    const position = character.position;
    statements.saveCharacter.run(accountId, document, character.space.worldSpace, character.space.interiorCell, position?.x ?? null, position?.y ?? null, position?.z ?? null, character.heading, character.playSeconds, now());
};
exports.saveCharacter = saveCharacter;
const saveAppearance = (accountId, appearance) => {
    statements.saveAppearance.run(appearance, now(), accountId);
};
exports.saveAppearance = saveAppearance;
const markCreated = (accountId) => {
    statements.markCreated.run(now(), accountId);
};
exports.markCreated = markCreated;
// Last thing the gamemode does as it stops, once every session is saved.
const close = () => {
    db.close();
};
exports.close = close;
