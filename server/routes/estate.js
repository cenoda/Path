const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const pool = require('../db');
const { getTaxRate, getTicketPrice, getPercentile } = require('../data/universities');
const { getActiveStreakFromUser, getStreakMultiplier, STREAK_BONUS_RATE } = require('../utils/progression');

const router = express.Router();

const MAX_HOURS = 24;

const UI_THEMES = [
    { id: 'default',  name: '기본 다크',    priceGold: 0,    priceDiamond: 0,  preview: ['#0F1117','#1B2130','#3182F6'], description: 'P.A.T.H 기본 다크 테마' },
    { id: 'light',    name: '라이트',       priceGold: 0,    priceDiamond: 0,  preview: ['#F5F6FA','#FFFFFF','#3182F6'], description: '밝고 깔끔한 라이트 모드' },
    { id: 'rose',     name: '로즈 골드',    priceGold: 500,  priceDiamond: 5,  preview: ['#120910','#1E1018','#E07B9B'], description: '따뜻한 핑크 & 골드 감성' },
    { id: 'emerald',  name: '에메랄드',     priceGold: 800,  priceDiamond: 8,  preview: ['#0A130F','#111E17','#00C471'], description: '싱그러운 에메랄드 그린' },
    { id: 'purple',   name: '퍼플 드림',    priceGold: 1000, priceDiamond: 10, preview: ['#0D0A1A','#171030','#9B6DFF'], description: '몽환적인 딥 퍼플' },
    { id: 'sunset',   name: '선셋',         priceGold: 1200, priceDiamond: 12, preview: ['#140A06','#211208','#FF6B35'], description: '노을빛 따뜻한 감성' },
    { id: 'midnight', name: '미드나잇',     priceGold: 1500, priceDiamond: 15, preview: ['#080D18','#0E1628','#4A90D9'], description: '깊고 고요한 미드나잇 블루' },
    { id: 'sakura',   name: '사쿠라',       priceGold: 2000, priceDiamond: 20, preview: ['#150C12','#221018','#FF9EC4'], description: '벚꽃 핑크 파스텔 테마' },
];
const NSU_BONUS_RATE = 0.15;
const GPA_BONUS_MAX = 0.5;
const DIAMOND_PACKAGES = [
    { id: 'dia_30', diamonds: 30, priceKrw: 3900 },
    { id: 'dia_80', diamonds: 80, priceKrw: 8900 },
    { id: 'dia_180', diamonds: 180, priceKrw: 17900 },
    { id: 'dia_400', diamonds: 400, priceKrw: 34900 }
];
const DIAMOND_PROVIDER_BY_PLATFORM = {
    web: ['toss'],
    app: ['googleplay', 'appstore']
};

function findDiamondPackage(packageId) {
    return DIAMOND_PACKAGES.find((pkg) => pkg.id === packageId) || null;
}

function getPaymentSecretByProvider(provider) {
    if (provider === 'toss') return process.env.DIAMOND_PAYMENT_SECRET_TOSS || process.env.DIAMOND_PAYMENT_SECRET || '';
    if (provider === 'googleplay') return process.env.DIAMOND_PAYMENT_SECRET_GOOGLEPLAY || process.env.DIAMOND_PAYMENT_SECRET || '';
    if (provider === 'appstore') return process.env.DIAMOND_PAYMENT_SECRET_APPSTORE || process.env.DIAMOND_PAYMENT_SECRET || '';
    return '';
}

function createExpectedPaymentSignature(userId, platform, provider, packageId, paidAmountKrw, providerTxId) {
    const secret = getPaymentSecretByProvider(provider);
    if (!secret) return null;

    const payload = [
        String(userId),
        String(platform),
        String(provider),
        String(packageId),
        String(paidAmountKrw),
        String(providerTxId)
    ].join('|');
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function resolveClientPlatform(req) {
    const raw = String(req.headers['x-path-client-platform'] || req.body?.client_platform || '').toLowerCase().trim();
    return raw === 'app' ? 'app' : 'web';
}

function makeDiamondOrderId(userId) {
    const rand = crypto.randomBytes(6).toString('hex');
    return `dia_${userId}_${Date.now()}_${rand}`;
}

function timingSafeHexEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const aa = a.trim();
    const bb = b.trim();
    if (!aa || !bb || aa.length !== bb.length) return false;

    try {
        return crypto.timingSafeEqual(Buffer.from(aa, 'hex'), Buffer.from(bb, 'hex'));
    } catch (_) {
        return false;
    }
}

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
            'SELECT university, last_tax_collected_at, gold, diamond, is_n_su, prev_university, gpa_score, gpa_status, streak_count, streak_last_date FROM users WHERE id = $1',
            [req.session.userId]
        );
        const user = result.rows[0];
        const baseRate = calcTotalRate(user.university, user.is_n_su, user.prev_university, user.gpa_score, user.gpa_status);
        const activeStreak = getActiveStreakFromUser(user);
        const streakMultiplier = getStreakMultiplier(activeStreak);
        const rate = baseRate * streakMultiplier;
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
            diamond: user.diamond || 0,
            university: user.university,
            ticketPrice,
            is_n_su: user.is_n_su,
            prev_university: user.prev_university,
            active_streak: activeStreak,
            streak_bonus_rate: activeStreak > 0 ? STREAK_BONUS_RATE : 0,
            streak_multiplier: streakMultiplier
        };

        const taxBaseRate = getTaxRate(user.university);
        if (user.is_n_su && user.prev_university) {
            const bonus = getTaxRate(user.prev_university) * NSU_BONUS_RATE;
            resp.baseRate = Math.round(taxBaseRate * 100) / 100;
            resp.nsuBonus = Math.round(bonus * 100) / 100;
        }

        const gpaBonus = calcGpaBonus(user.gpa_score, user.gpa_status);
        if (gpaBonus > 0) {
            if (!resp.baseRate) resp.baseRate = Math.round(taxBaseRate * 100) / 100;
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
            'SELECT university, last_tax_collected_at, is_n_su, prev_university, gpa_score, gpa_status, streak_count, streak_last_date FROM users WHERE id = $1 FOR UPDATE',
            [req.session.userId]
        );
        const user = userRes.rows[0];
        const activeStreak = getActiveStreakFromUser(user);
        const rate = calcTotalRate(user.university, user.is_n_su, user.prev_university, user.gpa_score, user.gpa_status) * getStreakMultiplier(activeStreak);

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
             RETURNING id, nickname, university, gold, diamond, exp, tier, tickets, mock_exam_score`,
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
             RETURNING id, nickname, university, gold, diamond, exp, tier, tickets, mock_exam_score`,
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
    'default': { id: 'default', name: '기본 열기구', price: 0, darkImg: 'balloon_dark.png', lightImg: 'balloon_light.png', desc: '처음부터 제공되는 기본 스킨' },
    'aurora': { id: 'aurora', name: '오로라 웨이브', price: 2200, darkImg: 'balloon_dark.png', lightImg: 'balloon_light.png', desc: '오로라처럼 흐르는 네온 그라데이션' },
    'magma': { id: 'magma', name: '마그마 코어', price: 3600, darkImg: 'balloon_dark.png', lightImg: 'balloon_light.png', desc: '용암 결이 살아있는 고열 스킨' },
    'cobalt': { id: 'cobalt', name: '코발트 러너', price: 4800, darkImg: 'balloon_dark.png', lightImg: 'balloon_light.png', desc: '짙은 청색과 은색 라인의 레이싱 무드' },
    'ivory': { id: 'ivory', name: '아이보리 클래식', price: 6200, darkImg: 'balloon_dark.png', lightImg: 'balloon_light.png', desc: '크림 화이트와 골드 트림의 정석 클래식' },
    'mint': { id: 'mint', name: '민트 브리즈', price: 7600, darkImg: 'balloon_dark.png', lightImg: 'balloon_light.png', desc: '민트와 크림이 섞인 산뜻한 프리미엄 톤' },
    'midnight': { id: 'midnight', name: '미드나잇 노바', price: 9100, darkImg: 'balloon_dark.png', lightImg: 'balloon_light.png', desc: '별빛이 스며드는 딥 네이비 테마' },
    'royale': { id: 'royale', name: '로열 벨벳', price: 10800, darkImg: 'balloon_dark.png', lightImg: 'balloon_light.png', desc: '버건디와 샴페인 골드의 왕실 컬러' },
    'prism': { id: 'prism', name: '프리즘 스펙트럼', price: 12600, darkImg: 'balloon_dark.png', lightImg: 'balloon_light.png', desc: '각도마다 달라 보이는 스펙트럼 글로우' },
    'obsidian': { id: 'obsidian', name: '옵시디언 엣지', price: 14800, darkImg: 'balloon_dark.png', lightImg: 'balloon_light.png', desc: '블랙 글래스와 전기 민트 엣지 하이라이트' }
};

const BALLOON_AURAS = {
    'none': { id: 'none', name: '없음', price: 0, desc: '기본 상태' },
    'sun': { id: 'sun', name: '태양 후광', price: 2500, priceDiamond: 0, desc: '따뜻한 황금빛 후광' },
    'frost': { id: 'frost', name: '서리 오오라', price: 4200, priceDiamond: 16, desc: '차가운 푸른빛 기류' },
    'forest': { id: 'forest', name: '숲의 숨결', price: 5200, desc: '초록빛 생명 에너지' },
    'cosmic': { id: 'cosmic', name: '코스믹 링', price: 6800, priceDiamond: 24, desc: '우주 먼지 같은 잔광' },
    'royal': { id: 'royal', name: '로열 크라운', price: 9000, priceDiamond: 32, desc: '보랏빛 왕관형 오오라' }
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

router.get('/auras', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const userRes = await pool.query('SELECT balloon_aura, owned_auras FROM users WHERE id = $1', [req.session.userId]);
        const user = userRes.rows[0];
        const owned = (user.owned_auras || 'none').split(',').map(s => s.trim()).filter(Boolean);
        res.json({ auras: Object.values(BALLOON_AURAS), owned, equipped: user.balloon_aura || 'none' });
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
             RETURNING id, gold, diamond, balloon_skin, owned_skins`,
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

router.post('/buy-aura', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { aura_id, currency = 'gold' } = req.body;
    const aura = BALLOON_AURAS[aura_id];
    if (!aura) return res.status(400).json({ error: '존재하지 않는 오오라입니다.' });
    const payCurrency = currency === 'diamond' ? 'diamond' : 'gold';
    const goldPrice = Number(aura.price || 0);
    const diamondPrice = Number(aura.priceDiamond || 0);

    if (payCurrency === 'diamond' && diamondPrice <= 0) {
        return res.status(400).json({ error: '이 오오라는 다이아 구매를 지원하지 않습니다.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userRes = await client.query('SELECT gold, diamond, owned_auras FROM users WHERE id = $1 FOR UPDATE', [req.session.userId]);
        const user = userRes.rows[0];
        const owned = (user.owned_auras || 'none').split(',').map(s => s.trim()).filter(Boolean);

        if (owned.includes(aura_id)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '이미 보유한 오오라입니다.' });
        }
        if (payCurrency === 'diamond') {
            if ((user.diamond || 0) < diamondPrice) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: `다이아가 부족합니다. 필요: ${diamondPrice}D` });
            }
        } else if (user.gold < goldPrice) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `골드가 부족합니다. 필요: ${goldPrice.toLocaleString()}G` });
        }

        owned.push(aura_id);
        const newOwned = owned.join(',');
        const final = payCurrency === 'diamond'
            ? await client.query(
                `UPDATE users SET diamond = diamond - $1, owned_auras = $2 WHERE id = $3
                 RETURNING id, gold, diamond, balloon_aura, owned_auras`,
                [diamondPrice, newOwned, req.session.userId]
            )
            : await client.query(
                `UPDATE users SET gold = gold - $1, owned_auras = $2 WHERE id = $3
                 RETURNING id, gold, diamond, balloon_aura, owned_auras`,
                [goldPrice, newOwned, req.session.userId]
            );
        await client.query('COMMIT');
        res.json({
            ok: true,
            currency: payCurrency,
            spentGold: payCurrency === 'gold' ? goldPrice : 0,
            spentDiamond: payCurrency === 'diamond' ? diamondPrice : 0,
            user: final.rows[0]
        });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/equip-aura', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { aura_id } = req.body;
    if (!BALLOON_AURAS[aura_id]) return res.status(400).json({ error: '존재하지 않는 오오라입니다.' });

    try {
        const userRes = await pool.query('SELECT owned_auras FROM users WHERE id = $1', [req.session.userId]);
        const owned = (userRes.rows[0].owned_auras || 'none').split(',').map(s => s.trim()).filter(Boolean);
        if (!owned.includes(aura_id)) return res.status(400).json({ error: '보유하지 않은 오오라입니다.' });

        await pool.query('UPDATE users SET balloon_aura = $1 WHERE id = $2', [aura_id, req.session.userId]);
        res.json({ ok: true, equipped: aura_id });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

router.get('/diamond/packages', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    res.json({
        packages: DIAMOND_PACKAGES,
        note: '다이아는 유료 결제로만 충전할 수 있습니다.'
    });
});

router.post('/diamond/web/prepare', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const packageId = String(req.body?.package_id || '');
    const pkg = findDiamondPackage(packageId);
    if (!pkg) return res.status(400).json({ error: '존재하지 않는 다이아 상품입니다.' });

    const tossClientKey = process.env.TOSS_PAYMENTS_CLIENT_KEY || '';
    if (!tossClientKey) {
        return res.status(503).json({ error: '토스 결제 키 설정이 누락되었습니다.' });
    }

    const orderId = makeDiamondOrderId(req.session.userId);
    try {
        await pool.query(
            `INSERT INTO diamond_payment_orders (order_id, user_id, package_id, provider, amount_krw, status)
             VALUES ($1, $2, $3, 'toss', $4, 'pending')`,
            [orderId, req.session.userId, pkg.id, pkg.priceKrw]
        );
        return res.json({
            ok: true,
            provider: 'toss',
            clientKey: tossClientKey,
            orderId,
            amount: pkg.priceKrw,
            orderName: `${pkg.diamonds} 다이아`
        });
    } catch (err) {
        console.error('diamond/web/prepare error:', err);
        return res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/diamond/web/confirm', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const paymentKey = String(req.body?.paymentKey || '').trim();
    const orderId = String(req.body?.orderId || '').trim();
    const amount = parseInt(req.body?.amount, 10);

    if (!paymentKey || !orderId || !Number.isInteger(amount)) {
        return res.status(400).json({ error: '결제 확인 정보가 올바르지 않습니다.' });
    }

    const tossSecret = process.env.TOSS_PAYMENTS_SECRET_KEY || '';
    if (!tossSecret) {
        return res.status(503).json({ error: '토스 시크릿 키 설정이 누락되었습니다.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const orderRes = await client.query(
            `SELECT order_id, user_id, package_id, amount_krw, status
             FROM diamond_payment_orders
             WHERE order_id = $1
             FOR UPDATE`,
            [orderId]
        );
        const order = orderRes.rows[0];
        if (!order) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '결제 주문을 찾을 수 없습니다.' });
        }
        if (Number(order.user_id) !== Number(req.session.userId)) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: '결제 주문 접근 권한이 없습니다.' });
        }
        if (order.status === 'paid') {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: '이미 처리된 결제입니다.' });
        }
        if (Number(order.amount_krw) !== amount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '결제 금액이 주문 금액과 일치하지 않습니다.' });
        }

        let tossResult;
        try {
            tossResult = await axios.post(
                'https://api.tosspayments.com/v1/payments/confirm',
                { paymentKey, orderId, amount },
                {
                    headers: {
                        Authorization: `Basic ${Buffer.from(`${tossSecret}:`).toString('base64')}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 12000
                }
            );
        } catch (apiErr) {
            await client.query('ROLLBACK');
            const status = apiErr?.response?.status || 400;
            const msg = apiErr?.response?.data?.message || '토스 결제 검증에 실패했습니다.';
            return res.status(status).json({ error: msg });
        }

        const confirmData = tossResult.data || {};
        if (confirmData.status !== 'DONE') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '완료되지 않은 결제입니다.' });
        }

        const pkg = findDiamondPackage(order.package_id);
        if (!pkg) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '상품 정보가 올바르지 않습니다.' });
        }

        await client.query(
            `INSERT INTO diamond_purchases (user_id, package_id, diamonds, paid_amount_krw, provider, provider_tx_id)
             VALUES ($1, $2, $3, $4, 'toss', $5)`,
            [req.session.userId, pkg.id, pkg.diamonds, order.amount_krw, paymentKey]
        );

        await client.query(
            `UPDATE diamond_payment_orders
             SET status = 'paid', paid_at = NOW()
             WHERE order_id = $1`,
            [orderId]
        );

        const userRes = await client.query(
            `UPDATE users
             SET diamond = COALESCE(diamond, 0) + $1
             WHERE id = $2
             RETURNING id, nickname, university, gold, diamond, exp, tier, tickets, mock_exam_score`,
            [pkg.diamonds, req.session.userId]
        );

        await client.query('COMMIT');
        return res.json({ ok: true, addedDiamond: pkg.diamonds, user: userRes.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err?.code === '23505') {
            return res.status(409).json({ error: '이미 처리된 결제입니다.' });
        }
        console.error('diamond/web/confirm error:', err);
        return res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/diamond/app/complete', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const {
        package_id,
        provider,
        provider_tx_id,
        paid_amount_krw,
        payment_signature
    } = req.body || {};

    const providerName = String(provider || '').trim().toLowerCase();
    if (!['googleplay', 'appstore'].includes(providerName)) {
        return res.status(400).json({ error: '앱 결제는 구글플레이/앱스토어만 지원합니다.' });
    }

    const pkg = findDiamondPackage(String(package_id || ''));
    if (!pkg) return res.status(400).json({ error: '존재하지 않는 다이아 상품입니다.' });

    const paidAmount = parseInt(paid_amount_krw, 10);
    if (!Number.isInteger(paidAmount) || paidAmount !== pkg.priceKrw) {
        return res.status(400).json({ error: '결제 금액 검증에 실패했습니다.' });
    }

    const txId = String(provider_tx_id || '').trim();
    if (!txId || txId.length < 6 || txId.length > 120) {
        return res.status(400).json({ error: '유효하지 않은 결제 거래번호입니다.' });
    }

    // 앱 결제도 서버 서명 검증을 통해 자동 반영.
    const expectedSig = createExpectedPaymentSignature(
        req.session.userId,
        'app',
        providerName,
        pkg.id,
        paidAmount,
        txId
    );
    if (!expectedSig) {
        return res.status(503).json({ error: '앱 결제 검증 시크릿이 누락되어 결제를 처리할 수 없습니다.' });
    }
    if (!timingSafeHexEqual(expectedSig, String(payment_signature || ''))) {
        return res.status(403).json({ error: '앱 결제 검증에 실패했습니다.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `INSERT INTO diamond_purchases (user_id, package_id, diamonds, paid_amount_krw, provider, provider_tx_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [req.session.userId, pkg.id, pkg.diamonds, pkg.priceKrw, providerName, txId]
        );

        const userRes = await client.query(
            `UPDATE users
             SET diamond = COALESCE(diamond, 0) + $1
             WHERE id = $2
             RETURNING id, nickname, university, gold, diamond, exp, tier, tickets, mock_exam_score`,
            [pkg.diamonds, req.session.userId]
        );

        await client.query('COMMIT');
        return res.json({ ok: true, addedDiamond: pkg.diamonds, user: userRes.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err?.code === '23505') {
            return res.status(409).json({ error: '이미 처리된 결제입니다.' });
        }
        console.error('diamond/app/complete error:', err);
        return res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/diamond/purchase', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const {
        package_id,
        provider,
        provider_tx_id,
        paid_amount_krw,
        payment_signature
    } = req.body || {};
    const clientPlatform = resolveClientPlatform(req);

    const pkg = findDiamondPackage(String(package_id || ''));
    if (!pkg) return res.status(400).json({ error: '존재하지 않는 다이아 상품입니다.' });

    const paidAmount = parseInt(paid_amount_krw, 10);
    if (!Number.isInteger(paidAmount) || paidAmount !== pkg.priceKrw) {
        return res.status(400).json({ error: '결제 금액 검증에 실패했습니다.' });
    }

    const txId = String(provider_tx_id || '').trim();
    if (!txId || txId.length < 6 || txId.length > 120) {
        return res.status(400).json({ error: '유효하지 않은 결제 거래번호입니다.' });
    }

    const providerName = String(provider || '').trim().toLowerCase();
    if (!providerName) {
        return res.status(400).json({ error: '결제 수단 정보가 필요합니다.' });
    }
    const allowedProviders = DIAMOND_PROVIDER_BY_PLATFORM[clientPlatform] || [];
    if (!allowedProviders.includes(providerName)) {
        if (clientPlatform === 'web') {
            return res.status(400).json({ error: '웹 결제는 토스(toss)만 지원합니다.' });
        }
        return res.status(400).json({ error: '앱 결제는 구글플레이/앱스토어만 지원합니다.' });
    }

    const expectedSig = createExpectedPaymentSignature(
        req.session.userId,
        clientPlatform,
        providerName,
        pkg.id,
        paidAmount,
        txId
    );
    if (!expectedSig) {
        return res.status(503).json({ error: '결제 검증 시크릿이 누락되어 다이아 결제를 처리할 수 없습니다.' });
    }

    if (!timingSafeHexEqual(expectedSig, String(payment_signature || ''))) {
        return res.status(403).json({ error: '결제 검증에 실패했습니다.' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        await client.query(
            `INSERT INTO diamond_purchases (user_id, package_id, diamonds, paid_amount_krw, provider, provider_tx_id)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [req.session.userId, pkg.id, pkg.diamonds, pkg.priceKrw, providerName, txId]
        );

        const userRes = await client.query(
            `UPDATE users
             SET diamond = COALESCE(diamond, 0) + $1
             WHERE id = $2
             RETURNING id, nickname, university, gold, diamond, exp, tier, tickets, mock_exam_score`,
            [pkg.diamonds, req.session.userId]
        );

        await client.query('COMMIT');
        return res.json({ ok: true, addedDiamond: pkg.diamonds, user: userRes.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        if (err?.code === '23505') {
            return res.status(409).json({ error: '이미 처리된 결제입니다.' });
        }
        console.error('diamond/purchase error:', err);
        return res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

// ── UI 테마 ────────────────────────────────────────────────────────────
router.get('/themes', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const { rows } = await pool.query(
            'SELECT ui_theme, owned_themes FROM users WHERE id=$1',
            [req.session.userId]
        );
        const row = rows[0] || {};
        const equipped = row.ui_theme || 'default';
        const owned = (row.owned_themes || 'default').split(',').map(s => s.trim()).filter(Boolean);
        res.json({ themes: UI_THEMES, owned, equipped });
    } catch (err) {
        console.error('themes error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/buy-theme', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { themeId, currency = 'gold' } = req.body || {};
    const theme = UI_THEMES.find(t => t.id === themeId);
    if (!theme) return res.status(400).json({ error: '존재하지 않는 테마입니다.' });
    if (!['gold', 'diamond'].includes(currency)) return res.status(400).json({ error: '유효하지 않은 통화입니다.' });

    const price = currency === 'diamond' ? theme.priceDiamond : theme.priceGold;
    if (price === 0) {
        await pool.query(
            `UPDATE users
             SET owned_themes = CASE
               WHEN owned_themes IS NULL OR owned_themes = '' THEN $1
               WHEN owned_themes LIKE '%' || $1 || '%' THEN owned_themes
               ELSE owned_themes || ',' || $1
             END,
             ui_theme = $1
             WHERE id = $2`,
            [themeId, req.session.userId]
        );
        return res.json({ ok: true, equipped: themeId });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(
            'SELECT gold, diamond, owned_themes FROM users WHERE id=$1 FOR UPDATE',
            [req.session.userId]
        );
        const row = rows[0];
        if (!row) { await client.query('ROLLBACK'); return res.status(404).json({ error: '유저 없음' }); }
        const owned = (row.owned_themes || 'default').split(',').map(s => s.trim());
        if (owned.includes(themeId)) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: '이미 보유한 테마입니다.' });
        }
        if (currency === 'diamond' && (row.diamond || 0) < price) {
            await client.query('ROLLBACK');
            return res.status(402).json({ error: `다이아가 부족합니다. (필요: ${price}D)` });
        }
        if (currency === 'gold' && (row.gold || 0) < price) {
            await client.query('ROLLBACK');
            return res.status(402).json({ error: `골드가 부족합니다. (필요: ${price}G)` });
        }
        const newOwned = [...owned, themeId].join(',');
        const col = currency === 'diamond' ? 'diamond' : 'gold';
        const { rows: updated } = await client.query(
            `UPDATE users SET ${col} = ${col} - $1, owned_themes = $2, ui_theme = $3 WHERE id = $4
             RETURNING id, nickname, gold, diamond, ui_theme, owned_themes`,
            [price, newOwned, themeId, req.session.userId]
        );
        await client.query('COMMIT');
        res.json({ ok: true, user: updated[0], equipped: themeId });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('buy-theme error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/equip-theme', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { themeId } = req.body || {};
    if (!UI_THEMES.find(t => t.id === themeId)) return res.status(400).json({ error: '존재하지 않는 테마입니다.' });
    const { rows } = await pool.query('SELECT owned_themes FROM users WHERE id=$1', [req.session.userId]);
    const owned = (rows[0]?.owned_themes || 'default').split(',').map(s => s.trim());
    if (!owned.includes(themeId)) return res.status(403).json({ error: '보유하지 않은 테마입니다.' });
    await pool.query('UPDATE users SET ui_theme=$1 WHERE id=$2', [themeId, req.session.userId]);
    res.json({ ok: true, equipped: themeId });
});

module.exports = router;
