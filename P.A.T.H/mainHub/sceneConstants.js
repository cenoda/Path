// Scene-wide numeric constants and coordinate conversion helpers.
// Keeping these in a dedicated module reduces cognitive load in scene.js.

export const WORLD_SIZE = 200000; // total world width/height (world-units)
export const WORLD_SCALE = 0.15; // scene-units per world-unit
export const CHUNK_SIZE = 4000; // spatial-partition chunk edge (world-units)
export const DRAG_SENSITIVITY = 0.55; // 0..1 lower = less sensitive drag
export const WORLD_HALF = WORLD_SIZE / 2; // convenience: max |world coord|

export const REMOTE_POS_LERP = 0.12; // remote player interpolation factor
export const REMOTE_STALE_REMOVE_MS = 12000; // remove unseen remote balloons

export const BALLOON_COLLISION_REPEL = 0.24;
export const BALLOON_COLLISION_DAMP = 0.84;
export const BALLOON_COLLISION_MAX_PUSH = 18;

// ── 3D Orbit Camera constants ────────────────────────────────────────────
export const ORBIT_DEFAULT_THETA = Math.PI * 0.25;   // initial horizontal angle
export const ORBIT_DEFAULT_PHI = Math.PI * 0.3;      // initial vertical angle (from zenith)
export const ORBIT_MIN_PHI = 0.15;                   // prevent flipping over top
export const ORBIT_MAX_PHI = Math.PI * 0.48;         // prevent flipping under ground
export const ORBIT_DEFAULT_RADIUS = 600;             // initial camera distance
export const ORBIT_MIN_RADIUS = 200;                 // closest zoom
export const ORBIT_MAX_RADIUS = 3000;                // farthest zoom
export const ORBIT_ROTATE_SPEED = 0.004;             // radians per pixel of drag
export const ORBIT_PAN_SPEED = 0.6;                  // pan units per pixel
export const ORBIT_DAMPING = 0.92;                   // inertia damping factor
export const GROUND_Y = 0;                           // ground plane Y level
export const BALLOON_FLOAT_Y = 80;                   // default balloon height above ground

export const AURA_COLORS = {
    none: null,
    sun: 0xffc44d,
    frost: 0x7fd9ff,
    forest: 0x67d57a,
    cosmic: 0x9e8dff,
    royal: 0xe08bff
};

// Legacy 2D helpers kept for backward compat (coordinate overlay, etc.)
export function worldToScene(value) {
    return -value * WORLD_SCALE;
}

export function sceneToWorld(value) {
    return -value / WORLD_SCALE;
}

/** Convert world coords (X,Y flat plane) to Three.js scene coords (X, 0, Z). */
export function worldToScene3D(worldX, worldY) {
    return {
        x: worldX * WORLD_SCALE,
        y: BALLOON_FLOAT_Y,
        z: worldY * WORLD_SCALE,
    };
}

/** Convert Three.js scene coords (X, ?, Z) back to world coords (X,Y flat). */
export function sceneToWorld3D(sceneX, sceneZ) {
    return {
        x: sceneX / WORLD_SCALE,
        y: sceneZ / WORLD_SCALE,
    };
}
