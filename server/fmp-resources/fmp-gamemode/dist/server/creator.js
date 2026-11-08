"use strict";
// The character creator: what a character goes through on every login until it has run to its end
// once. It rides the game's own menus, as the Vault 111 exit does: the look editor, then the SPECIAL
// menu. The client says when each one closes (AuthEvents.menuClosed); the look is read and
// stored once the editor has closed, and the character is welcomed into the world after the last step.
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
exports.begin = exports.isCreating = void 0;
const auth_1 = require("../shared/auth");
const chat_1 = require("./chat");
const Database = __importStar(require("./database"));
// The login page fades out over about a second and a half; the editor opens once it has.
const kOpenDelayMs = 2500;
// The look is captured when the editor closes and replicated with the next report.
const kCaptureDelayMs = 1000;
const creations = new Map();
const isCreating = (player) => creations.has(player.id);
exports.isCreating = isCreating;
const finish = (creation) => {
    creations.delete(creation.player.id);
    Database.markCreated(creation.accountId);
    (0, chat_1.reply)(creation.player, Game.id === "fo76" ? `Welcome to Appalachia, ${creation.characterName}.` : `Welcome to the Commonwealth, ${creation.characterName}.`);
    console.log(`${creation.player.nickname}: ${creation.characterName} created`);
};
// After `kCaptureDelayMs`, so the look read is the one the editor closed on.
const storeLook = (creation) => {
    setTimeout(() => {
        if (creations.get(creation.player.id) !== creation) {
            return;
        }
        const appearance = creation.player.getAppearance();
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
        creation.step = auth_1.CreatorMenus.special;
        creation.player.openSpecialMenu();
    }, kCaptureDelayMs);
};
const begin = (player, accountId, characterName) => {
    const creation = { player, accountId, characterName, step: auth_1.CreatorMenus.look };
    creations.set(player.id, creation);
    setTimeout(() => {
        if (creations.get(player.id) === creation) {
            player.openLookEditor();
        }
    }, kOpenDelayMs);
};
exports.begin = begin;
Events.onClient(auth_1.AuthEvents.menuClosed, (sender, payload) => {
    const creation = creations.get(sender.id);
    const menu = typeof payload === "object" && payload !== null ? payload["menu"] : undefined;
    if (creation === undefined || !(0, auth_1.isCreatorMenu)(menu) || menu !== creation.step) {
        return;
    }
    if (menu === auth_1.CreatorMenus.look) {
        storeLook(creation);
    }
    else {
        finish(creation);
    }
});
Events.on("playerDisconnect", (player) => {
    creations.delete(player.id);
});
