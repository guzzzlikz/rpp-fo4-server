// The character creator: what a character goes through on every login until it has run to its end
// once. It rides the game's own menus, as the Vault 111 exit does: the look editor, then the SPECIAL
// menu. The client says when each one closes (AuthEvents.menuClosed); the look is read and
// stored once the editor has closed, and the character is welcomed into the world after the last step.

import { AuthEvents, type CreatorMenu, CreatorMenus, isCreatorMenu } from "../shared/auth";
import { reply } from "./chat";
import * as Database from "./database";

// The login page fades out over about a second and a half; the editor opens once it has.
const kOpenDelayMs = 2500;
// The look is captured when the editor closes and replicated with the next report.
const kCaptureDelayMs = 1000;

interface Creation {
    player: Player;
    accountId: number;
    characterName: string;
    step: CreatorMenu;
}

const creations = new Map<number, Creation>();

export const isCreating = (player: Player): boolean => creations.has(player.id);

const finish = (creation: Creation): void => {
    creations.delete(creation.player.id);
    Database.markCreated(creation.accountId);
    reply(creation.player, Game.id === "fo76" ? `Welcome to Appalachia, ${creation.characterName}.` : `Welcome to the Commonwealth, ${creation.characterName}.`);
    console.log(`${creation.player.nickname}: ${creation.characterName} created`);
};

// After `kCaptureDelayMs`, so the look read is the one the editor closed on.
const storeLook = (creation: Creation): void => {
    setTimeout((): void => {
        if (creations.get(creation.player.id) !== creation) {
            return;
        }
        const appearance: string | null = creation.player.getAppearance();
        if (appearance === null) {
            console.warn(`${creation.player.nickname}: no look reported after the editor closed; opening it again`);
            creation.player.openLookEditor();
            return;
        }
        Database.saveAppearance(creation.accountId, appearance);
        // A game without the creation SPECIAL screen ends the creator on the look.
        if (!Game.has("specialMenu")) {
            finish(creation);
            return;
        }
        creation.step = CreatorMenus.special;
        creation.player.openSpecialMenu();
    }, kCaptureDelayMs);
};

export const begin = (player: Player, accountId: number, characterName: string): void => {
    const creation: Creation = { player, accountId, characterName, step: CreatorMenus.look };
    creations.set(player.id, creation);
    setTimeout((): void => {
        if (creations.get(player.id) === creation) {
            player.openLookEditor();
        }
    }, kOpenDelayMs);
};

Events.onClient(AuthEvents.menuClosed, (sender: unknown, payload: unknown): void => {
    const creation: Creation | undefined = creations.get((sender as Player).id);
    const menu: unknown = typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>)["menu"] : undefined;
    if (creation === undefined || !isCreatorMenu(menu) || menu !== creation.step) {
        return;
    }
    if (menu === CreatorMenus.look) {
        storeLook(creation);
    } else {
        finish(creation);
    }
});

Events.on("playerDisconnect", (player: Player): void => {
    creations.delete(player.id);
});
