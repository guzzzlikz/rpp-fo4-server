// The camera behind the login page: the fly camera, flown from code through the shots the server
// sends. Each shot glides from one point to another while looking at a landmark; between shots the
// screen dips to black so the cut never shows. The game keeps the cells around the player loaded,
// so the server places every shot within reach of where it holds the player.

import type { CinematicShot, Point } from "../shared/auth";

interface Aim {
    pitch: number;
    yaw: number;
}

const kTickMs = 16;
const kDipSeconds = 0.8;
const kTurn: number = Math.PI * 2;
// The login page covers the left of the screen: aim this far left of the landmark so it sits in the
// right of the frame, beside the page rather than behind it.
const kSubjectOffset = 0.22;

let shots: readonly CinematicShot[] = [];
let index = 0;
let shotStartedAt = 0;
let timer: number | null = null;
let dipping = false;

const smoothstep = (t: number): number => t * t * (3 - 2 * t);

const wrap = (angle: number): number => ((angle % kTurn) + kTurn) % kTurn;

const lerp = (from: Point, to: Point, k: number): Point => ({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k });

// Pitch is positive looking down; yaw 0 faces +Y, clockwise, in [0, 2pi).
const aim = (from: Point, at: Point): Aim => {
    const dx: number = at.x - from.x;
    const dy: number = at.y - from.y;
    return { pitch: Math.atan2(from.z - at.z, Math.hypot(dx, dy)), yaw: wrap(Math.atan2(dx, dy)) };
};

const place = (shot: CinematicShot, t: number): void => {
    const at: Point = lerp(shot.from, shot.to, smoothstep(Math.min(Math.max(t, 0), 1)));
    const { pitch, yaw }: Aim = aim(at, shot.lookAt);
    NoClip.setPosition(at.x, at.y, at.z);
    NoClip.setRotation(pitch, wrap(yaw - kSubjectOffset));
};

const next = (): void => {
    dipping = true;
    Hud.fade({ duration: kDipSeconds, hold: true });
    setTimeout((): void => {
        if (timer === null) {
            return;
        }
        index = (index + 1) % shots.length;
        shotStartedAt = Date.now();
        dipping = false;
        const shot: CinematicShot | undefined = shots[index];
        if (shot !== undefined) {
            place(shot, 0);
        }
        Hud.fade({ out: false, duration: kDipSeconds });
    }, kDipSeconds * 1000);
};

const tick = (): void => {
    const shot: CinematicShot | undefined = shots[index];
    if (shot === undefined) {
        return;
    }
    // A teleport or a cell load can take the camera back; take it again.
    if (!NoClip.isEnabled() && !NoClip.enable()) {
        return;
    }
    if (dipping) {
        return;
    }
    const t: number = (Date.now() - shotStartedAt) / (shot.seconds * 1000);
    place(shot, t);
    if (t >= 1 && shots.length > 1) {
        next();
    }
};

export const isRunning = (): boolean => timer !== null;

export const start = (sequence: readonly CinematicShot[]): void => {
    if (sequence.length === 0) {
        return;
    }
    shots = sequence;
    if (timer === null) {
        index = 0;
        shotStartedAt = Date.now();
        dipping = false;
        timer = setInterval(tick, kTickMs);
    }
};

export const stop = (): void => {
    if (timer !== null) {
        clearInterval(timer);
        timer = null;
    }
    shots = [];
    dipping = false;
    if (NoClip.isEnabled()) {
        NoClip.disable();
    }
};
