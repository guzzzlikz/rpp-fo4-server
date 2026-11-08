"use strict";
// The camera behind the login page: the fly camera, flown from code through the shots the server
// sends. Each shot glides from one point to another while looking at a landmark; between shots the
// screen dips to black so the cut never shows. The game keeps the cells around the player loaded,
// so the server places every shot within reach of where it holds the player.
Object.defineProperty(exports, "__esModule", { value: true });
exports.stop = exports.start = exports.isRunning = void 0;
const kTickMs = 16;
const kDipSeconds = 0.8;
const kTurn = Math.PI * 2;
// The login page covers the left of the screen: aim this far left of the landmark so it sits in the
// right of the frame, beside the page rather than behind it.
const kSubjectOffset = 0.22;
let shots = [];
let index = 0;
let shotStartedAt = 0;
let timer = null;
let dipping = false;
const smoothstep = (t) => t * t * (3 - 2 * t);
const wrap = (angle) => ((angle % kTurn) + kTurn) % kTurn;
const lerp = (from, to, k) => ({ x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, z: from.z + (to.z - from.z) * k });
// Pitch is positive looking down; yaw 0 faces +Y, clockwise, in [0, 2pi).
const aim = (from, at) => {
    const dx = at.x - from.x;
    const dy = at.y - from.y;
    return { pitch: Math.atan2(from.z - at.z, Math.hypot(dx, dy)), yaw: wrap(Math.atan2(dx, dy)) };
};
const place = (shot, t) => {
    const at = lerp(shot.from, shot.to, smoothstep(Math.min(Math.max(t, 0), 1)));
    const { pitch, yaw } = aim(at, shot.lookAt);
    NoClip.setPosition(at.x, at.y, at.z);
    NoClip.setRotation(pitch, wrap(yaw - kSubjectOffset));
};
const next = () => {
    dipping = true;
    Hud.fade({ duration: kDipSeconds, hold: true });
    setTimeout(() => {
        if (timer === null) {
            return;
        }
        index = (index + 1) % shots.length;
        shotStartedAt = Date.now();
        dipping = false;
        const shot = shots[index];
        if (shot !== undefined) {
            place(shot, 0);
        }
        Hud.fade({ out: false, duration: kDipSeconds });
    }, kDipSeconds * 1000);
};
const tick = () => {
    const shot = shots[index];
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
    const t = (Date.now() - shotStartedAt) / (shot.seconds * 1000);
    place(shot, t);
    if (t >= 1 && shots.length > 1) {
        next();
    }
};
const isRunning = () => timer !== null;
exports.isRunning = isRunning;
const start = (sequence) => {
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
exports.start = start;
const stop = () => {
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
exports.stop = stop;
