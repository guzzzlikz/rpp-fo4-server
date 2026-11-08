// The emote wheel: P opens a full-screen page over the game with this server's emotes around a ring;
// a click plays one, the centre stops it, and P, Esc or a right click closes the wheel. The server
// plays the idle, so everyone around sees it (src/server/emotes.ts). Open only once logged in.

import { AuthEvents } from "../shared/auth";
import { type EmoteEntry, EmoteEvents, readEmoteList } from "../shared/emotes";
import { errorMessage } from "../shared/errors";

const kPage = "fw://resources/fmp-gamemode/ui/emotes/index.html";
const kKey = "p";
// Under the login page (200), over the HUD.
const kZIndex = 150;
const kPageEvents = { ready: "wheel:ready", pick: "wheel:pick", stop: "wheel:stop", close: "wheel:close", open: "wheel:open" } as const;

let view = -1;
let pageReady = false;
let isOpen = false;
let loggedIn = false;
let emotes: EmoteEntry[] = [];

const askList = (): void => {
    Events.emitServer(EmoteEvents.list);
};

const close = (): void => {
    isOpen = false;
    if (view >= 0) {
        Web.focusView(view, false);
        Web.hideView(view);
    }
};

// Shows the wheel once the page can draw it.
const present = (): void => {
    if (!isOpen || view < 0 || !pageReady) {
        return;
    }
    Web.emit(view, kPageEvents.open, { emotes });
    Web.showView(view);
    Web.focusView(view, true);
};

const create = (): boolean => {
    const screen: { width: number; height: number } = Web.getScreenSize();
    try {
        view = Web.createView(kPage, { width: screen.width, height: screen.height, x: 0, y: 0, zIndex: kZIndex, visible: false, focus: false });
    } catch (thrown: unknown) {
        console.error(`could not create the emote wheel: ${errorMessage(thrown)}`);
        view = -1;
        return false;
    }
    pageReady = false;
    Web.on(view, kPageEvents.ready, (): void => {
        pageReady = true;
        present();
    });
    Web.on(view, kPageEvents.pick, (payload?: unknown): void => {
        close();
        if (typeof payload === "string" && payload !== "") {
            Events.emitServer(EmoteEvents.play, { name: payload });
        }
    });
    Web.on(view, kPageEvents.stop, (): void => {
        close();
        Events.emitServer(EmoteEvents.stop);
    });
    Web.on(view, kPageEvents.close, close);
    return true;
};

const open = (): void => {
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

Events.on(EmoteEvents.list, (payload: unknown): void => {
    emotes = readEmoteList(payload).emotes;
    if (isOpen && view >= 0 && pageReady) {
        Web.emit(view, kPageEvents.open, { emotes });
    }
});

Events.on(AuthEvents.done, (): void => {
    loggedIn = true;
    askList();
});

// While the page has focus it takes the keys itself (P and Esc close it there); this fires only while
// the game has input.
Key.bind(kKey, "down", (): void => {
    if (isOpen) {
        close();
    } else {
        open();
    }
});
