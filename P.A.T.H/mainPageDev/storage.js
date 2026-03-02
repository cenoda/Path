const StorageManager = {
    _cache: null,

    async load() {
        try {
            const r = await fetch('/api/auth/me', { credentials: 'include' });
            if (!r.ok) {
                window.location.href = '/P.A.T.H/login/index.html';
                return null;
            }
            const data = await r.json();
            this._cache = data.user;
            return data.user;
        } catch (e) {
            console.error('StorageManager.load 오류:', e);
            return null;
        }
    },

    // earnedExp: 분 단위 (server에서 duration_sec = earnedExp * 60 계산)
    async addRewards(earnedExp, type, originalSec) {
        try {
            const r = await fetch('/api/study/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    duration_sec: earnedExp * 60,
                    result: type,
                    original_duration_sec: originalSec || 0
                })
            });
            if (!r.ok) {
                const err = await r.json();
                console.error('보상 저장 오류:', err);
                return { user: this._cache, earnedGold: 0, earnedTicket: 0 };
            }
            const data = await r.json();
            this._cache = data.user;
            return { user: data.user, earnedGold: data.earnedGold || 0, earnedTicket: 0 };
        } catch (e) {
            console.error('StorageManager.addRewards 오류:', e);
            return { user: this._cache, earnedGold: 0, earnedTicket: 0 };
        }
    }
};
