#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function base64UrlEncode(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
}

function parseArgs(argv) {
    const args = {};
    for (let i = 2; i < argv.length; i += 1) {
        const token = argv[i];
        if (!token.startsWith('--')) continue;
        const key = token.slice(2);
        const next = argv[i + 1];
        if (!next || next.startsWith('--')) {
            args[key] = true;
            continue;
        }
        args[key] = next;
        i += 1;
    }
    return args;
}

function readPrivateKey(args) {
    if (typeof args.key === 'string' && args.key.trim()) {
        const abs = path.resolve(process.cwd(), args.key.trim());
        return fs.readFileSync(abs, 'utf8');
    }

    if (process.env.APPLE_PRIVATE_KEY && process.env.APPLE_PRIVATE_KEY.trim()) {
        return process.env.APPLE_PRIVATE_KEY.replace(/\\n/g, '\n');
    }

    if (process.env.APPLE_PRIVATE_KEY_PATH && process.env.APPLE_PRIVATE_KEY_PATH.trim()) {
        const abs = path.resolve(process.cwd(), process.env.APPLE_PRIVATE_KEY_PATH.trim());
        return fs.readFileSync(abs, 'utf8');
    }

    return null;
}

function readConfig(args) {
    const teamId = args.team || process.env.APPLE_TEAM_ID;
    const keyId = args.kid || process.env.APPLE_KEY_ID;
    const clientId = args.client || process.env.APPLE_CLIENT_ID;
    const expDaysRaw = args.expDays || process.env.APPLE_CLIENT_SECRET_EXPIRES_DAYS || '180';
    const expDays = Number(expDaysRaw);

    return {
        teamId,
        keyId,
        clientId,
        expDays,
        privateKey: readPrivateKey(args),
        outputPath: args.out || process.env.APPLE_CLIENT_SECRET_OUT || null,
    };
}

function printUsage() {
    console.log('Usage:');
    console.log('  node scripts/generate-apple-client-secret.js --key ./AuthKey_XXXX.p8 --team TEAM_ID --kid KEY_ID --client CLIENT_ID [--expDays 180] [--out .apple-client-secret.jwt]');
    console.log('');
    console.log('Or set env vars:');
    console.log('  APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_CLIENT_ID, APPLE_PRIVATE_KEY_PATH');
    console.log('  APPLE_CLIENT_SECRET_EXPIRES_DAYS, APPLE_CLIENT_SECRET_OUT');
}

function derToJose(derSignature, size) {
    const der = Buffer.isBuffer(derSignature) ? derSignature : Buffer.from(derSignature);
    if (der.length < 8 || der[0] !== 0x30) {
        throw new Error('Invalid DER signature format');
    }

    let offset = 2;
    if (der[1] & 0x80) {
        const lengthBytes = der[1] & 0x7f;
        offset = 2 + lengthBytes;
    }

    if (der[offset] !== 0x02) throw new Error('Invalid DER signature (R marker)');
    const rLength = der[offset + 1];
    const r = der.slice(offset + 2, offset + 2 + rLength);

    const sOffset = offset + 2 + rLength;
    if (der[sOffset] !== 0x02) throw new Error('Invalid DER signature (S marker)');
    const sLength = der[sOffset + 1];
    const s = der.slice(sOffset + 2, sOffset + 2 + sLength);

    const rPadded = Buffer.concat([Buffer.alloc(Math.max(0, size - r.length)), r]).slice(-size);
    const sPadded = Buffer.concat([Buffer.alloc(Math.max(0, size - s.length)), s]).slice(-size);
    return Buffer.concat([rPadded, sPadded]);
}

function generateJwt(config) {
    const now = Math.floor(Date.now() / 1000);
    const exp = now + Math.floor(config.expDays * 24 * 60 * 60);

    const header = {
        alg: 'ES256',
        kid: config.keyId,
        typ: 'JWT',
    };

    const payload = {
        iss: config.teamId,
        iat: now,
        exp,
        aud: 'https://appleid.apple.com',
        sub: config.clientId,
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    const signer = crypto.createSign('sha256');
    signer.update(signingInput);
    signer.end();

    const derSignature = signer.sign(config.privateKey);
    const joseSignature = derToJose(derSignature, 32);
    const encodedSignature = base64UrlEncode(joseSignature);

    return `${signingInput}.${encodedSignature}`;
}

function validateConfig(config) {
    const missing = [];
    if (!config.teamId) missing.push('APPLE_TEAM_ID (--team)');
    if (!config.keyId) missing.push('APPLE_KEY_ID (--kid)');
    if (!config.clientId) missing.push('APPLE_CLIENT_ID (--client)');
    if (!config.privateKey) missing.push('APPLE_PRIVATE_KEY_PATH (--key) or APPLE_PRIVATE_KEY');
    if (!Number.isFinite(config.expDays) || config.expDays <= 0) {
        missing.push('APPLE_CLIENT_SECRET_EXPIRES_DAYS (--expDays, positive number)');
    }

    if (missing.length > 0) {
        console.error('Missing/invalid config:');
        missing.forEach((m) => console.error(`- ${m}`));
        console.error('');
        printUsage();
        process.exit(1);
    }
}

function main() {
    const args = parseArgs(process.argv);
    if (args.help) {
        printUsage();
        return;
    }

    const config = readConfig(args);
    validateConfig(config);

    const clientSecret = generateJwt(config);

    if (config.outputPath) {
        const abs = path.resolve(process.cwd(), config.outputPath);
        fs.writeFileSync(abs, `${clientSecret}\n`, 'utf8');
        console.log(`Apple client secret saved: ${abs}`);
    } else {
        console.log(clientSecret);
    }
}

main();
