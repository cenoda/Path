const express = require('express');
const pool = require('../db');
const { getTaxRate, getTicketPrice, getPercentile } = require('../data/universities');

const router = express.Router();

const MAX_HOURS = 24;
const NSU_BONUS_RATE = 0.15;
const GPA_BONUS_MAX = 0.5;

function calcGpaBonus(gpaScore, gpaStatus) {
    if (gpaStatus !== 'approved' || !gpaScore || gpaScore <= 0) return 0;
    const bonus = Math.max(0, (5 - gpaScore) * 0.12);
    return Math.min(bonus, GPA_BONUS_MAX);
}

function calcTotalRate(university, isNsu, prevUniversity, gpaScore, gpaStatus) {
    let rate = getTaxRate(university);
    if (isNsu && prevUniversity) {
        const prevRate = getTaxRate(prevUniversity);
        rate += prevRate * NSU_BONUS_RATE;
    }
    rate += calcGpaBonus(gpaScore, gpaStatus);
    return rate;
}

router.get('/tax', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const result = await pool.query(
            'SELECT university, last_tax_collected_at, gold, is_n_su, prev_university, gpa_score, gpa_status FROM users WHERE id = $1',
            [req.session.userId]
        );
        const user = result.rows[0];
        const rate = calcTotalRate(user.university, user.is_n_su, user.prev_university, user.gpa_score, user.gpa_status);
        const percentile = getPercentile(user.university);
        const hoursPassed = Math.min(
            (Date.now() - new Date(user.last_tax_collected_at).getTime()) / 3600000,
            MAX_HOURS
        );
        const pending = Math.floor(hoursPassed * rate * 100) / 100;
        const ticketPrice = getTicketPrice(user.university);

        const resp = {
            rate: Math.round(rate * 100) / 100,
            pending: Math.floor(pending),
            percentile,
            gold: user.gold,
            university: user.university,
            ticketPrice,
            is_n_su: user.is_n_su,
            prev_university: user.prev_university
        };

        const baseRate = getTaxRate(user.university);
        if (user.is_n_su && user.prev_university) {
            const bonus = getTaxRate(user.prev_university) * NSU_BONUS_RATE;
            resp.baseRate = Math.round(baseRate * 100) / 100;
            resp.nsuBonus = Math.round(bonus * 100) / 100;
        }

        const gpaBonus = calcGpaBonus(user.gpa_score, user.gpa_status);
        if (gpaBonus > 0) {
            if (!resp.baseRate) resp.baseRate = Math.round(baseRate * 100) / 100;
            resp.gpaBonus = Math.round(gpaBonus * 100) / 100;
            resp.gpaScore = parseFloat(user.gpa_score);
        }

        res.json(resp);
    } catch (err) {
        console.error('tax get error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/collect-tax', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query(
            'SELECT university, last_tax_collected_at, is_n_su, prev_university, gpa_score, gpa_status FROM users WHERE id = $1 FOR UPDATE',
            [req.session.userId]
        );
        const user = userRes.rows[0];
        const rate = calcTotalRate(user.university, user.is_n_su, user.prev_university, user.gpa_score, user.gpa_status);

        const hoursPassed = Math.min(
            (Date.now() - new Date(user.last_tax_collected_at).getTime()) / 3600000,
            MAX_HOURS
        );
        const collected = Math.floor(hoursPassed * rate);

        if (collected < 1) {
            await client.query('ROLLBACK');
            return res.json({ ok: true, collected: 0, message: '아직 수령할 세금이 없습니다.' });
        }

        const final = await client.query(
            `UPDATE users SET gold = gold + $1, last_tax_collected_at = NOW()
             WHERE id = $2
             RETURNING id, nickname, university, gold, exp, tier, tickets, mock_exam_score`,
            [collected, req.session.userId]
        );

        await client.query('COMMIT');
        res.json({ ok: true, collected, user: final.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('collect-tax error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/buy-ticket', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { quantity = 1, target_university } = req.body;
    const qty = Math.max(1, Math.min(10, parseInt(quantity) || 1));

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query(
            'SELECT university, gold, tickets FROM users WHERE id = $1 FOR UPDATE',
            [req.session.userId]
        );
        const user = userRes.rows[0];

        const priceUniversity = target_university || user.university;
        const unitPrice = getTicketPrice(priceUniversity);
        const price = unitPrice * qty;

        if (user.gold < price) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `골드가 부족합니다. 필요: ${price.toLocaleString()}G` });
        }

        const final = await client.query(
            `UPDATE users SET gold = gold - $1, tickets = tickets + $2
             WHERE id = $3
             RETURNING id, nickname, university, gold, exp, tier, tickets, mock_exam_score`,
            [price, qty, req.session.userId]
        );

        await client.query('COMMIT');
        res.json({ ok: true, spent: price, unitPrice, university: priceUniversity, user: final.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('buy-ticket error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

const BALLOON_SKINS = {
    'default': { id: 'default', name: '기본 열기구', price: 0, darkImg: 'balloon_dark.png', lightImg: 'balloon_light.png', desc: '기본 제공 열기구' },
    'rainbow': { id: 'rainbow', name: '무지개 열기구', price: 2000, darkImg: 'balloon_rainbow.png', lightImg: 'balloon_rainbow.png', desc: '화려한 무지개 열기구' },
    'pastel': { id: 'pastel', name: '파스텔 열기구', price: 3000, darkImg: 'balloon_pastel.png', lightImg: 'balloon_pastel.png', desc: '차분한 파스텔톤 열기구' },
    'redstripes': { id: 'redstripes', name: '레드 스트라이프', price: 4000, darkImg: 'balloon_redstripes.png', lightImg: 'balloon_redstripes.png', desc: '강렬한 레드 스트라이프 열기구' },
    'golden': { id: 'golden', name: '황금 열기구', price: 5000, darkImg: 'balloon_golden.png', lightImg: 'balloon_golden.png', desc: '고급스러운 황금빛 열기구' },
    'cosmic': { id: 'cosmic', name: '우주 열기구', price: 6500, darkImg: 'balloon_cosmic.png', lightImg: 'balloon_cosmic.png', desc: '신비로운 우주 테마 열기구' },
    'sunset': { id: 'sunset', name: '석양 열기구', price: 8000, darkImg: 'balloon_sunset.png', lightImg: 'balloon_sunset.png', desc: '아름다운 석양 그라데이션 열기구' },
    'emerald': { id: 'emerald', name: '에메랄드 열기구', price: 9500, darkImg: 'balloon_emerald.png', lightImg: 'balloon_emerald.png', desc: '고귀한 에메랄드빛 열기구' },
    'phoenix': { id: 'phoenix', name: '불사조 열기구', price: 11000, darkImg: 'balloon_phoenix.png', lightImg: 'balloon_phoenix.png', desc: '화염 속 불사조 열기구' },
    'galaxy': { id: 'galaxy', name: '은하수 열기구', price: 13000, darkImg: 'balloon_galaxy.png', lightImg: 'balloon_galaxy.png', desc: '찬란한 은하수 열기구' },
    'diamond': { id: 'diamond', name: '다이아몬드 열기구', price: 15000, darkImg: 'balloon_diamond.png', lightImg: 'balloon_diamond.png', desc: '최고급 다이아몬드 열기구' }
};

router.get('/skins', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const userRes = await pool.query('SELECT balloon_skin, owned_skins FROM users WHERE id = $1', [req.session.userId]);
        const user = userRes.rows[0];
        const owned = (user.owned_skins || 'default').split(',').map(s => s.trim()).filter(Boolean);
        res.json({ skins: Object.values(BALLOON_SKINS), owned, equipped: user.balloon_skin || 'default' });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/buy-skin', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { skin_id } = req.body;
    const skin = BALLOON_SKINS[skin_id];
    if (!skin) return res.status(400).json({ error: '존재하지 않는 스킨입니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query('SELECT gold, owned_skins FROM users WHERE id = $1 FOR UPDATE', [req.session.userId]);
        const user = userRes.rows[0];
        const owned = (user.owned_skins || 'default').split(',').map(s => s.trim()).filter(Boolean);

        if (owned.includes(skin_id)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '이미 보유한 스킨입니다.' });
        }
        if (user.gold < skin.price) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `골드가 부족합니다. 필요: ${skin.price.toLocaleString()}G` });
        }

        owned.push(skin_id);
        const newOwned = owned.join(',');
        const final = await client.query(
            `UPDATE users SET gold = gold - $1, owned_skins = $2 WHERE id = $3
             RETURNING id, gold, balloon_skin, owned_skins`,
            [skin.price, newOwned, req.session.userId]
        );
        await client.query('COMMIT');
        res.json({ ok: true, spent: skin.price, user: final.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/equip-skin', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { skin_id } = req.body;
    if (!BALLOON_SKINS[skin_id]) return res.status(400).json({ error: '존재하지 않는 스킨입니다.' });

    try {
        const userRes = await pool.query('SELECT owned_skins FROM users WHERE id = $1', [req.session.userId]);
        const owned = (userRes.rows[0].owned_skins || 'default').split(',').map(s => s.trim()).filter(Boolean);
        if (!owned.includes(skin_id)) return res.status(400).json({ error: '보유하지 않은 스킨입니다.' });

        await pool.query('UPDATE users SET balloon_skin = $1 WHERE id = $2', [skin_id, req.session.userId]);
        res.json({ ok: true, equipped: skin_id });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 프로필 뱃지 ──────────────────────────────────────────────────────────────
const PROFILE_BADGES = {
    'none':      { id: 'none',      name: '없음',          price: 0,    desc: '뱃지 없음', emoji: '' },
    'studyking': { id: 'studyking', name: '공부왕',         price: 1500, desc: '공부를 열심히 하는 수험생', emoji: '👑' },
    'streak7':   { id: 'streak7',   name: '7일 연속',       price: 2000, desc: '7일 연속 공부 달성', emoji: '🔥' },
    'streak30':  { id: 'streak30',  name: '30일 연속',      price: 5000, desc: '30일 연속 공부 달성', emoji: '💎' },
    'nsu':       { id: 'nsu',       name: 'N수생',          price: 1000, desc: 'N수생 전용 뱃지', emoji: '📚' },
    'top1':      { id: 'top1',      name: '상위 1%',        price: 8000, desc: '랭킹 상위 1% 달성', emoji: '🏆' },
    'medical':   { id: 'medical',   name: '의대 지망',      price: 4000, desc: '의대 지망생 뱃지', emoji: '⚕️' },
    'cat':       { id: 'cat',       name: '고양이',         price: 2000, desc: '귀여운 고양이', emoji: '🐱' },
    'coffee':    { id: 'coffee',    name: '카공족',         price: 1500, desc: '카페에서 공부하는 수험생', emoji: '☕' },
    'moon':      { id: 'moon',      name: '밤새 공부',      price: 3000, desc: '새벽까지 공부하는 수험생', emoji: '🌙' },
};

// ── 닉네임 색상 ──────────────────────────────────────────────────────────────
const NICKNAME_COLORS = {
    'default':  { id: 'default',  name: '기본',      price: 0,    color: null,      desc: '기본 흰색' },
    'gold':     { id: 'gold',     name: '골드',      price: 3000, color: '#FFD700', desc: '황금빛 닉네임' },
    'silver':   { id: 'silver',   name: '실버',      price: 1500, color: '#C0C0C0', desc: '은빛 닉네임' },
    'sky':      { id: 'sky',      name: '하늘색',    price: 2000, color: '#87CEEB', desc: '하늘빛 닉네임' },
    'pink':     { id: 'pink',     name: '핑크',      price: 2000, color: '#FFB6C1', desc: '핑크 닉네임' },
    'lime':     { id: 'lime',     name: '라임',      price: 2000, color: '#98FB98', desc: '라임 닉네임' },
    'orange':   { id: 'orange',   name: '오렌지',    price: 2500, color: '#FFA07A', desc: '오렌지 닉네임' },
    'purple':   { id: 'purple',   name: '보라',      price: 2500, color: '#DDA0DD', desc: '보라 닉네임' },
    'rainbow':  { id: 'rainbow',  name: '무지개',    price: 8000, color: 'rainbow', desc: '무지개 그라데이션 닉네임' },
};

router.get('/cosmetics', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const userRes = await pool.query(
            'SELECT nickname_color, owned_nickname_colors, profile_badge, owned_badges FROM users WHERE id = $1',
            [req.session.userId]
        );
        const user = userRes.rows[0];
        const ownedColors = (user.owned_nickname_colors || 'default').split(',').map(s => s.trim()).filter(Boolean);
        const ownedBadges = ['none', ...(user.owned_badges || '').split(',').map(s => s.trim()).filter(Boolean)];
        res.json({
            badges: Object.values(PROFILE_BADGES),
            nicknameColors: Object.values(NICKNAME_COLORS),
            ownedBadges,
            ownedColors,
            equippedBadge: user.profile_badge || 'none',
            equippedColor: user.nickname_color || 'default',
        });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/buy-badge', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { badge_id } = req.body;
    const badge = PROFILE_BADGES[badge_id];
    if (!badge || badge_id === 'none') return res.status(400).json({ error: '존재하지 않는 뱃지입니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query('SELECT gold, owned_badges FROM users WHERE id = $1 FOR UPDATE', [req.session.userId]);
        const user = userRes.rows[0];
        const owned = ['none', ...(user.owned_badges || '').split(',').map(s => s.trim()).filter(Boolean)];

        if (owned.includes(badge_id)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '이미 보유한 뱃지입니다.' });
        }
        if (user.gold < badge.price) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `골드가 부족합니다. 필요: ${badge.price.toLocaleString()}G` });
        }

        const newOwned = [...owned.filter(b => b !== 'none'), badge_id].join(',');
        const final = await client.query(
            'UPDATE users SET gold = gold - $1, owned_badges = $2 WHERE id = $3 RETURNING id, gold',
            [badge.price, newOwned, req.session.userId]
        );
        await client.query('COMMIT');
        res.json({ ok: true, spent: badge.price, user: final.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/equip-badge', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { badge_id } = req.body;
    if (!PROFILE_BADGES[badge_id]) return res.status(400).json({ error: '존재하지 않는 뱃지입니다.' });

    try {
        if (badge_id !== 'none') {
            const userRes = await pool.query('SELECT owned_badges FROM users WHERE id = $1', [req.session.userId]);
            const owned = ['none', ...(userRes.rows[0].owned_badges || '').split(',').map(s => s.trim()).filter(Boolean)];
            if (!owned.includes(badge_id)) return res.status(400).json({ error: '보유하지 않은 뱃지입니다.' });
        }
        await pool.query('UPDATE users SET profile_badge = $1 WHERE id = $2', [badge_id, req.session.userId]);
        res.json({ ok: true, equipped: badge_id });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/buy-nickname-color', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { color_id } = req.body;
    const colorItem = NICKNAME_COLORS[color_id];
    if (!colorItem || color_id === 'default') return res.status(400).json({ error: '존재하지 않는 색상입니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query('SELECT gold, owned_nickname_colors FROM users WHERE id = $1 FOR UPDATE', [req.session.userId]);
        const user = userRes.rows[0];
        const owned = (user.owned_nickname_colors || 'default').split(',').map(s => s.trim()).filter(Boolean);

        if (owned.includes(color_id)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '이미 보유한 색상입니다.' });
        }
        if (user.gold < colorItem.price) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `골드가 부족합니다. 필요: ${colorItem.price.toLocaleString()}G` });
        }

        owned.push(color_id);
        const final = await client.query(
            'UPDATE users SET gold = gold - $1, owned_nickname_colors = $2 WHERE id = $3 RETURNING id, gold',
            [colorItem.price, owned.join(','), req.session.userId]
        );
        await client.query('COMMIT');
        res.json({ ok: true, spent: colorItem.price, user: final.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/equip-nickname-color', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { color_id } = req.body;
    if (!NICKNAME_COLORS[color_id]) return res.status(400).json({ error: '존재하지 않는 색상입니다.' });

    try {
        if (color_id !== 'default') {
            const userRes = await pool.query('SELECT owned_nickname_colors FROM users WHERE id = $1', [req.session.userId]);
            const owned = (userRes.rows[0].owned_nickname_colors || 'default').split(',').map(s => s.trim()).filter(Boolean);
            if (!owned.includes(color_id)) return res.status(400).json({ error: '보유하지 않은 색상입니다.' });
        }
        await pool.query('UPDATE users SET nickname_color = $1 WHERE id = $2', [color_id, req.session.userId]);
        res.json({ ok: true, equipped: color_id });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
module.exports.PROFILE_BADGES = PROFILE_BADGES;
module.exports.NICKNAME_COLORS = NICKNAME_COLORS;
