// The login page: a full-screen CEF view over the cinematic. The page talks to this script through
// callEvent ("login:ready", "login:submit") and hears back through one "login:state" event carrying
// everything it shows; the server's side of the conversation is in src/server/accounts.ts.

import { type AuthPrompt, type AuthSubmit, readAuthSubmit } from "../shared/auth";
import { errorMessage } from "../shared/errors";

// What the page shows: the server's prompt, without the camera's shots, and where the form stands.
export type LoginState = Omit<AuthPrompt, "shots"> & { busy: boolean; done: boolean };

export type SubmitHandler = (submitted: AuthSubmit) => void;

const kPage = "fw://resources/fmp-gamemode/ui/login/index.html";
const kPageEvents = { ready: "login:ready", submit: "login:submit", state: "login:state" } as const;
const kZIndex = 200;

let view = -1;
let pageReady = false;
let state: LoginState | null = null;
// Told once, when the page has loaded and can be seen.
let onReady: (() => void) | null = null;

const push = (): void => {
    if (view >= 0 && pageReady && state !== null) {
        Web.emit(view, kPageEvents.state, state);
    }
};

const update = (changes: Partial<LoginState>): void => {
    if (state !== null) {
        state = { ...state, ...changes };
        push();
    }
};

const create = (onSubmit: SubmitHandler): void => {
    const screen: { width: number; height: number } = Web.getScreenSize();
    try {
        view = Web.createView(kPage, { width: screen.width, height: screen.height, x: 0, y: 0, zIndex: kZIndex, visible: true, focus: false });
    } catch (thrown: unknown) {
        console.error(`could not create the login view: ${errorMessage(thrown)}`);
        view = -1;
        return;
    }
    pageReady = false;

    // Focus waits for the page: a page that never loads must not take input it cannot give back.
    Web.on(view, kPageEvents.ready, (): void => {
        pageReady = true;
        Web.focusView(view, true);
        push();
        const ready: (() => void) | null = onReady;
        onReady = null;
        ready?.();
    });
    Web.on(view, kPageEvents.submit, (payload?: unknown): void => {
        onSubmit(readAuthSubmit(payload));
    });
};

// Creates the page before there is anything to show on it, so that it is loaded and painted by the
// time the server's prompt arrives: the page's own "Connecting to the server" stands until then. A
// view takes a moment to paint its first frame after it has loaded, which is a moment the player
// would otherwise spend looking at the world between the loading screen and the page.
export const preload = (onSubmit: SubmitHandler): void => {
    if (view < 0) {
        create(onSubmit);
    }
};

// Shows the page with the server's prompt; `onShown` is called once it has loaded and can be seen,
// at once when it already has. A page that fails to load never calls it.
export const show = (prompt: AuthPrompt, onSubmit: SubmitHandler, onShown?: () => void): void => {
    const { shots: _shots, ...shown }: AuthPrompt = prompt;
    state = { ...shown, busy: false, done: false };
    if (view < 0) {
        onReady = onShown ?? null;
        create(onSubmit);
    } else if (pageReady) {
        onShown?.();
    } else {
        onReady = onShown ?? null;
    }
    push();
};

export const setBusy = (): void => {
    update({ busy: true, error: null });
};

// Plays the page's way out and gives input back to the game; the view goes with close().
export const finish = (): void => {
    update({ busy: false, done: true, error: null });
    if (view >= 0) {
        Web.focusView(view, false);
    }
};

export const close = (): void => {
    if (view >= 0) {
        Web.destroyView(view);
    }
    view = -1;
    pageReady = false;
    state = null;
    onReady = null;
};
