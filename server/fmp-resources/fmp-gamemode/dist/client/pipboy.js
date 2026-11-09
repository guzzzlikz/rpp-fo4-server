"use strict";
// Modular Pip-Boy, the client's half: applies what the server decided (src/server/pipboy.ts) with what
// FMP lets a script touch. That is the HUD as a whole, and game menus closed as they open:
//   - the HUD shows only with a compass, a Geiger counter or a biomonitor (FMP cannot hide its meters
//     one by one, so the crosshair and notifications go with it);
//   - each menu in blockedMenus ("VATSMenu" by default) is closed again at once without its capability;
//   - with strictPipboyMenu, the Pip-Boy does not open without map, radio, biomonitor or gps (its tabs
//     cannot be locked one by one).
// The first time a menu opens it is logged with [pipboy], to find the names worth blocking.
Object.defineProperty(exports, "__esModule", { value: true });
const pipboy_1 = require("../shared/pipboy");
// The server sends the state right after placing the player, a moment before the login's fade puts
// the HUD back: this module has the last word.
const kApplyDelayMs = 1000;
const kPipboyScreens = pipboy_1.Cap.map | pipboy_1.Cap.radio | pipboy_1.Cap.biomonitor | pipboy_1.Cap.gps;
let state = null;
// Whether this module hid the HUD, so it shows it again only then.
let hudHidden = false;
const seenMenus = new Set();
const applyHud = () => {
    if (state === null) {
        return;
    }
    const wanted = !state.enabled || (state.mask & pipboy_1.kHudCaps) !== 0;
    if (!wanted && Hud.isVisible()) {
        Hud.setVisible(false);
        hudHidden = true;
    }
    else if (wanted && hudHidden) {
        Hud.setVisible(true);
        hudHidden = false;
    }
};
Events.on(pipboy_1.PipboyEvents.state, (payload) => {
    state = (0, pipboy_1.readPipboyState)(payload);
    console.log(`[pipboy] ${state.enabled ? (0, pipboy_1.describeMask)(state.mask) : "off"}${state.cracked ? " (cracked)" : ""}`);
    setTimeout(applyHud, kApplyDelayMs);
});
const refuse = (name, why) => {
    Ui.hideMenu(name);
    Hud.notify(why);
    console.log(`[pipboy] ${name} closed: ${why}`);
};
Events.on("menuOpen", (name) => {
    if (!seenMenus.has(name)) {
        seenMenus.add(name);
        console.log(`[pipboy] menu opened: ${name}`);
    }
    if (state === null || !state.enabled) {
        return;
    }
    const needed = state.blockedMenus[name];
    if (needed !== undefined && !(0, pipboy_1.has)(state.mask, needed)) {
        refuse(name, `Недоступно: нужно устройство (${(0, pipboy_1.describeMask)(needed)})`);
        return;
    }
    if (name === "PipboyMenu" && state.strictPipboyMenu && (state.mask & kPipboyScreens) === 0) {
        refuse(name, state.cracked ? "Pip-Boy треснул" : "Нет Pip-Boy");
    }
});
// The game shows the HUD again behind some menus; hidden it stays.
Events.on("menuClose", () => {
    if (hudHidden) {
        setTimeout(applyHud, 0);
    }
});
