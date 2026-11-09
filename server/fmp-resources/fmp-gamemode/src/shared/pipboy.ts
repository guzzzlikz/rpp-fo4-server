// Modular Pip-Boy: what a character's wrist and pockets let them use. The server decides the
// capability mask (src/server/pipboy.ts) from the devices they carry, staff grants and a cracked
// Pip-Boy, keeps it in SQLite and sends it to their client, which applies what FMP lets a script
// touch (src/client/pipboy.ts). See docs/resources/fmp-gamemode.md, "Pip-Boy".
//
//   server -> client  state  PipboyState, on login and whenever the mask changes

export const Cap = {
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
} as const;

export type CapName = keyof typeof Cap;

// Single capabilities, in display order: "none" and "full" are not flags of their own.
export const kCapNames: readonly CapName[] = ["compass", "geiger", "biomonitor", "map", "gps", "radio", "flashlight", "vats", "holotape"];

// What a HUD meter needs: any of these shows the HUD.
export const kHudCaps: number = Cap.compass | Cap.geiger | Cap.biomonitor;

export const has = (mask: number, cap: number): boolean => (mask & cap) === cap;

// "compass, map" or "full" / "none".
export const describeMask = (mask: number): string => {
    if ((mask & Cap.full) === Cap.full) {
        return "full";
    }
    const names: string[] = kCapNames.filter((name: CapName): boolean => has(mask, Cap[name]));
    return names.length > 0 ? names.join(", ") : "none";
};

// Names as players and staff type them ("vats", "full", "0x0081"); null for one that is none.
export const parseCap = (text: string): number | null => {
    const lower: string = text.trim().toLowerCase();
    if (Object.hasOwn(Cap, lower)) {
        return Cap[lower as CapName];
    }
    if (/^0x[0-9a-f]{1,4}$/.test(lower)) {
        return parseInt(lower.slice(2), 16);
    }
    return null;
};

export const PipboyEvents = {
    state: "rp:pipboy:state",
} as const;

export interface PipboyState {
    // False: the module is off on this server and nothing is restricted.
    enabled: boolean;
    mask: number;
    cracked: boolean;
    // Game menus closed on opening, each by the capability that allows it ("VATSMenu" -> vats).
    blockedMenus: Record<string, number>;
    // No Pip-Boy screen at all without one of map, radio, biomonitor or gps: FMP cannot lock its tabs.
    strictPipboyMenu: boolean;
    // Hide the whole HUD without compass, geiger or biomonitor. Off: the HUD is the game's own.
    hideHud: boolean;
}

const asRecord = (payload: unknown): Record<string, unknown> => {
    if (typeof payload === "string") {
        try {
            payload = JSON.parse(payload);
        } catch {
            return {};
        }
    }
    return typeof payload === "object" && payload !== null ? (payload as Record<string, unknown>) : {};
};

export const readPipboyState = (payload: unknown): PipboyState => {
    const fields = asRecord(payload);
    const mask: unknown = fields["mask"];
    const menus: Record<string, number> = {};
    const blocked: unknown = fields["blockedMenus"];
    if (typeof blocked === "object" && blocked !== null) {
        for (const [menu, cap] of Object.entries(blocked as Record<string, unknown>)) {
            if (typeof cap === "number") {
                menus[menu] = cap;
            }
        }
    }
    return {
        enabled: fields["enabled"] === true,
        mask: typeof mask === "number" && Number.isInteger(mask) ? mask & Cap.full : Cap.full,
        cracked: fields["cracked"] === true,
        blockedMenus: menus,
        strictPipboyMenu: fields["strictPipboyMenu"] === true,
        hideHud: fields["hideHud"] === true,
    };
};
