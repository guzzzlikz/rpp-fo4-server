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

// Hands the page the list; before it has loaded, its ready event does this instead.
const pushList = (): void => {
    if (isOpen && view >= 0 && pageReady) {
        Web.emit(view, kPageEvents.open, { emotes });
    }
};

// Shows the wheel at once. It is not held back until the page has loaded: a view created hidden may
// never load while hidden, and then the wheel never showed at all.
const present = (): void => {
    if (!isOpen || view < 0) {
        return;
    }
    Web.showView(view);
    Web.focusView(view, true);
    pushList();
};

const create = (): boolean => {
    const screen: { width: number; height: number } = Web.getScreenSize();
    try {
        // Created visible, as the login page is, so it loads; it is hidden again once it has.
        view = Web.createView(kPage, { width: screen.width, height: screen.height, x: 0, y: 0, zIndex: kZIndex, visible: true, focus: false });
    } catch (thrown: unknown) {
        console.error(`[emotes] could not create the wheel: ${errorMessage(thrown)}`);
        view = -1;
        return false;
    }
    console.log(`[emotes] wheel view ${view} created`);
    pageReady = false;
    Web.on(view, kPageEvents.ready, (): void => {
        pageReady = true;
        console.log("[emotes] wheel page loaded");
        if (isOpen) {
            pushList();
        } else {
            Web.hideView(view);
        }
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
Events.on(EmoteEvents.list, (payload: unknown): void => {
    emotes = readEmoteList(payload).emotes;
    console.log(`[emotes] list: ${emotes.map((emote: EmoteEntry): string => emote.name).join(", ") || "empty"}`);
    pushList();
});

Events.on(AuthEvents.done, (): void => {
    loggedIn = true;
    askList();
    // Loaded now, while nothing is asked of it, so the first P shows a page that is already there.
    if (view < 0) {
        create();
    }
});

// While the page has focus it takes the keys itself (P and Esc close it there); this fires only while
// the game has input.
const bound: boolean = Key.bind(kKey, "down", (): void => {
    if (isOpen) {
        close();
    } else {
        open();
    }
});
console.log(`[emotes] key ${kKey.toUpperCase()} ${bound ? "bound" : "NOT bound"} to the wheel`);
