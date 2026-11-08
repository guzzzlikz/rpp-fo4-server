// Map markers of Fallout4.esm, all in the Commonwealth worldspace: where fast travel puts the player.
// The last ones each stand in front of a placed reference the world object tests use. An interior
// place names its cell instead: the player lands at the persistent reference the server picks inside
// it, and its position is not used.

import type { Point } from "../shared/auth";

export interface Place {
    position: Point;
    heading: number;
    // The interior cell's form ID; absent for a place in the Commonwealth.
    interiorCell?: number;
}

export const kCommonwealth = 0x3c;

const place = (x: number, y: number, z: number, heading: number): Place => ({ position: { x, y, z }, heading });

const interior = (cell: number): Place => ({ position: { x: 0, y: 0, z: 0 }, heading: 0, interiorCell: cell });

// The space a place is teleported to.
export const placeSpace = (where: Place): { worldSpace: number } | { interiorCell: number } => (where.interiorCell !== undefined ? { interiorCell: where.interiorCell } : { worldSpace: kCommonwealth });

export const Places = {
    sanctuary: place(-80768.2, 88174.8, 8199.0, 0.0), // SanctuaryMapMarker 0x72A48
    redrocket: place(-69379.0, 80148.0, 7341.8, 0.0), // RedRocketTruckStopMapMarker 0x24FBE
    concord: place(-57011.8, 70392.1, 6210.0, 2.356), // ConcordMuseumMapMarker 0x10985B
    lexington: place(-33029.7, 41006.2, 5372.5, 0.0), // LexingtonMapMarker 0x24F9C
    institute: place(-16775.3, 1159.7, 1117.0, 0.0), // InstituteMapMarker 0x2B7CC, the CIT ruins
    bunkerhill: place(18232.3, 14378.2, 1271.7, 0.0), // BunkerHillMonumentMapMarker 0x2B880
    bunker: place(20120.0, 101840.0, 1729.5, 0.0), // ReconBunkerThetaMapMarkerRef 0xBA83B
    airport: place(48073.9, -3332.0, 592.0, 3.953), // BoSAirportMapMarker 0x84BEB
    castle: place(48321.9, -46600.1, 1071.0, 0.0), // CastleMapMarkerRef 0x2BCA5
    island: place(74770.7, -59106.6, 1301.1, 2.044), // SpectacleIslandMapMarker 0x2CF9E
    quincy: place(27461.7, -85580.0, 1381.2, 3.142), // QuincyRuinsMapMarkerRef 0x2C611
    glowingsea: place(-56092.3, -78515.8, 3473.1, 4.583), // GlowingSeaEdgeMapMarker 0x15E9A7
    crater: place(-99710.9, -116049.8, 7938.1, 0.0), // GlowingSeaCraterMapMarkerREF 0xADD89
    gate: place(-78822.0, 88437.0, 7830.0, 3.9), // PicketFenceB_Gate01 0x75315, a plain door
    mailbox: place(-81300.0, 88010.0, 7720.0, 3.9), // SanctuaryMailbox 0xA8826 (look down to aim at it)
    mailbox2: place(-81305.0, 87875.0, 7720.0, 5.535), // the same mailbox from its other side
    suitcase: place(-79300.0, 88780.0, 7860.0, 5.45), // Loot_Prewar_Suitcase_Clothes 0xAE137, a container with loot
    safe: place(-75790.0, 88988.0, 7830.0, 3.59), // Loot_Prewar_Safe_Floor 0x670B7, locked (25)
    item: place(-79081.0, 89690.0, 7860.0, 0.0), // Kickball01 0xAED6A, a loose item (look down to aim at it)
    item2: place(-79176.0, 89785.0, 7860.0, 1.571), // the same kickball from its west
    museum: interior(0x17df7), // ConcordMuseum01, the Museum of Freedom
} as const satisfies Record<string, Place>;

export type PlaceName = keyof typeof Places;

export const findPlace = (name: string): Place | undefined => (Object.hasOwn(Places, name) ? Places[name as PlaceName] : undefined);

export const toVector = (point: Point): Vector3 => new Vector3(point.x, point.y, point.z);

// A point this far above another, for a camera to look at rather than into the ground.
export const above = (point: Point, height: number): Point => ({ x: point.x, y: point.y, z: point.z + height });

// Where a teleport lands, from a space a player reported or the database kept: the interior when there
// is one, else the worldspace, the Commonwealth when even that is unknown.
export const teleportSpace = (space: PlayerSpace | null): { worldSpace: number } | { interiorCell: number } => (space !== null && space.interiorCell !== 0 ? { interiorCell: space.interiorCell } : { worldSpace: space?.worldSpace || kCommonwealth });
