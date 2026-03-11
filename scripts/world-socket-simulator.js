#!/usr/bin/env node
'use strict';

const { io } = require('socket.io-client');

const DEFAULTS = {
    serverUrl: process.env.SIM_SERVER_URL || `http://127.0.0.1:${process.env.PORT || 5000}`,
    clients: Number(process.env.SIM_CLIENTS || 50),
    moveIntervalMs: Number(process.env.SIM_MOVE_INTERVAL_MS || 100),
    moveStep: Number(process.env.SIM_MOVE_STEP || 180),
    spawnRange: Number(process.env.SIM_SPAWN_RANGE || 5800),
    runSeconds: Number(process.env.SIM_RUN_SECONDS || 0),
    logIntervalMs: Number(process.env.SIM_LOG_INTERVAL_MS || 3000),
    baseUserId: Number(process.env.SIM_BASE_USER_ID || 900000),
};

function parseArgs(argv) {
    const out = { ...DEFAULTS };
    for (let i = 2; i < argv.length; i += 1) {
        const key = argv[i];
        const next = argv[i + 1];
        if (!key.startsWith('--')) continue;

        if (next == null || next.startsWith('--')) {
            if (key === '--help' || key === '-h') out.help = true;
            continue;
        }

        if (key === '--url') out.serverUrl = next;
        if (key === '--clients') out.clients = Number(next);
        if (key === '--interval') out.moveIntervalMs = Number(next);
        if (key === '--step') out.moveStep = Number(next);
        if (key === '--spawn-range') out.spawnRange = Number(next);
        if (key === '--duration') out.runSeconds = Number(next);
        if (key === '--log-interval') out.logIntervalMs = Number(next);
        if (key === '--base-user-id') out.baseUserId = Number(next);
        i += 1;
    }
    return out;
}

function rand(min, max) {
    return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function printHelp() {
    console.log(
        [
            'World Socket Simulator',
            '',
            'Usage:',
            '  node scripts/world-socket-simulator.js [options]',
            '',
            'Options:',
            '  --url <http://host:port>   Socket server URL',
            '  --clients <n>              Number of virtual clients',
            '  --interval <ms>            Move emit interval (ms)',
            '  --step <n>                 Max random delta per axis per move',
            '  --spawn-range <n>          Initial spawn range (+/- n)',
            '  --duration <sec>           Auto stop after seconds (0 = run forever)',
            '  --log-interval <ms>        Stats log interval (ms)',
            '  --base-user-id <n>         Starting user ID seed',
            '  --help                     Show this help',
            '',
            'Examples:',
            '  npm run simulate:world -- --clients 200 --interval 80',
            '  node scripts/world-socket-simulator.js --url http://127.0.0.1:5000 --duration 60',
        ].join('\n')
    );
}

function validateConfig(config) {
    const errors = [];
    if (!Number.isFinite(config.clients) || config.clients <= 0) errors.push('--clients must be > 0');
    if (!Number.isFinite(config.moveIntervalMs) || config.moveIntervalMs <= 0) errors.push('--interval must be > 0');
    if (!Number.isFinite(config.moveStep) || config.moveStep <= 0) errors.push('--step must be > 0');
    if (!Number.isFinite(config.spawnRange) || config.spawnRange < 0) errors.push('--spawn-range must be >= 0');
    if (!Number.isFinite(config.runSeconds) || config.runSeconds < 0) errors.push('--duration must be >= 0');
    if (!Number.isFinite(config.logIntervalMs) || config.logIntervalMs <= 0) errors.push('--log-interval must be > 0');
    if (!Number.isFinite(config.baseUserId) || config.baseUserId <= 0) errors.push('--base-user-id must be > 0');
    return errors;
}

function createVirtualClient(index, config, stats) {
    const id = config.baseUserId + index;
    const state = {
        worldX: rand(-config.spawnRange, config.spawnRange),
        worldY: rand(-config.spawnRange, config.spawnRange),
        worldZ: rand(-40, 500),
    };

    const socket = io(config.serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
        timeout: 10000,
    });

    let moveTimer = null;

    function emitJoin() {
        socket.emit('player:join', {
            userId: id,
            nickname: `bot-${id}`,
            university: 'SIM',
            display_nickname: `BOT_${id}`,
            active_streak: Math.floor(rand(0, 30)),
            balloon_skin: 'default',
            balloon_aura: 'none',
            status_message: null,
            worldX: state.worldX,
            worldY: state.worldY,
            worldZ: state.worldZ,
        });
        stats.joins += 1;
    }

    function emitMove() {
        state.worldX = clamp(state.worldX + rand(-config.moveStep, config.moveStep), -100000, 100000);
        state.worldY = clamp(state.worldY + rand(-config.moveStep, config.moveStep), -100000, 100000);
        state.worldZ = clamp(state.worldZ + rand(-20, 20), -40, 500);

        socket.emit('player:move', {
            worldX: state.worldX,
            worldY: state.worldY,
            worldZ: state.worldZ,
        });
        stats.movesSent += 1;
    }

    socket.on('connect', () => {
        stats.connected += 1;
        emitJoin();
        if (moveTimer) clearInterval(moveTimer);
        moveTimer = setInterval(emitMove, config.moveIntervalMs);
    });

    socket.on('disconnect', () => {
        stats.disconnected += 1;
        if (moveTimer) {
            clearInterval(moveTimer);
            moveTimer = null;
        }
    });

    socket.on('connect_error', () => {
        stats.connectErrors += 1;
    });

    socket.on('player:spawn', ({ worldX, worldY, worldZ } = {}) => {
        if (Number.isFinite(worldX)) state.worldX = worldX;
        if (Number.isFinite(worldY)) state.worldY = worldY;
        if (Number.isFinite(worldZ)) state.worldZ = worldZ;
        stats.spawns += 1;
    });

    return {
        socket,
        stop() {
            if (moveTimer) clearInterval(moveTimer);
            socket.disconnect();
        },
    };
}

function formatRate(total, startedAt) {
    const elapsedSec = Math.max((Date.now() - startedAt) / 1000, 0.001);
    return (total / elapsedSec).toFixed(1);
}

async function main() {
    const config = parseArgs(process.argv);
    if (config.help) {
        printHelp();
        return;
    }

    const errors = validateConfig(config);
    if (errors.length) {
        console.error('Invalid options:');
        errors.forEach((e) => console.error(`- ${e}`));
        process.exitCode = 1;
        return;
    }

    const stats = {
        connected: 0,
        disconnected: 0,
        connectErrors: 0,
        joins: 0,
        spawns: 0,
        movesSent: 0,
    };

    const clients = [];
    const startedAt = Date.now();

    console.log('[sim] start', JSON.stringify(config));

    for (let i = 0; i < config.clients; i += 1) {
        clients.push(createVirtualClient(i, config, stats));
    }

    const logTimer = setInterval(() => {
        const active = clients.reduce((n, c) => n + (c.socket.connected ? 1 : 0), 0);
        console.log(
            `[sim] active=${active}/${config.clients} joins=${stats.joins} spawns=${stats.spawns} moves=${stats.movesSent} moveRate=${formatRate(stats.movesSent, startedAt)}/s connectErr=${stats.connectErrors}`
        );
    }, config.logIntervalMs);

    function shutdown(reason) {
        clearInterval(logTimer);
        clients.forEach((c) => c.stop());
        const active = clients.reduce((n, c) => n + (c.socket.connected ? 1 : 0), 0);
        console.log(`[sim] stop reason=${reason}`);
        console.log(
            `[sim] summary active=${active}/${config.clients} joins=${stats.joins} spawns=${stats.spawns} moves=${stats.movesSent} disconnects=${stats.disconnected} connectErr=${stats.connectErrors} avgMoveRate=${formatRate(stats.movesSent, startedAt)}/s`
        );
    }

    process.on('SIGINT', () => {
        shutdown('SIGINT');
        process.exit(0);
    });
    process.on('SIGTERM', () => {
        shutdown('SIGTERM');
        process.exit(0);
    });

    if (config.runSeconds > 0) {
        setTimeout(() => {
            shutdown('duration');
            process.exit(0);
        }, config.runSeconds * 1000);
    }
}

main().catch((err) => {
    console.error('[sim] fatal error', err);
    process.exit(1);
});
