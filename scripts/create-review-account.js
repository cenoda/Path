const bcrypt = require('bcryptjs');
const pool = require('../server/db');

const EULA_VERSION = process.env.EULA_VERSION || '2026-03-09';
const nickname = process.env.REVIEW_NICKNAME || 'gp_review_test';
const password = process.env.REVIEW_PASSWORD || '';
const realName = process.env.REVIEW_REAL_NAME || 'Google Play Reviewer';

function generatePassword() {
    return `Path!${Math.random().toString(36).slice(2, 8)}#${Date.now().toString().slice(-4)}`;
}

async function ensureUserCode(client, userId) {
    const nextCode = `PATH-${String(userId).padStart(6, '0')}`;
    await client.query(
        `UPDATE users
         SET user_code = COALESCE(user_code, $2)
         WHERE id = $1`,
        [userId, nextCode]
    );
}

async function main() {
    const finalPassword = password || generatePassword();
    const passwordHash = await bcrypt.hash(finalPassword, 10);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const existing = await client.query('SELECT id FROM users WHERE nickname = $1', [nickname]);

        let userId;
        let mode;

        if (existing.rows.length > 0) {
            userId = existing.rows[0].id;
            mode = 'updated';
            await client.query(
                `UPDATE users
                 SET password_hash = $2,
                     real_name = COALESCE(real_name, $3),
                     privacy_agreed = TRUE,
                     eula_version = $4,
                     eula_agreed_at = NOW()
                 WHERE id = $1`,
                [userId, passwordHash, realName, EULA_VERSION]
            );
        } else {
            mode = 'created';
            const inserted = await client.query(
                `INSERT INTO users (
                    nickname,
                    password_hash,
                    university,
                    real_name,
                    privacy_agreed,
                    eula_version,
                    eula_agreed_at,
                    is_admin,
                    admin_role
                ) VALUES ($1, $2, $3, $4, TRUE, $5, NOW(), FALSE, 'none')
                RETURNING id`,
                [nickname, passwordHash, null, realName, EULA_VERSION]
            );
            userId = inserted.rows[0].id;
        }

        await ensureUserCode(client, userId);
        await client.query('COMMIT');

        console.log(JSON.stringify({
            ok: true,
            mode,
            nickname,
            password: finalPassword,
            userId,
            eulaVersion: EULA_VERSION
        }, null, 2));
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('create-review-account failed:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        pool.end();
    }
}

main();
