const pool = require('./server/db');

async function main() {
    const nickname = (process.argv[2] || '').trim();
    const mode = (process.argv[3] || 'sub').trim().toLowerCase();

    const legacyTrue = mode === 'true' || mode === '1' || mode === 'yes';
    const legacyFalse = mode === 'false' || mode === '0' || mode === 'no';
    const role = legacyTrue
        ? 'sub'
        : legacyFalse
            ? 'none'
            : mode;

    if (!['none', 'sub', 'main'].includes(role)) {
        console.error('Usage: node set-admin.js <nickname> [main|sub|none]');
        process.exitCode = 1;
        return;
    }

    const isAdmin = role === 'main' || role === 'sub';

    if (!nickname) {
        console.error('Usage: node set-admin.js <nickname> [main|sub|none]');
        process.exitCode = 1;
        return;
    }

    try {
        const findRes = await pool.query(
            'SELECT id, nickname, is_admin, admin_role FROM users WHERE nickname = $1',
            [nickname]
        );

        if (findRes.rows.length === 0) {
            console.error(`User not found: ${nickname}`);
            process.exitCode = 1;
            return;
        }

        const target = findRes.rows[0];

        if (role === 'main') {
            await pool.query(
                `UPDATE users
                 SET admin_role = 'sub', is_admin = TRUE
                 WHERE admin_role = 'main' AND id <> $1`,
                [target.id]
            );
        }

        await pool.query(
            'UPDATE users SET is_admin = $1, admin_role = $2 WHERE id = $3',
            [isAdmin, role, target.id]
        );

        const admins = await pool.query(
            `SELECT id, nickname, is_admin, admin_role
             FROM users
             WHERE is_admin = TRUE OR admin_role IN ('main', 'sub')
             ORDER BY
                CASE
                    WHEN admin_role = 'main' THEN 0
                    WHEN admin_role = 'sub' THEN 1
                    ELSE 2
                END,
                id`
        );

        console.log(`Updated: ${target.nickname} (id=${target.id}) -> role=${role}, is_admin=${isAdmin}`);
        console.log('Current admins:');
        console.log(JSON.stringify(admins.rows, null, 2));
    } catch (err) {
        console.error('set-admin failed:', err.message);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
}

main();
