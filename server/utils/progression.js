const STREAK_MIN_SECONDS_PER_DAY = 3600;
const STREAK_BONUS_RATE = 0.05;

const TITLE_CODES = {
    HUNDRED_HOURS: 'HUNDRED_HOURS',
    INVASION_CHAIN: 'INVASION_CHAIN',
    OWL_TIMER: 'OWL_TIMER'
};

const TITLE_LABELS = {
    [TITLE_CODES.HUNDRED_HOURS]: '100시간의 고독',
    [TITLE_CODES.INVASION_CHAIN]: '연쇄침공마',
    [TITLE_CODES.OWL_TIMER]: '올빼미'
};

function toDateOnly(value) {
    const d = value instanceof Date ? value : new Date(value);
    return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
    const aa = new Date(`${a}T00:00:00.000Z`);
    const bb = new Date(`${b}T00:00:00.000Z`);
    return Math.round((aa.getTime() - bb.getTime()) / 86400000);
}

async function recalculateStreak(client, userId) {
    const [dailyRes, todayRes] = await Promise.all([
        client.query(
            `SELECT DATE(created_at) AS day, COALESCE(SUM(duration_sec), 0) AS sec
             FROM study_records
             WHERE user_id = $1 AND result = 'SUCCESS'
             GROUP BY DATE(created_at)
             HAVING COALESCE(SUM(duration_sec), 0) >= $2
             ORDER BY day DESC
             LIMIT 365`,
            [userId, STREAK_MIN_SECONDS_PER_DAY]
        ),
        client.query('SELECT CURRENT_DATE AS today')
    ]);

    const activeDays = dailyRes.rows.map((row) => toDateOnly(row.day));
    const today = toDateOnly(todayRes.rows[0].today);
    const yesterday = toDateOnly(new Date(new Date(`${today}T00:00:00.000Z`).getTime() - 86400000));

    if (activeDays.length === 0) {
        await client.query(
            `UPDATE users
             SET streak_count = 0,
                 streak_last_date = NULL
             WHERE id = $1`,
            [userId]
        );
        return { streakCount: 0, streakLastDate: null, activeStreak: 0 };
    }

    const newest = activeDays[0];
    if (newest !== today && newest !== yesterday) {
        await client.query(
            `UPDATE users
             SET streak_count = 0,
                 streak_last_date = $2::date
             WHERE id = $1`,
            [userId, newest]
        );
        return { streakCount: 0, streakLastDate: newest, activeStreak: 0 };
    }

    let streak = 1;
    for (let i = 1; i < activeDays.length; i += 1) {
        const diff = daysBetween(activeDays[i - 1], activeDays[i]);
        if (diff !== 1) break;
        streak += 1;
    }

    await client.query(
        `UPDATE users
         SET streak_count = $2,
             streak_last_date = $3::date
         WHERE id = $1`,
        [userId, streak, newest]
    );

    const activeStreak = newest === today || newest === yesterday ? streak : 0;
    return { streakCount: streak, streakLastDate: newest, activeStreak };
}

function getActiveStreakFromUser(user) {
    const last = user?.streak_last_date ? toDateOnly(user.streak_last_date) : null;
    const streak = Number(user?.streak_count || 0);
    if (!last || streak <= 0) return 0;

    const now = new Date();
    const today = toDateOnly(now);
    const yesterday = toDateOnly(new Date(new Date(`${today}T00:00:00.000Z`).getTime() - 86400000));

    if (last === today || last === yesterday) return streak;
    return 0;
}

function getStreakMultiplier(activeStreak) {
    if (!activeStreak || activeStreak <= 0) return 1;
    return 1 + STREAK_BONUS_RATE;
}

async function grantTitle(client, userId, code) {
    const label = TITLE_LABELS[code];
    if (!label) return false;

    const inserted = await client.query(
        `INSERT INTO user_titles (user_id, code, title)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, code) DO NOTHING
         RETURNING id`,
        [userId, code, label]
    );

    if (!inserted.rows.length) return false;

    await client.query('UPDATE user_titles SET is_active = FALSE WHERE user_id = $1', [userId]);
    await client.query('UPDATE user_titles SET is_active = TRUE WHERE user_id = $1 AND code = $2', [userId, code]);
    await client.query('UPDATE users SET active_title = $2 WHERE id = $1', [userId, label]);
    return true;
}

async function evaluateMilestoneTitles(client, userId, context = {}) {
    const granted = [];

    const studyRes = await client.query(
        `SELECT COALESCE(SUM(duration_sec), 0) AS total_sec
         FROM study_records
         WHERE user_id = $1`,
        [userId]
    );
    if (Number(studyRes.rows[0]?.total_sec || 0) >= 360000) {
        const ok = await grantTitle(client, userId, TITLE_CODES.HUNDRED_HOURS);
        if (ok) granted.push(TITLE_LABELS[TITLE_CODES.HUNDRED_HOURS]);
    }

    const invasionRes = await client.query(
        `SELECT COUNT(*)::int AS wins
         FROM invasions
         WHERE attacker_id = $1 AND result = 'WIN'`,
        [userId]
    );
    if (Number(invasionRes.rows[0]?.wins || 0) >= 10) {
        const ok = await grantTitle(client, userId, TITLE_CODES.INVASION_CHAIN);
        if (ok) granted.push(TITLE_LABELS[TITLE_CODES.INVASION_CHAIN]);
    }

    if (context.completedAt && context.studyMode === 'timer' && context.studyResult === 'SUCCESS') {
        const h = new Date(context.completedAt).getHours();
        if (h >= 3 && h < 5) {
            const ok = await grantTitle(client, userId, TITLE_CODES.OWL_TIMER);
            if (ok) granted.push(TITLE_LABELS[TITLE_CODES.OWL_TIMER]);
        }
    }

    return granted;
}

function formatDisplayName(nickname, activeTitle) {
    if (!activeTitle) return nickname || '';
    return `[${activeTitle}] ${nickname || ''}`.trim();
}

module.exports = {
    STREAK_BONUS_RATE,
    STREAK_MIN_SECONDS_PER_DAY,
    TITLE_CODES,
    recalculateStreak,
    getActiveStreakFromUser,
    getStreakMultiplier,
    evaluateMilestoneTitles,
    formatDisplayName
};
