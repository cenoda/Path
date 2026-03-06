const pool = require('./server/db');

async function main() {
    const nickname = (process.argv[2] || '').trim();
    const mode = (process.argv[3] || 'true').trim().toLowerCase();
    const isAdmin = mode !== 'false' && mode !== '0' && mode !== 'no';

    if (!nickname) {
        console.error('Usage: node set-admin.js <nickname> [true|false]');
        process.exitCode = 1;
        return;
    }

    try {
        const findRes = await pool.query(
            'SELECT id, nickname, is_admin FROM users WHERE nickname = $1',
            [nickname]
        );

        if (findRes.rows.length === 0) {
            console.error(`User not found: ${nickname}`);
            process.exitCode = 1;
            return;
        }

        const target = findRes.rows[0];

        await pool.query('UPDATE users SET is_admin = $1 WHERE id = $2', [isAdmin, target.id]);

        const admins = await pool.query(
            'SELECT id, nickname, is_admin FROM users WHERE is_admin = TRUE ORDER BY id'
        );

        console.log(`Updated: ${target.nickname} (id=${target.id}) -> is_admin=${isAdmin}`);
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
