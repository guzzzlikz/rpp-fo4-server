"use strict";
// Modular Pip-Boy: what a character's wrist and pockets let them use. The server decides the
// capability mask (src/server/pipboy.ts) from the devices they carry, staff grants and a cracked
// Pip-Boy, keeps it in SQLite and sends it to their client, which applies what FMP lets a script
// touch (src/client/pipboy.ts). See docs/resources/fmp-gamemode.md, "Pip-Boy".
//
//   server -> client  state  PipboyState, on login and whenever the mask changes
Object.defineProperty(exports, "__esModule", { value: true });
exports.readPipboyState = exports.PipboyEvents = exports.parseCap = exports.describeMask = exports.has = exports.kHudCaps = exports.kCapNames = exports.Cap = void 0;
exports.Cap = {
    none: 0x0000,
    compass: 0x0001,
    geiger: 0x0002,
    biomonitor: 0x0004,
    map: 0x0008,
    gps: 0x0010,
    radio: 0x0020,
    flashlight: 0x0040,
    vats: 0x0080,
    holotape: 0x0100,
    full: 0xffff,
};
// Single capabilities, in display order: "none" and "full" are not flags of their own.
exports.kCapNames = ["compass", "geiger", "biomonitor", "map", "gps", "radio", "flashlight", "vats", "holotape"];
// What a HUD meter needs: any of these shows the HUD.
exports.kHudCaps = exports.Cap.compass | exports.Cap.geiger | exports.Cap.biomonitor;
const has = (mask, cap) => (mask & cap) === cap;
exports.has = has;
// "compass, map" or "full" / "none".
const describeMask = (mask) => {
    if ((mask & exports.Cap.full) === exports.Cap.full) {
        return "full";
    }
    const names = exports.kCapNames.filter((name) => (0, exports.has)(mask, exports.Cap[name]));
    return names.length > 0 ? names.join(", ") : "none";
};
exports.describeMask = describeMask;
// Names as players and staff type them ("vats", "full", "0x0081"); null for one that is none.
const parseCap = (text) => {
    const lower = text.trim().toLowerCase();
    if (Object.hasOwn(exports.Cap, lower)) {
        return exports.Cap[lower];
    }
    if (/^0x[0-9a-f]{1,4}$/.test(lower)) {
        return parseInt(lower.slice(2), 16);
    }
    return null;
};
exports.parseCap = parseCap;
exports.PipboyEvents = {
    state: "rp:pipboy:state",
};
const asRecord = (payload) => {
    if (typeof payload === "string") {
        try {
            payload = JSON.parse(payload);
        }
        catch {
            return {};
        }
    }
    return typeof payload === "object" && payload !== null ? payload : {};
};
const readPipboyState = (payload) => {
    const fields = asRecord(payload);
    const mask = fields["mask"];
    const menus = {};
    const blocked = fields["blockedMenus"];
    if (typeof blocked === "object" && blocked !== null) {
        for (const [menu, cap] of Object.entries(blocked)) {
            if (typeof cap === "number") {
                menus[menu] = cap;
            }
        }
    }
    return {
        enabled: fields["enabled"] === true,
        mask: typeof mask === "number" && Number.isInteger(mask) ? mask & exports.Cap.full : exports.Cap.full,
        cracked: fields["cracked"] === true,
        blockedMenus: menus,
        strictPipboyMenu: fields["strictPipboyMenu"] === true,
        hideHud: fields["hideHud"] === true,
    };
};
exports.readPipboyState = readPipboyState;
