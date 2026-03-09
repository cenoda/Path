const express = require('express');
const pool = require('../db');
const https = require('https');
const crypto = require('crypto');

const router = express.Router();

// ── 골드 팩 정의 ──────────────────────────────────────────────────────────────
// 앱 가격은 앱스토어 수수료(15~30%) 반영하여 웹보다 높게 책정
const GOLD_PACKS = {
    'mini':     { id: 'mini',     name: '미니 팩',     gold: 1000,  webPrice: 990,   appPrice: 1200 },
    'standard': { id: 'standard', name: '스탠다드 팩', gold: 3300,  webPrice: 2200,  appPrice: 2600 },  // +10% 보너스
    'large':    { id: 'large',    name: '대형 팩',     gold: 9600,  webPrice: 4900,  appPrice: 5900 },  // +20% 보너스
    'mega':     { id: 'mega',     name: '메가 팩',     gold: 26000, webPrice: 9900,  appPrice: 11900 }, // +30% 보너스
};

// ── 프리미엄 패스 정의 ─────────────────────────────────────────────────────────
const SUBSCRIPTION_PLANS = {
    'premium_monthly': { id: 'premium_monthly', name: '프리미엄 패스 (월간)', webPrice: 2900, appPrice: 3500, durationDays: 30 },
    'premium_yearly':  { id: 'premium_yearly',  name: '프리미엄 패스 (연간)', webPrice: 24000, appPrice: 29000, durationDays: 365 },
};

// ── 골드 팩 목록 조회 ──────────────────────────────────────────────────────────
router.get('/packs', (req, res) => {
    res.json({ packs: Object.values(GOLD_PACKS), plans: Object.values(SUBSCRIPTION_PLANS) });
});

// ── 웹 결제 시작 (토스페이먼츠) ───────────────────────────────────────────────
// 클라이언트가 호출 → orderId 생성 → 토스 결제창 띄움
router.post('/web/initiate', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { pack_id } = req.body;
    const pack = GOLD_PACKS[pack_id];
    if (!pack) return res.status(400).json({ error: '올바르지 않은 팩입니다.' });

    const orderId = `PATH-${req.session.userId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    try {
        await pool.query(
            `INSERT INTO payments (user_id, platform, order_id, amount, gold_amount, item_type, status)
             VALUES ($1, 'web', $2, $3, $4, 'gold_pack', 'pending')`,
            [req.session.userId, orderId, pack.webPrice, pack.gold]
        );
        res.json({ orderId, amount: pack.webPrice, pack });
    } catch (err) {
        console.error('payment initiate error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 웹 결제 확인 (토스페이먼츠 결제 완료 후 호출) ──────────────────────────────
router.post('/web/confirm', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { paymentKey, orderId, amount } = req.body;
    if (!paymentKey || !orderId || !amount) return res.status(400).json({ error: '필수 파라미터 누락' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const paymentRes = await client.query(
            'SELECT * FROM payments WHERE order_id = $1 AND user_id = $2 AND status = $3 FOR UPDATE',
            [orderId, req.session.userId, 'pending']
        );
        if (!paymentRes.rows.length) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '결제 정보를 찾을 수 없습니다.' });
        }

        const payment = paymentRes.rows[0];
        if (parseInt(amount) !== payment.amount) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '결제 금액이 일치하지 않습니다.' });
        }

        const tossSecretKey = process.env.TOSS_SECRET_KEY;
        if (!tossSecretKey) {
            await client.query('ROLLBACK');
            return res.status(500).json({ error: '결제 서비스가 설정되지 않았습니다.' });
        }

        const tossResult = await callTossPaymentsConfirm(tossSecretKey, paymentKey, orderId, parseInt(amount));
        if (tossResult.status !== 'DONE') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `결제 실패: ${tossResult.message || '알 수 없는 오류'}` });
        }

        await client.query(
            'UPDATE payments SET payment_key = $1, status = $2 WHERE order_id = $3',
            [paymentKey, 'done', orderId]
        );
        const userRes = await client.query(
            'UPDATE users SET gold = gold + $1 WHERE id = $2 RETURNING gold',
            [payment.gold_amount, req.session.userId]
        );
        await client.query('COMMIT');
        res.json({ ok: true, goldAdded: payment.gold_amount, gold: userRes.rows[0].gold });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('payment confirm error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

// ── 모바일 IAP 영수증 검증 (Google Play / Apple) ────────────────────────────────
// Capacitor @capacitor-community/in-app-purchases 사용 시 클라이언트에서 영수증 수신 후 이 API로 전송
router.post('/mobile/verify', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { platform, pack_id, receipt, purchaseToken, transactionId } = req.body;
    if (!platform || !pack_id) return res.status(400).json({ error: '필수 파라미터 누락' });

    const pack = GOLD_PACKS[pack_id];
    if (!pack) return res.status(400).json({ error: '올바르지 않은 팩입니다.' });

    // 중복 결제 방지: transactionId로 이미 처리된 결제인지 확인
    const dupCheck = await pool.query(
        'SELECT id FROM payments WHERE payment_key = $1 AND status = $2',
        [transactionId || purchaseToken, 'done']
    );
    if (dupCheck.rows.length) return res.status(400).json({ error: '이미 처리된 결제입니다.' });

    const orderId = `PATH-MOB-${req.session.userId}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    try {
        let verified = false;

        if (platform === 'android') {
            verified = await verifyGooglePlay(purchaseToken, pack_id);
        } else if (platform === 'ios') {
            verified = await verifyAppleIAP(receipt);
        } else {
            return res.status(400).json({ error: '지원하지 않는 플랫폼입니다.' });
        }

        if (!verified) {
            return res.status(400).json({ error: '영수증 검증 실패' });
        }

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(
                `INSERT INTO payments (user_id, platform, payment_key, order_id, amount, gold_amount, item_type, status)
                 VALUES ($1, $2, $3, $4, $5, $6, 'gold_pack', 'done')`,
                [req.session.userId, platform, transactionId || purchaseToken, orderId, pack.appPrice, pack.gold]
            );
            const userRes = await client.query(
                'UPDATE users SET gold = gold + $1 WHERE id = $2 RETURNING gold',
                [pack.gold, req.session.userId]
            );
            await client.query('COMMIT');
            res.json({ ok: true, goldAdded: pack.gold, gold: userRes.rows[0].gold });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (err) {
        console.error('mobile IAP verify error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 프리미엄 구독 시작 (웹) ──────────────────────────────────────────────────
router.post('/subscription/subscribe', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { plan_id, paymentKey, orderId, amount } = req.body;
    const plan = SUBSCRIPTION_PLANS[plan_id];
    if (!plan) return res.status(400).json({ error: '올바르지 않은 플랜입니다.' });
    if (!paymentKey || !orderId || !amount) return res.status(400).json({ error: '결제 정보 누락' });
    if (parseInt(amount) !== plan.webPrice) return res.status(400).json({ error: '금액 불일치' });

    const tossSecretKey = process.env.TOSS_SECRET_KEY;
    if (!tossSecretKey) return res.status(500).json({ error: '결제 서비스가 설정되지 않았습니다.' });

    const tossResult = await callTossPaymentsConfirm(tossSecretKey, paymentKey, orderId, parseInt(amount));
    if (tossResult.status !== 'DONE') {
        return res.status(400).json({ error: `결제 실패: ${tossResult.message || '알 수 없는 오류'}` });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + plan.durationDays);

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            `INSERT INTO subscriptions (user_id, platform, plan_id, expires_at, status)
             VALUES ($1, 'web', $2, $3, 'active')
             ON CONFLICT (user_id) DO UPDATE
             SET plan_id = $2, expires_at = $3, status = 'active', started_at = NOW()`,
            [req.session.userId, plan_id, expiresAt]
        );
        await client.query(
            'UPDATE users SET is_premium = TRUE, premium_expires_at = $1 WHERE id = $2',
            [expiresAt, req.session.userId]
        );
        await client.query('COMMIT');
        res.json({ ok: true, expiresAt });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('subscribe error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

// ── 구독 해지 ────────────────────────────────────────────────────────────────
router.post('/subscription/cancel', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        await pool.query(
            'UPDATE subscriptions SET status = $1 WHERE user_id = $2',
            ['canceled', req.session.userId]
        );
        res.json({ ok: true, message: '구독이 해지되었습니다. 만료일까지 혜택은 유지됩니다.' });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 구독 상태 조회 ───────────────────────────────────────────────────────────
router.get('/subscription/status', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const result = await pool.query(
            'SELECT plan_id, started_at, expires_at, status FROM subscriptions WHERE user_id = $1',
            [req.session.userId]
        );
        const userRes = await pool.query(
            'SELECT is_premium, premium_expires_at FROM users WHERE id = $1',
            [req.session.userId]
        );
        const user = userRes.rows[0];

        // 만료된 구독 자동 처리
        if (user.is_premium && user.premium_expires_at && new Date(user.premium_expires_at) < new Date()) {
            await pool.query(
                'UPDATE users SET is_premium = FALSE WHERE id = $1',
                [req.session.userId]
            );
            user.is_premium = false;
        }

        res.json({
            isPremium: user.is_premium,
            premiumExpiresAt: user.premium_expires_at,
            subscription: result.rows[0] || null,
            plans: Object.values(SUBSCRIPTION_PLANS),
        });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 프리미엄 일일 로그인 보너스 (+50G) ───────────────────────────────────────
// 앱 시작 시 or 메인허브 진입 시 클라이언트가 호출
const PREMIUM_DAILY_BONUS = 50;

router.post('/subscription/daily-bonus', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const userRes = await pool.query(
            'SELECT is_premium, premium_expires_at, last_daily_bonus_at FROM users WHERE id = $1',
            [req.session.userId]
        );
        const user = userRes.rows[0];

        // 프리미엄 만료 체크
        if (!user.is_premium || (user.premium_expires_at && new Date(user.premium_expires_at) < new Date())) {
            return res.json({ ok: false, reason: 'not_premium' });
        }

        // 오늘 이미 수령했는지 확인 (KST 기준 날짜)
        const now = new Date();
        const todayKST = new Date(now.getTime() + 9 * 3600000);
        const todayStr = todayKST.toISOString().slice(0, 10);

        if (user.last_daily_bonus_at) {
            const lastKST = new Date(new Date(user.last_daily_bonus_at).getTime() + 9 * 3600000);
            const lastStr = lastKST.toISOString().slice(0, 10);
            if (lastStr === todayStr) {
                return res.json({ ok: false, reason: 'already_claimed' });
            }
        }

        const updated = await pool.query(
            'UPDATE users SET gold = gold + $1, last_daily_bonus_at = NOW() WHERE id = $2 RETURNING gold',
            [PREMIUM_DAILY_BONUS, req.session.userId]
        );
        res.json({ ok: true, bonusGold: PREMIUM_DAILY_BONUS, gold: updated.rows[0].gold });
    } catch (err) {
        console.error('daily-bonus error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 결제 내역 조회 ───────────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const result = await pool.query(
            `SELECT id, platform, amount, gold_amount, item_type, status, created_at
             FROM payments WHERE user_id = $1 AND status = 'done'
             ORDER BY created_at DESC LIMIT 50`,
            [req.session.userId]
        );
        res.json({ payments: result.rows });
    } catch (err) {
        res.status(500).json({ error: '서버 오류' });
    }
});

// ── 헬퍼: 토스페이먼츠 결제 확인 API 호출 ────────────────────────────────────
function callTossPaymentsConfirm(secretKey, paymentKey, orderId, amount) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ orderId, amount });
        const auth = Buffer.from(`${secretKey}:`).toString('base64');
        const options = {
            hostname: 'api.tosspayments.com',
            port: 443,
            path: `/v1/payments/${encodeURIComponent(paymentKey)}`,
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };
        // POST to confirm endpoint
        options.path = '/v1/payments/confirm';
        const req = https.request(options, (response) => {
            let data = '';
            response.on('data', (chunk) => data += chunk);
            response.on('end', () => {
                try { resolve(JSON.parse(data)); }
                catch (e) { reject(new Error('토스페이먼츠 응답 파싱 실패')); }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

// ── 헬퍼: Google Play 영수증 검증 ────────────────────────────────────────────
// Google Play Billing에서 받은 purchaseToken을 서버에서 검증
// 필요 환경변수: GOOGLE_PLAY_PACKAGE_NAME, GOOGLE_SERVICE_ACCOUNT_KEY (JSON)
async function verifyGooglePlay(purchaseToken, productId) {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
    const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;
    if (!serviceAccountKey || !packageName) {
        console.warn('[payment] GOOGLE_SERVICE_ACCOUNT_KEY 또는 GOOGLE_PLAY_PACKAGE_NAME 미설정');
        return false;
    }
    // TODO: Google Play Developer API로 영수증 검증
    // https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.products/get
    // axios로 Google OAuth2 token 발급 후 API 호출 필요
    // 현재는 구조만 작성 (실제 구현 시 googleapis 라이브러리 추가 권장)
    console.warn('[payment] Google Play 영수증 검증 미구현 - 프로덕션 전 구현 필요');
    return false;
}

// ── 헬퍼: Apple IAP 영수증 검증 ─────────────────────────────────────────────
// App Store에서 받은 receipt-data를 Apple 서버에서 검증
// 필요 환경변수: APPLE_IAP_SHARED_SECRET
async function verifyAppleIAP(receipt) {
    const sharedSecret = process.env.APPLE_IAP_SHARED_SECRET;
    if (!sharedSecret) {
        console.warn('[payment] APPLE_IAP_SHARED_SECRET 미설정');
        return false;
    }
    // TODO: Apple App Store 영수증 검증
    // https://developer.apple.com/documentation/appstorereceipts/verifyreceipt
    // sandbox: https://sandbox.itunes.apple.com/verifyReceipt
    // production: https://buy.itunes.apple.com/verifyReceipt
    console.warn('[payment] Apple IAP 영수증 검증 미구현 - 프로덕션 전 구현 필요');
    return false;
}

module.exports = router;
module.exports.GOLD_PACKS = GOLD_PACKS;
module.exports.SUBSCRIPTION_PLANS = SUBSCRIPTION_PLANS;
