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
// Shows the wheel once the page can draw it.
const present = () => {
    if (!isOpen || view < 0 || !pageReady) {
        return;
    }
    Web.emit(view, kPageEvents.open, { emotes });
    Web.showView(view);
    Web.focusView(view, true);
};
const create = () => {
    const screen = Web.getScreenSize();
    try {
        view = Web.createView(kPage, { width: screen.width, height: screen.height, x: 0, y: 0, zIndex: kZIndex, visible: false, focus: false });
    }
    catch (thrown) {
        console.error(`could not create the emote wheel: ${(0, errors_1.errorMessage)(thrown)}`);
        view = -1;
        return false;
    }
    pageReady = false;
    Web.on(view, kPageEvents.ready, () => {
        pageReady = true;
        present();
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
        return;
    }
    if (view < 0 && !create()) {
        return;
    }
    isOpen = true;
    if (emotes.length === 0) {
        askList();
    }
    present();
};
Events.on(emotes_1.EmoteEvents.list, (payload) => {
    emotes = (0, emotes_1.readEmoteList)(payload).emotes;
    if (isOpen && view >= 0 && pageReady) {
        Web.emit(view, kPageEvents.open, { emotes });
    }
});
Events.on(auth_1.AuthEvents.done, () => {
    loggedIn = true;
    askList();
});
// While the page has focus it takes the keys itself (P and Esc close it there); this fires only while
// the game has input.
Key.bind(kKey, "down", () => {
    if (isOpen) {
        close();
    }
    else {
        open();
    }
});
