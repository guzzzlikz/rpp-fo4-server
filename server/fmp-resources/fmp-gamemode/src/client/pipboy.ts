// Modular Pip-Boy, the client's half: applies what the server decided (src/server/pipboy.ts) with what
// FMP lets a script touch. That is the HUD as a whole, and game menus closed as they open:
//   - the HUD shows only with a compass, a Geiger counter or a biomonitor (FMP cannot hide its meters
//     one by one, so the crosshair and notifications go with it);
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
    const wanted: boolean = !state.enabled || (state.mask & kHudCaps) !== 0;
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

const refuse = (name: string, why: string): void => {
    Ui.hideMenu(name);
    Hud.notify(why);
    console.log(`[pipboy] ${name} closed: ${why}`);
};

Events.on("menuOpen", (name: string): void => {
    if (!seenMenus.has(name)) {
        seenMenus.add(name);
        console.log(`[pipboy] menu opened: ${name}`);
    }
    if (state === null || !state.enabled) {
        return;
    }
    const needed: number | undefined = state.blockedMenus[name];
    if (needed !== undefined && !has(state.mask, needed)) {
        refuse(name, `Недоступно: нужно устройство (${describeMask(needed)})`);
        return;
    }
    if (name === "PipboyMenu" && state.strictPipboyMenu && (state.mask & kPipboyScreens) === 0) {
        refuse(name, state.cracked ? "Pip-Boy треснул" : "Нет Pip-Boy");
    }
});

// The game shows the HUD again behind some menus; hidden it stays.
Events.on("menuClose", (): void => {
    if (hudHidden) {
        setTimeout(applyHud, 0);
    }
});
