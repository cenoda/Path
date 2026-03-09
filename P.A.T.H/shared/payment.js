/**
 * P.A.T.H 결제 헬퍼
 * 플랫폼(web/android/ios)에 따라 적절한 결제 수단을 사용합니다.
 *
 * 웹: 토스페이먼츠 결제창
 * Android: Google Play Billing (@capacitor-community/in-app-purchases)
 * iOS: Apple StoreKit (@capacitor-community/in-app-purchases)
 *
 * 사용법:
 *   import { purchaseGoldPack } from '/shared/payment.js';
 *   await purchaseGoldPack('standard');
 */

// ── 토스페이먼츠 클라이언트 키 ──────────────────────────────────────────────
// 실제 클라이언트 키로 교체 (환경별 분리는 서버 설정 참고)
const TOSS_CLIENT_KEY = window.__TOSS_CLIENT_KEY__ || 'test_ck_placeholder';

// ── 플랫폼 감지 ────────────────────────────────────────────────────────────
function getPlatform() {
    // Capacitor 환경 감지
    if (window.Capacitor && window.Capacitor.getPlatform) {
        return window.Capacitor.getPlatform(); // 'web' | 'android' | 'ios'
    }
    return 'web';
}

// ── 골드 팩 구매 메인 함수 ──────────────────────────────────────────────────
export async function purchaseGoldPack(packId) {
    const platform = getPlatform();

    if (platform === 'web') {
        return purchaseGoldPackWeb(packId);
    } else {
        return purchaseGoldPackMobile(packId, platform);
    }
}

// ── 프리미엄 구독 시작 메인 함수 ────────────────────────────────────────────
export async function subscribePremium(planId = 'premium_monthly') {
    const platform = getPlatform();

    if (platform === 'web') {
        return subscribePremiumWeb(planId);
    } else {
        return subscribePremiumMobile(planId, platform);
    }
}

// ── 프리미엄 구독 상태 조회 ──────────────────────────────────────────────────
export async function getSubscriptionStatus() {
    const res = await fetch('/api/payment/subscription/status');
    return res.json();
}

// ── 일일 로그인 보너스 수령 ──────────────────────────────────────────────────
export async function claimDailyBonus() {
    const res = await fetch('/api/payment/subscription/daily-bonus', { method: 'POST' });
    return res.json();
}

// ── 웹 결제 (토스페이먼츠) ──────────────────────────────────────────────────
async function purchaseGoldPackWeb(packId) {
    // 1. 서버에서 orderId 발급
    const initiateRes = await fetch('/api/payment/web/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pack_id: packId }),
    });
    if (!initiateRes.ok) {
        const err = await initiateRes.json();
        throw new Error(err.error || '결제 시작 실패');
    }
    const { orderId, amount, pack } = await initiateRes.json();

    // 2. 토스페이먼츠 SDK 로드 (CDN)
    const tossPayments = await loadTossPayments();

    // 3. 결제창 호출
    const successUrl = `${location.origin}/mainHub/?payment=success`;
    const failUrl = `${location.origin}/mainHub/?payment=fail`;

    await tossPayments.requestPayment('카드', {
        amount,
        orderId,
        orderName: pack.name,
        customerName: '수험생',
        successUrl,
        failUrl,
    });
    // 결제창에서 successUrl로 리다이렉트 됨
}

async function subscribePremiumWeb(planId) {
    const planNames = {
        premium_monthly: '프리미엄 패스 (월간)',
        premium_yearly: '프리미엄 패스 (연간)',
    };
    const planPrices = {
        premium_monthly: 2900,
        premium_yearly: 24000,
    };

    const orderId = `PATH-SUB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const tossPayments = await loadTossPayments();

    const successUrl = `${location.origin}/mainHub/?subscription=success&plan=${planId}&orderId=${orderId}`;
    const failUrl = `${location.origin}/mainHub/?subscription=fail`;

    await tossPayments.requestPayment('카드', {
        amount: planPrices[planId],
        orderId,
        orderName: planNames[planId] || '프리미엄 패스',
        customerName: '수험생',
        successUrl,
        failUrl,
    });
}

// ── 모바일 결제 (Google Play / Apple IAP) ───────────────────────────────────
async function purchaseGoldPackMobile(packId, platform) {
    // @capacitor-community/in-app-purchases 필요
    // npm install @capacitor-community/in-app-purchases
    const { InAppPurchase2 } = await import('@capacitor-community/in-app-purchases');

    // 스토어 제품 ID 매핑 (Google Play Console / App Store Connect에 등록된 ID와 일치해야 함)
    const storeProductIds = {
        mini:     'path_gold_mini',
        standard: 'path_gold_standard',
        large:    'path_gold_large',
        mega:     'path_gold_mega',
    };

    const productId = storeProductIds[packId];
    if (!productId) throw new Error('올바르지 않은 팩입니다.');

    // 구매 실행
    const result = await InAppPurchase2.purchase({ productId });

    // 서버에 영수증 검증 요청
    const verifyRes = await fetch('/api/payment/mobile/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            platform,
            pack_id: packId,
            receipt: result.receipt,
            purchaseToken: result.purchaseToken,
            transactionId: result.transactionId,
        }),
    });

    if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || '영수증 검증 실패');
    }

    // 구매 완료 처리 (consume)
    await InAppPurchase2.finish({ productId, purchaseToken: result.purchaseToken });

    return verifyRes.json();
}

async function subscribePremiumMobile(planId, platform) {
    const { InAppPurchase2 } = await import('@capacitor-community/in-app-purchases');

    const storeProductIds = {
        premium_monthly: 'path_premium_monthly',
        premium_yearly:  'path_premium_yearly',
    };

    const productId = storeProductIds[planId];
    if (!productId) throw new Error('올바르지 않은 플랜입니다.');

    const result = await InAppPurchase2.subscribe({ productId });

    const verifyRes = await fetch('/api/payment/mobile/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            platform,
            pack_id: planId,
            receipt: result.receipt,
            purchaseToken: result.purchaseToken,
            transactionId: result.transactionId,
            itemType: 'subscription',
        }),
    });

    if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || '구독 처리 실패');
    }

    return verifyRes.json();
}

// ── 결제 성공 파라미터 처리 (successUrl 리다이렉트 후 호출) ───────────────────
export async function handlePaymentReturn() {
    const params = new URLSearchParams(location.search);

    // 골드 팩 결제 완료
    if (params.get('payment') === 'success') {
        const paymentKey = params.get('paymentKey');
        const orderId = params.get('orderId');
        const amount = params.get('amount');

        const res = await fetch('/api/payment/web/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paymentKey, orderId, amount: parseInt(amount) }),
        });
        const data = await res.json();
        if (data.ok) {
            return { type: 'gold', goldAdded: data.goldAdded, gold: data.gold };
        }
        throw new Error(data.error || '결제 확인 실패');
    }

    // 구독 결제 완료
    if (params.get('subscription') === 'success') {
        const paymentKey = params.get('paymentKey');
        const orderId = params.get('orderId');
        const amount = params.get('amount');
        const planId = params.get('plan');

        const res = await fetch('/api/payment/subscription/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ plan_id: planId, paymentKey, orderId, amount: parseInt(amount) }),
        });
        const data = await res.json();
        if (data.ok) {
            return { type: 'subscription', expiresAt: data.expiresAt };
        }
        throw new Error(data.error || '구독 처리 실패');
    }

    return null;
}

// ── 토스페이먼츠 SDK 로드 ─────────────────────────────────────────────────────
let _tossInstance = null;
async function loadTossPayments() {
    if (_tossInstance) return _tossInstance;

    if (!window.TossPayments) {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://js.tosspayments.com/v1/payment';
            script.onload = resolve;
            script.onerror = () => reject(new Error('토스페이먼츠 SDK 로드 실패'));
            document.head.appendChild(script);
        });
    }

    _tossInstance = window.TossPayments(TOSS_CLIENT_KEY);
    return _tossInstance;
}
