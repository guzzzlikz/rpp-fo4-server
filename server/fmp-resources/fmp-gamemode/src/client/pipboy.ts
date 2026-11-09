// Modular Pip-Boy, the client's half: applies what the server decided (src/server/pipboy.ts) with what
// FMP lets a script touch. That is the HUD as a whole, and game menus closed as they open:
//   - with hideHud, the HUD shows only with a compass, a Geiger counter or a biomonitor (FMP cannot
//     hide its meters one by one, so the crosshair and notifications go with it); without, it is the
//     game's own;
//   - each menu in blockedMenus ("VATSMenu" by default) is closed again at once without its capability;
//   - with strictPipboyMenu, the Pip-Boy does not open without map, radio, biomonitor or gps (its tabs
//     cannot be locked one by one).
// The first time a menu opens it is logged with [pipboy], to find the names worth blocking.

import { Cap, describeMask, has, kHudCaps, PipboyEvents, type PipboyState, readPipboyState } from "../shared/pipboy";

// The server sends the state right after placing the player, a moment before the login's fade puts
// the HUD back: this module has the last word.
const kApplyDelayMs = 1000;
const kPipboyScreens: number = Cap.map | Cap.radio | Cap.biomonitor | Cap.gps;

let state: PipboyState | null = null;
// Whether this module hid the HUD, so it shows it again only then.
let hudHidden = false;
const seenMenus = new Set<string>();

const applyHud = (): void => {
    if (state === null) {
        return;
    }
    const wanted: boolean = !state.enabled || !state.hideHud || (state.mask & kHudCaps) !== 0;
    if (!wanted && Hud.isVisible()) {
        Hud.setVisible(false);
        hudHidden = true;
    } else if (wanted && hudHidden) {
        Hud.setVisible(true);
        hudHidden = false;
    }
};

Events.on(PipboyEvents.state, (payload: unknown): void => {
    state = readPipboyState(payload);
    console.log(`[pipboy] ${state.enabled ? describeMask(state.mask) : "off"}${state.cracked ? " (cracked)" : ""}`);
    setTimeout(applyHud, kApplyDelayMs);
});

// Why a menu may not be open now; null when it may.
const refusal = (name: string): string | null => {
    if (state === null || !state.enabled) {
        return null;
    }
    const needed: number | undefined = state.blockedMenus[name];
    if (needed !== undefined && !has(state.mask, needed)) {
        return `Недоступно: нужно устройство (${describeMask(needed)})`;
    }
    if (name === "PipboyMenu" && state.strictPipboyMenu && (state.mask & kPipboyScreens) === 0) {
        return state.cracked ? "Pip-Boy треснул" : "Нет Pip-Boy";
    }
    return null;
};

// One notice per refusal streak, not one per press.
const kNoticeEveryMs = 2000;
let lastNotice = 0;

const refuse = (name: string, why: string): void => {
    Ui.hideMenu(name);
    const now: number = Date.now();
    if (now - lastNotice >= kNoticeEveryMs) {
        lastNotice = now;
        Hud.notify(why);
        console.log(`[pipboy] ${name} closed: ${why}`);
    }
};

Events.on("menuOpen", (name: string): void => {
    if (!seenMenus.has(name)) {
        seenMenus.add(name);
        console.log(`[pipboy] menu opened: ${name}`);
    }
    const why: string | null = refusal(name);
    if (why !== null) {
        refuse(name, why);
    }
});

// hideMenu lands next frame, and Tab pressed again and again opens the Pip-Boy between one close and
// the next, or opens it while it is still closing, which the close then misses. So while a menu is
// refused, look every few frames whether it is open anyway and close it again.
const kWatchMs = 100;
setInterval((): void => {
    if (state === null || !state.enabled) {
        return;
    }
    const menus: string[] = [...Object.keys(state.blockedMenus), ...(state.strictPipboyMenu ? ["PipboyMenu"] : [])];
    for (const name of menus) {
        const why: string | null = refusal(name);
        if (why !== null && Ui.isMenuOpen(name)) {
            refuse(name, why);
        }
    }
}, kWatchMs);

// The game shows the HUD again behind some menus; hidden it stays.
Events.on("menuClose", (): void => {
    if (hudHidden) {
        setTimeout(applyHud, 0);
    }
});
