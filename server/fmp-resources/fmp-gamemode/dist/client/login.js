"use strict";
// The login page: a full-screen CEF view over the cinematic. The page talks to this script through
// callEvent ("login:ready", "login:submit") and hears back through one "login:state" event carrying
// everything it shows; the server's side of the conversation is in src/server/accounts.ts.
Object.defineProperty(exports, "__esModule", { value: true });
exports.close = exports.finish = exports.setBusy = exports.show = exports.preload = void 0;
const auth_1 = require("../shared/auth");
const errors_1 = require("../shared/errors");
const kPage = "fw://resources/fmp-gamemode/ui/login/index.html";
const kPageEvents = { ready: "login:ready", submit: "login:submit", state: "login:state" };
const kZIndex = 200;
let view = -1;
let pageReady = false;
let state = null;
// Told once, when the page has loaded and can be seen.
let onReady = null;
const push = () => {
    if (view >= 0 && pageReady && state !== null) {
        Web.emit(view, kPageEvents.state, state);
    }
};
const update = (changes) => {
    if (state !== null) {
        state = { ...state, ...changes };
        push();
    }
};
const create = (onSubmit) => {
    const screen = Web.getScreenSize();
    try {
        view = Web.createView(kPage, { width: screen.width, height: screen.height, x: 0, y: 0, zIndex: kZIndex, visible: true, focus: false });
    }
    catch (thrown) {
        console.error(`could not create the login view: ${(0, errors_1.errorMessage)(thrown)}`);
        view = -1;
        return;
    }
    pageReady = false;
    // Focus waits for the page: a page that never loads must not take input it cannot give back.
    Web.on(view, kPageEvents.ready, () => {
        pageReady = true;
        Web.focusView(view, true);
        push();
        const ready = onReady;
        onReady = null;
        ready?.();
    });
    Web.on(view, kPageEvents.submit, (payload) => {
        onSubmit((0, auth_1.readAuthSubmit)(payload));
    });
};
// Creates the page before there is anything to show on it, so that it is loaded and painted by the
// time the server's prompt arrives: the page's own "Connecting to the server" stands until then. A
// view takes a moment to paint its first frame after it has loaded, which is a moment the player
// would otherwise spend looking at the world between the loading screen and the page.
const preload = (onSubmit) => {
    if (view < 0) {
        create(onSubmit);
    }
};
exports.preload = preload;
// Shows the page with the server's prompt; `onShown` is called once it has loaded and can be seen,
// at once when it already has. A page that fails to load never calls it.
const show = (prompt, onSubmit, onShown) => {
    const { shots: _shots, ...shown } = prompt;
    state = { ...shown, busy: false, done: false };
    if (view < 0) {
        onReady = onShown ?? null;
        create(onSubmit);
    }
    else if (pageReady) {
        onShown?.();
    }
    else {
        onReady = onShown ?? null;
    }
    push();
};
exports.show = show;
const setBusy = () => {
    update({ busy: true, error: null });
};
exports.setBusy = setBusy;
// Plays the page's way out and gives input back to the game; the view goes with close().
const finish = () => {
    update({ busy: false, done: true, error: null });
    if (view >= 0) {
        Web.focusView(view, false);
    }
};
exports.finish = finish;
const close = () => {
    if (view >= 0) {
        Web.destroyView(view);
    }
    view = -1;
    pageReady = false;
    state = null;
    onReady = null;
};
exports.close = close;
