/**
 * World state manager for the P.A.T.H large-scale world.
 *
 * Architecture:
 *  - WORLD_SIZE  : 200,000 × 200,000 world-unit plane
 *  - WORLD_SEED  : fixed deterministic seed so all clients render the same props
 *
 * Sync model:
 *  - Global realtime broadcast (no chunk/room partitioning for player presence)
 *  - Each client receives all connected player snapshots and movement events
 *
 * Interaction broadcast:
 *  Interactable props (sky-islands, buildings, etc.) emit 'interaction:trigger'
 *  events to the server.  The server fans out 'interaction:update' to players
 *  in the affected area and persists the per-prop state in memory.
 */

'use strict';

const pool = require('./db');

const WORLD_SIZE       = 200000; // total world width/height in world-units
const WORLD_SEED       = 777;     // fixed seed distributed to every client
const MAX_PROP_ID_LEN  = 64;      // maximum length of a prop identifier string

// In-memory player registry
// key: socket.id  →  { userId, nickname, university, balloon_skin, balloon_aura,
//                      status_message, worldX, worldY }
const players = new Map();

// In-memory interaction state
// key: propId (string)  →  { activated: bool, activatedBy: userId|null }
const interactionState = new Map();

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the public player snapshot visible to other clients. */
function playerPublic(p) {
    return {
        id: p.userId,
        nickname: p.nickname,
        display_nickname: p.display_nickname || p.nickname,
        active_streak: Number(p.active_streak || 0),
        university: p.university,
        balloon_skin: p.balloon_skin,
        balloon_aura: p.balloon_aura || 'none',
        status_message: p.status_message || null,
        worldX: p.worldX,
        worldY: p.worldY,
    };
}

/** Collect all connected players including self (chunk filtering disabled). */
function getNearbyPlayers(socketId) {
    if (!players.has(socketId)) return [];
    const result = [];
    players.forEach((p, sid) => {
        // Include self so client can render local balloon consistently
        result.push(playerPublic(p));
    });
    return result;
}

// ── Setup ────────────────────────────────────────────────────────────────────

function setup(io) {
    io.on('connection', (socket) => {

        // Immediately tell the client the world seed so it can start rendering.
        socket.emit('world:seed', { seed: WORLD_SEED });

        // ── player:join ──────────────────────────────────────────────────
        socket.on('player:join', async (data) => {
            if (!data) return;

            const userId = Number(data.userId);
            if (!Number.isFinite(userId)) return;

            const {
                nickname = '', university = '',
                display_nickname = '', active_streak = 0,
                balloon_skin = 'default', balloon_aura = 'none', status_message = null,
                worldX = 0, worldY = 0,
            } = data;

            // Load last saved position from DB (overrides client-provided default)
            let savedX = worldX, savedY = worldY;
            try {
                const res = await pool.query(
                    'SELECT world_x, world_y FROM users WHERE id = $1',
                    [userId]
                );
                if (res.rows.length > 0) {
                    const row = res.rows[0];
                    if (row.world_x != null) savedX = Number(row.world_x);
                    if (row.world_y != null) savedY = Number(row.world_y);
                }
            } catch (err) {
                console.error('world:join position load error:', err.message);
            }

            const clamped = {
                worldX: Math.max(-WORLD_SIZE / 2, Math.min(WORLD_SIZE / 2, savedX)),
                worldY: Math.max(-WORLD_SIZE / 2, Math.min(WORLD_SIZE / 2, savedY)),
            };
            players.set(socket.id, {
                userId,
                nickname,
                display_nickname: display_nickname || nickname,
                active_streak: Number(active_streak || 0),
                university,
                balloon_skin,
                balloon_aura,
                status_message,
                worldX: clamped.worldX, worldY: clamped.worldY,
            });

            // Send saved spawn position back to client
            socket.emit('player:spawn', { worldX: clamped.worldX, worldY: clamped.worldY });

            // Send the snapshot of nearby players.
            socket.emit('players:nearby', getNearbyPlayers(socket.id));

            // Announce arrival globally (except sender).
            socket.broadcast.emit('player:enter', playerPublic(players.get(socket.id)));

            // Send current interaction state to new player.
            const stateObj = {};
            interactionState.forEach((v, k) => { stateObj[k] = v; });
            if (Object.keys(stateObj).length) {
                socket.emit('interaction:state', stateObj);
            }
        });

        // ── player:move ──────────────────────────────────────────────────
        // Throttled position save to DB (every 30s max per player)
        const MOVE_SAVE_INTERVAL = 30000;
        let lastMoveSaveAt = 0;

        socket.on('player:move', (data) => {
            const player = players.get(socket.id);
            if (!player || !data) return;

            let { worldX, worldY } = data;
            worldX = Math.max(-WORLD_SIZE / 2, Math.min(WORLD_SIZE / 2, Number(worldX) || 0));
            worldY = Math.max(-WORLD_SIZE / 2, Math.min(WORLD_SIZE / 2, Number(worldY) || 0));

            player.worldX = worldX;
            player.worldY = worldY;

            // Periodically persist position to DB
            const now = Date.now();
            if (now - lastMoveSaveAt > MOVE_SAVE_INTERVAL) {
                lastMoveSaveAt = now;
                pool.query(
                    'UPDATE users SET world_x = $1, world_y = $2 WHERE id = $3',
                    [Math.round(worldX), Math.round(worldY), player.userId]
                ).catch(err => console.error('world:move save error:', err.message));
            }

            // Keep client-side nearby roster fresh while moving.
            socket.emit('players:nearby', getNearbyPlayers(socket.id));

            // Fan out position update globally (except sender).
            socket.broadcast.emit('player:moved', {
                id: player.userId, worldX, worldY,
            });
        });

        // ── player:appearance ───────────────────────────────────────────
        socket.on('player:appearance', (data) => {
            const player = players.get(socket.id);
            if (!player || !data) return;

            if (typeof data.balloon_skin === 'string' && data.balloon_skin.trim()) {
                player.balloon_skin = data.balloon_skin.trim();
            }
            if (typeof data.balloon_aura === 'string' && data.balloon_aura.trim()) {
                player.balloon_aura = data.balloon_aura.trim();
            }
            if (Object.prototype.hasOwnProperty.call(data, 'status_message')) {
                const raw = data.status_message;
                player.status_message = raw ? String(raw).slice(0, 60) : null;
            }

            socket.broadcast.emit('player:appearance', {
                id: player.userId,
                balloon_skin: player.balloon_skin,
                balloon_aura: player.balloon_aura || 'none',
                status_message: player.status_message || null,
            });
        });

        // ── interaction:trigger ──────────────────────────────────────────
        socket.on('interaction:trigger', (data) => {
            const player = players.get(socket.id);
            if (!player || !data || typeof data.propId !== 'string') return;

            const propId   = data.propId.slice(0, MAX_PROP_ID_LEN);
            const activated = !!data.activated;

            interactionState.set(propId, { activated, activatedBy: player.userId });

            const update = { propId, activated, activatedBy: player.userId };
            // Chunk filtering disabled: broadcast interaction updates globally.
            io.emit('interaction:update', update);
        });

        // ── disconnect ───────────────────────────────────────────────────
        socket.on('disconnect', () => {
            const player = players.get(socket.id);
            if (player) {                // Save last position to DB for next login spawn
                pool.query(
                    'UPDATE users SET world_x = $1, world_y = $2 WHERE id = $3',
                    [Math.round(player.worldX), Math.round(player.worldY), player.userId]
                ).catch(err => console.error('world:disconnect save position error:', err.message));
                socket.broadcast.emit('player:left', { id: player.userId });
                players.delete(socket.id);
            }
        });
    });
}

module.exports = { setup, WORLD_SEED, WORLD_SIZE };
