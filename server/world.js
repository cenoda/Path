/**
 * World state manager for the P.A.T.H large-scale world.
 *
 * Architecture:
 *  - WORLD_SIZE  : 1,000,000 × 1,000,000 world-unit plane
 *  - CHUNK_SIZE  : each chunk covers 4,000 × 4,000 world units
 *  - VIEW_CHUNKS : player sees ±2 chunks in each direction (5×5 = 25 chunks)
 *  - WORLD_SEED  : fixed deterministic seed so all clients render the same props
 *
 * Spatial partitioning (Grid/Chunk system):
 *  Players are bucketed by chunk. When a player moves into a new chunk the
 *  server updates their socket.io room membership so they only receive
 *  position broadcasts from players in adjacent chunks (~25 chunks at most).
 *  This keeps network traffic proportional to local density, not total CCU.
 *
 * Interaction broadcast:
 *  Interactable props (sky-islands, buildings, etc.) emit 'interaction:trigger'
 *  events to the server.  The server fans out 'interaction:update' to players
 *  in the affected area and persists the per-prop state in memory.
 */

'use strict';

const WORLD_SIZE       = 1000000; // total world width/height in world-units
const CHUNK_SIZE       = 4000;    // world-units per chunk edge
const VIEW_CHUNKS      = 2;       // ±chunks visible in each axis (5×5 grid)
const WORLD_SEED       = 777;     // fixed seed distributed to every client
const MAX_PROP_ID_LEN  = 64;      // maximum length of a prop identifier string

// In-memory player registry
// key: socket.id  →  { userId, nickname, university, balloon_skin,
//                      status_message, worldX, worldY, cx, cy }
const players = new Map();

// In-memory interaction state
// key: propId (string)  →  { activated: bool, activatedBy: userId|null }
const interactionState = new Map();

// In-memory group timer room membership: roomId → Set<socketId>
const roomSockets = new Map();

// ── Helpers ─────────────────────────────────────────────────────────────────

function chunkOf(worldX, worldY) {
    return {
        cx: Math.floor((worldX + WORLD_SIZE / 2) / CHUNK_SIZE),
        cy: Math.floor((worldY + WORLD_SIZE / 2) / CHUNK_SIZE),
    };
}

function nearbyChunkKeys(cx, cy) {
    const keys = [];
    for (let dx = -VIEW_CHUNKS; dx <= VIEW_CHUNKS; dx++) {
        for (let dy = -VIEW_CHUNKS; dy <= VIEW_CHUNKS; dy++) {
            keys.push(`${cx + dx},${cy + dy}`);
        }
    }
    return keys;
}

function chunkRoomName(ck) {
    return `chunk:${ck}`;
}

/** Returns the public player snapshot visible to other clients. */
function playerPublic(p) {
    return {
        id: p.userId,
        nickname: p.nickname,
        display_nickname: p.display_nickname || p.nickname,
        active_streak: Number(p.active_streak || 0),
        university: p.university,
        balloon_skin: p.balloon_skin,
        status_message: p.status_message || null,
        worldX: p.worldX,
        worldY: p.worldY,
    };
}

/** Collect all players in the vicinity of socketId. */
function getNearbyPlayers(socketId) {
    const me = players.get(socketId);
    if (!me) return [];
    const nearby = new Set(nearbyChunkKeys(me.cx, me.cy));
    const result = [];
    players.forEach((p, sid) => {
        if (sid === socketId) return;
        if (nearby.has(`${p.cx},${p.cy}`)) {
            result.push(playerPublic(p));
        }
    });
    return result;
}

// ── Setup ────────────────────────────────────────────────────────────────────

function setup(io) {
    io.on('connection', (socket) => {

        // Immediately tell the client the world seed so it can start rendering.
        socket.emit('world:seed', { seed: WORLD_SEED });

        // ── player:join ──────────────────────────────────────────────────
        socket.on('player:join', (data) => {
            if (!data) return;

            const userId = Number(data.userId);
            if (!Number.isFinite(userId)) return;

            const {
                nickname = '', university = '',
                display_nickname = '', active_streak = 0,
                balloon_skin = 'default', status_message = null,
                worldX = 0, worldY = 0,
            } = data;

            const clamped = {
                worldX: Math.max(-WORLD_SIZE / 2, Math.min(WORLD_SIZE / 2, worldX)),
                worldY: Math.max(-WORLD_SIZE / 2, Math.min(WORLD_SIZE / 2, worldY)),
            };
            const { cx, cy } = chunkOf(clamped.worldX, clamped.worldY);

            players.set(socket.id, {
                userId,
                nickname,
                display_nickname: display_nickname || nickname,
                active_streak: Number(active_streak || 0),
                university,
                balloon_skin,
                status_message,
                worldX: clamped.worldX, worldY: clamped.worldY, cx, cy,
            });

            // Join the 5×5 chunk rooms around the player's current position.
            nearbyChunkKeys(cx, cy).forEach(k => socket.join(chunkRoomName(k)));

            // Send the snapshot of nearby players.
            socket.emit('players:nearby', getNearbyPlayers(socket.id));

            // Announce arrival to the players already in the same chunk.
            socket.to(chunkRoomName(`${cx},${cy}`)).emit('player:enter', playerPublic(players.get(socket.id)));

            // Send current interaction state to new player.
            const stateObj = {};
            interactionState.forEach((v, k) => { stateObj[k] = v; });
            if (Object.keys(stateObj).length) {
                socket.emit('interaction:state', stateObj);
            }
        });

        // ── player:move ──────────────────────────────────────────────────
        socket.on('player:move', (data) => {
            const player = players.get(socket.id);
            if (!player || !data) return;

            let { worldX, worldY } = data;
            worldX = Math.max(-WORLD_SIZE / 2, Math.min(WORLD_SIZE / 2, Number(worldX) || 0));
            worldY = Math.max(-WORLD_SIZE / 2, Math.min(WORLD_SIZE / 2, Number(worldY) || 0));

            const oldCx = player.cx;
            const oldCy = player.cy;
            const { cx, cy } = chunkOf(worldX, worldY);

            player.worldX = worldX;
            player.worldY = worldY;
            player.cx = cx;
            player.cy = cy;

            if (cx !== oldCx || cy !== oldCy) {
                // Update socket.io room membership.
                const oldRooms = new Set(nearbyChunkKeys(oldCx, oldCy).map(chunkRoomName));
                const newRooms = new Set(nearbyChunkKeys(cx, cy).map(chunkRoomName));
                oldRooms.forEach(r => { if (!newRooms.has(r)) socket.leave(r); });
                newRooms.forEach(r => { if (!oldRooms.has(r)) socket.join(r); });
                // Deliver updated nearby player list after chunk transition.
                socket.emit('players:nearby', getNearbyPlayers(socket.id));
            }

            // Fan out position update to peers in the new chunk.
            socket.to(chunkRoomName(`${cx},${cy}`)).emit('player:moved', {
                id: player.userId, worldX, worldY,
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
            // Broadcast to all players in and around the same chunk.
            nearbyChunkKeys(player.cx, player.cy).forEach(k => {
                io.to(chunkRoomName(k)).emit('interaction:update', update);
            });
        });

        // ── disconnect ───────────────────────────────────────────────────
        socket.on('disconnect', () => {
            const player = players.get(socket.id);
            if (player) {
                socket.to(chunkRoomName(`${player.cx},${player.cy}`)).emit('player:left', { id: player.userId });
                players.delete(socket.id);
            }
            // Clean up group timer room membership
            roomSockets.forEach((sids, roomId) => {
                if (sids.delete(socket.id) && sids.size === 0) {
                    roomSockets.delete(roomId);
                }
            });
        });

        // ── room:join ────────────────────────────────────────────────────
        // Client emits after successfully joining/being a member of a room
        socket.on('room:join', (data) => {
            if (!data || !data.roomId) return;
            const roomId = String(data.roomId);
            socket.join(`room:${roomId}`);
            if (!roomSockets.has(roomId)) roomSockets.set(roomId, new Set());
            roomSockets.get(roomId).add(socket.id);
        });

        // ── room:leave ───────────────────────────────────────────────────
        socket.on('room:leave', (data) => {
            if (!data || !data.roomId) return;
            const roomId = String(data.roomId);
            socket.leave(`room:${roomId}`);
            const sids = roomSockets.get(roomId);
            if (sids) {
                sids.delete(socket.id);
                if (sids.size === 0) roomSockets.delete(roomId);
            }
        });

        // ── room:timer_start ─────────────────────────────────────────────
        // Client emits when starting a timer while in a room
        socket.on('room:timer_start', (data) => {
            const player = players.get(socket.id);
            if (!data || !data.roomId) return;
            const roomId = String(data.roomId);
            const nickname = player ? (player.display_nickname || player.nickname) : (data.nickname || '누군가');
            const subject = String(data.subject || '공부').slice(0, 60);
            io.to(`room:${roomId}`).emit('room:activity', {
                type: 'timer_start',
                userId: player ? player.userId : null,
                nickname,
                subject,
                ts: Date.now(),
            });
        });

        // ── room:timer_stop ──────────────────────────────────────────────
        socket.on('room:timer_stop', (data) => {
            const player = players.get(socket.id);
            if (!data || !data.roomId) return;
            const roomId = String(data.roomId);
            const nickname = player ? (player.display_nickname || player.nickname) : (data.nickname || '누군가');
            const durationSec = parseInt(data.duration_sec, 10) || 0;
            io.to(`room:${roomId}`).emit('room:activity', {
                type: 'timer_stop',
                userId: player ? player.userId : null,
                nickname,
                duration_sec: durationSec,
                ts: Date.now(),
            });
            // Broadcast leaderboard refresh signal
            io.to(`room:${roomId}`).emit('room:leaderboard_refresh', { roomId });
        });
    });
}

module.exports = { setup, WORLD_SEED, WORLD_SIZE, CHUNK_SIZE };
