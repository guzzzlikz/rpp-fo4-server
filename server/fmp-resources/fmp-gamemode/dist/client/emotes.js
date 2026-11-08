"use strict";
// The emote wheel: P opens a full-screen page over the game with this server's emotes around a ring;
// a click plays one, the centre stops it, and P, Esc or a right click closes the wheel. The server
// plays the idle, so everyone around sees it (src/server/emotes.ts). Open only once logged in.
Object.defineProperty(exports, "__esModule", { value: true });
const auth_1 = require("../shared/auth");
const emotes_1 = require("../shared/emotes");
const errors_1 = require("../shared/errors");
const kPage = "fw://resources/fmp-gamemode/ui/emotes/index.html";
const kKey = "p";
// Under the login page (200), over the HUD.
const kZIndex = 150;
const kPageEvents = { ready: "wheel:ready", pick: "wheel:pick", stop: "wheel:stop", close: "wheel:close", open: "wheel:open" };
let view = -1;
let pageReady = false;
let isOpen = false;
let loggedIn = false;
let emotes = [];
const askList = () => {
    Events.emitServer(emotes_1.EmoteEvents.list);
};
const close = () => {
    isOpen = false;
    if (view >= 0) {
        Web.focusView(view, false);
        Web.hideView(view);
    }
};
// Hands the page the list; before it has loaded, its ready event does this instead.
const pushList = () => {
    if (isOpen && view >= 0 && pageReady) {
        Web.emit(view, kPageEvents.open, { emotes });
    }
};
// Shows the wheel at once. It is not held back until the page has loaded: a view created hidden may
// never load while hidden, and then the wheel never showed at all.
const present = () => {
    if (!isOpen || view < 0) {
        return;
    }
    Web.showView(view);
    Web.focusView(view, true);
    pushList();
};
const create = () => {
    const screen = Web.getScreenSize();
    try {
        // Created visible, as the login page is, so it loads; it is hidden again once it has.
        view = Web.createView(kPage, { width: screen.width, height: screen.height, x: 0, y: 0, zIndex: kZIndex, visible: true, focus: false });
    }
    catch (thrown) {
        console.error(`[emotes] could not create the wheel: ${(0, errors_1.errorMessage)(thrown)}`);
        view = -1;
        return false;
    }
    console.log(`[emotes] wheel view ${view} created`);
    pageReady = false;
    Web.on(view, kPageEvents.ready, () => {
        pageReady = true;
        console.log("[emotes] wheel page loaded");
        if (isOpen) {
            pushList();
        }
        else {
            Web.hideView(view);
        }
    });
    Web.on(view, kPageEvents.pick, (payload) => {
        close();
        if (typeof payload === "string" && payload !== "") {
            Events.emitServer(emotes_1.EmoteEvents.play, { name: payload });
        }
    });
    Web.on(view, kPageEvents.stop, () => {
        close();
        Events.emitServer(emotes_1.EmoteEvents.stop);
    });
    Web.on(view, kPageEvents.close, close);
    return true;
};
const open = () => {
    if (!loggedIn || LocalPlayer.isDead()) {
        console.log(`[emotes] P ignored: ${!loggedIn ? "not logged in" : "down"}`);
        return;
    }
    console.log(`[emotes] opening the wheel (${emotes.length} emote(s))`);
    if (view < 0 && !create()) {
        return;
    }
    isOpen = true;
    if (emotes.length === 0) {
        askList();
    }
    present();
};
// On request, and again whenever staff change the list (/emote add, /emote remove).
Events.on(emotes_1.EmoteEvents.list, (payload) => {
    emotes = (0, emotes_1.readEmoteList)(payload).emotes;
    console.log(`[emotes] list: ${emotes.map((emote) => emote.name).join(", ") || "empty"}`);
    pushList();
});
Events.on(auth_1.AuthEvents.done, () => {
    loggedIn = true;
    askList();
    // Loaded now, while nothing is asked of it, so the first P shows a page that is already there.
    if (view < 0) {
        create();
    }
});
// While the page has focus it takes the keys itself (P and Esc close it there); this fires only while
// the game has input.
const bound = Key.bind(kKey, "down", () => {
    if (isOpen) {
        close();
    }
    else {
        open();
    }
});
console.log(`[emotes] key ${kKey.toUpperCase()} ${bound ? "bound" : "NOT bound"} to the wheel`);
