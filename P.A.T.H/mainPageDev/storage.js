const StorageManager = {
    _cache: null,

    async load() {
        try {
            const r = await fetch('/api/auth/me', { credentials: 'include' });
            if (!r.ok) {
                window.location.href = '/login/';
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

    async completeStudy(type, mode = 'timer') {
        try {
            const r = await fetch('/api/study/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ result: type, mode })
            });
            if (!r.ok) {
                const err = await r.json();
                console.error('보상 저장 오류:', err);
                return { user: this._cache, earnedGold: 0 };
            }
            const data = await r.json();
            this._cache = data.user;
            return {
                user: data.user,
                earnedGold: data.earnedGold || 0,
                studyRecordId: data.studyRecordId || null
            };
        } catch (e) {
            console.error('StorageManager.completeStudy 오류:', e);
            return { user: this._cache, earnedGold: 0 };
        }
    },

    async uploadStudyProof(recordId, files) {
        const formData = new FormData();
        formData.append('record_id', String(recordId));
        for (const file of files) {
            formData.append('studyProof', file);
        }

        const r = await fetch('/api/study/upload-proof', {
            method: 'POST',
            credentials: 'include',
            body: formData
        });

        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || '인증샷 업로드 실패');

        if (data.user) this._cache = data.user;
        return data;
    },

    async fetchSubjects() {
        try {
            const r = await fetch('/api/study/subjects', { credentials: 'include' });
            if (!r.ok) return [];
            const data = await r.json();
            return Array.isArray(data.subjects) ? data.subjects : [];
        } catch (e) {
            console.error('StorageManager.fetchSubjects 오류:', e);
            return [];
        }
    },

    async addSubject(name) {
        try {
            const r = await fetch('/api/study/subjects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name })
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || '과목 추가 실패');
            return data.subject;
        } catch (e) {
            console.error('StorageManager.addSubject 오류:', e);
            throw e;
        }
    },

    async fetchWeekCalendar(offset = 0) {
        try {
            const r = await fetch(`/api/study/calendar/week?offset=${offset}`, { credentials: 'include' });
            if (!r.ok) throw new Error('캘린더 조회 실패');
            return await r.json();
        } catch (e) {
            console.error('StorageManager.fetchWeekCalendar 오류:', e);
            throw e;
        }
    },

    async addPlan(payload) {
        try {
            const r = await fetch('/api/study/calendar/plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || '타임라인 추가 실패');
            return data.plan;
        } catch (e) {
            console.error('StorageManager.addPlan 오류:', e);
            throw e;
        }
    },

    async deletePlan(planId) {
        try {
            const r = await fetch(`/api/study/calendar/plan/${planId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            if (!r.ok) throw new Error('타임라인 삭제 실패');
            return true;
        } catch (e) {
            console.error('StorageManager.deletePlan 오류:', e);
            throw e;
        }
    },

    async updatePlan(planId, payload) {
        try {
            const r = await fetch(`/api/study/calendar/plan/${planId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            const data = await r.json();
            if (!r.ok) throw new Error(data.error || '타임라인 수정 실패');
            return data.plan;
        } catch (e) {
            console.error('StorageManager.updatePlan 오류:', e);
            throw e;
        }
    }
};
