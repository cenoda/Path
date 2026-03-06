const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');
const { STUDY_GOLD_PER_HR } = require('../data/universities');

const router = express.Router();
const STUDY_PROOF_BONUS_GOLD = 5;

const proofUploadDir = path.join(__dirname, '../../uploads/study-proofs');
if (!fs.existsSync(proofUploadDir)) {
    fs.mkdirSync(proofUploadDir, { recursive: true });
}

const proofStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, proofUploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.jpg';
        const safeExt = ext.toLowerCase();
        const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1E9)}`;
        cb(null, `studyproof_${req.session.userId}_${uniqueSuffix}${safeExt}`);
    }
});

const proofImageFilter = (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.heic'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
};

const uploadProof = multer({
    storage: proofStorage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: proofImageFilter
});

function requireAuth(req, res, next) {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    next();
}

function parseTimeToMinute(timeText) {
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(String(timeText || '').trim());
    if (!m) return null;
    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

function getWeekRange(offsetWeek = 0, anchorDateText = null) {
    const anchor = anchorDateText ? new Date(anchorDateText) : new Date();
    const base = Number.isNaN(anchor.getTime()) ? new Date() : anchor;
    base.setHours(0, 0, 0, 0);
    const day = (base.getDay() + 6) % 7; // monday=0
    base.setDate(base.getDate() - day + (offsetWeek * 7));

    const start = new Date(base);
    const end = new Date(base);
    end.setDate(end.getDate() + 7);
    return { start, end };
}

router.get('/subjects', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const result = await pool.query(
            `SELECT id, name, created_at
             FROM study_subjects
             WHERE user_id = $1
             ORDER BY created_at ASC`,
            [req.session.userId]
        );
        res.json({ subjects: result.rows });
    } catch (err) {
        console.error('study/subjects GET error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/subjects', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const rawName = String(req.body.name || '').trim();
    if (!rawName) return res.status(400).json({ error: '과목명을 입력하세요.' });
    if (rawName.length > 60) return res.status(400).json({ error: '과목명은 60자 이하입니다.' });

    try {
        const result = await pool.query(
            `INSERT INTO study_subjects (user_id, name)
             VALUES ($1, $2)
             ON CONFLICT (user_id, name)
             DO UPDATE SET name = EXCLUDED.name
             RETURNING id, name, created_at`,
            [req.session.userId, rawName]
        );
        res.json({ ok: true, subject: result.rows[0] });
    } catch (err) {
        console.error('study/subjects POST error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.get('/calendar/week', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const offset = Math.max(-52, Math.min(parseInt(req.query.offset, 10) || 0, 52));
    const { start, end } = getWeekRange(offset, req.query.anchor || null);

    try {
        const [subjects, plans, records] = await Promise.all([
            pool.query(
                `SELECT id, name, created_at
                 FROM study_subjects
                 WHERE user_id = $1
                 ORDER BY created_at ASC`,
                [req.session.userId]
            ),
            pool.query(
                `SELECT p.id,
                        p.subject_id,
                        COALESCE(s.name, '미지정') AS subject_name,
                        p.plan_date,
                        p.start_minute,
                        p.end_minute,
                        p.note,
                        p.is_completed
                 FROM study_plans p
                 LEFT JOIN study_subjects s ON s.id = p.subject_id
                 WHERE p.user_id = $1
                   AND p.plan_date >= $2::date
                   AND p.plan_date <  $3::date
                 ORDER BY p.plan_date, p.start_minute`,
                [req.session.userId, start.toISOString(), end.toISOString()]
            ),
            pool.query(
                `SELECT r.id,
                        r.subject_id,
                        COALESCE(s.name, '미지정') AS subject_name,
                        r.duration_sec,
                        r.result,
                        r.created_at,
                        DATE(r.created_at) AS record_date
                 FROM study_records r
                 LEFT JOIN study_subjects s ON s.id = r.subject_id
                 WHERE r.user_id = $1
                   AND r.created_at >= $2
                   AND r.created_at <  $3
                 ORDER BY r.created_at ASC`,
                [req.session.userId, start.toISOString(), end.toISOString()]
            )
        ]);

        res.json({
            week: {
                offset,
                start_date: start.toISOString().slice(0, 10),
                end_date: end.toISOString().slice(0, 10)
            },
            subjects: subjects.rows,
            plans: plans.rows,
            records: records.rows
        });
    } catch (err) {
        console.error('study/calendar/week error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.post('/calendar/plan', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const subjectId = parseInt(req.body.subject_id, 10);
    const planDate = String(req.body.plan_date || '').trim();
    const startMinute = parseTimeToMinute(req.body.start_time);
    const endMinute = parseTimeToMinute(req.body.end_time);
    const note = String(req.body.note || '').trim().slice(0, 120);

    if (!subjectId) return res.status(400).json({ error: '과목을 선택하세요.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(planDate)) return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다.' });
    if (startMinute === null || endMinute === null || startMinute >= endMinute) {
        return res.status(400).json({ error: '시간 구간이 올바르지 않습니다.' });
    }

    try {
        const ownsSubject = await pool.query(
            'SELECT id, name FROM study_subjects WHERE id = $1 AND user_id = $2',
            [subjectId, req.session.userId]
        );
        if (ownsSubject.rows.length === 0) {
            return res.status(400).json({ error: '유효하지 않은 과목입니다.' });
        }

        const result = await pool.query(
            `INSERT INTO study_plans (user_id, subject_id, plan_date, start_minute, end_minute, note)
             VALUES ($1, $2, $3::date, $4, $5, $6)
             RETURNING id, subject_id, plan_date, start_minute, end_minute, note, is_completed`,
            [req.session.userId, subjectId, planDate, startMinute, endMinute, note || null]
        );
        res.json({ ok: true, plan: result.rows[0] });
    } catch (err) {
        console.error('study/calendar/plan POST error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.delete('/calendar/plan/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: '유효하지 않은 계획 ID입니다.' });
    try {
        await pool.query(
            'DELETE FROM study_plans WHERE id = $1 AND user_id = $2',
            [id, req.session.userId]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('study/calendar/plan DELETE error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.put('/calendar/plan/:id', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: '유효하지 않은 계획 ID입니다.' });

    const planDate = String(req.body.plan_date || '').trim();
    const startMinute = parseTimeToMinute(req.body.start_time);
    const endMinute = parseTimeToMinute(req.body.end_time);
    const note = req.body.note === undefined ? undefined : String(req.body.note || '').trim().slice(0, 120);

    if (planDate && !/^\d{4}-\d{2}-\d{2}$/.test(planDate)) {
        return res.status(400).json({ error: '날짜 형식이 올바르지 않습니다.' });
    }
    if ((startMinute === null) !== (endMinute === null)) {
        return res.status(400).json({ error: '시작/종료 시간을 모두 입력하세요.' });
    }
    if (startMinute !== null && endMinute !== null && startMinute >= endMinute) {
        return res.status(400).json({ error: '시간 구간이 올바르지 않습니다.' });
    }

    try {
        const found = await pool.query(
            `SELECT id, user_id, subject_id, plan_date, start_minute, end_minute, note, is_completed
             FROM study_plans
             WHERE id = $1 AND user_id = $2`,
            [id, req.session.userId]
        );
        if (found.rows.length === 0) {
            return res.status(404).json({ error: '계획을 찾을 수 없습니다.' });
        }

        const prev = found.rows[0];
        const nextPlanDate = planDate || String(prev.plan_date).slice(0, 10);
        const nextStartMinute = startMinute === null ? prev.start_minute : startMinute;
        const nextEndMinute = endMinute === null ? prev.end_minute : endMinute;
        const nextNote = note === undefined ? prev.note : (note || null);

        const updated = await pool.query(
            `UPDATE study_plans
             SET plan_date = $1::date,
                 start_minute = $2,
                 end_minute = $3,
                 note = $4
             WHERE id = $5 AND user_id = $6
             RETURNING id, subject_id, plan_date, start_minute, end_minute, note, is_completed`,
            [nextPlanDate, nextStartMinute, nextEndMinute, nextNote, id, req.session.userId]
        );

        res.json({ ok: true, plan: updated.rows[0] });
    } catch (err) {
        console.error('study/calendar/plan PUT error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 공부 시작: 목표 시간 저장 + is_studying
router.post('/start', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { target_sec } = req.body;
    const subjectId = parseInt(req.body.subject_id, 10);
    const target = Math.max(0, Math.min(parseInt(target_sec) || 0, 86400));
    if (!subjectId) return res.status(400).json({ error: '공부 시작 전 과목을 선택하세요.' });
    try {
        const subjectRes = await pool.query(
            'SELECT id FROM study_subjects WHERE id = $1 AND user_id = $2',
            [subjectId, req.session.userId]
        );
        if (subjectRes.rows.length === 0) {
            return res.status(400).json({ error: '유효하지 않은 과목입니다.' });
        }

        await pool.query(
            `UPDATE users
             SET is_studying = true,
                 study_started_at = NOW(),
                 target_duration_sec = $1,
                 current_study_subject_id = $2
             WHERE id = $3`,
            [target, subjectId, req.session.userId]
        );
        res.json({ ok: true });
    } catch (err) {
        console.error('study/start error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

// 공부 완료: 서버 시간 기준으로 보상 계산
router.post('/complete', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    const { result: studyResult, mode } = req.body;
    const studyMode = mode === 'stopwatch' ? 'stopwatch' : 'timer';
    const VALID = ['SUCCESS', 'INTERRUPTED', 'FAILED'];
    if (!VALID.includes(studyResult)) return res.status(400).json({ error: '올바르지 않은 결과값' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const userRes = await client.query(
            `SELECT study_started_at, target_duration_sec, is_studying, current_study_subject_id
             FROM users
             WHERE id = $1 FOR UPDATE`,
            [req.session.userId]
        );
        const user = userRes.rows[0];

        if (!user.is_studying || !user.study_started_at) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '진행 중인 공부가 없습니다.' });
        }

        // 서버 시간 기준 실제 경과 시간
        const elapsedMs = Date.now() - new Date(user.study_started_at).getTime();
        const elapsedSec = Math.max(0, Math.floor(elapsedMs / 1000));
        const targetSec = user.target_duration_sec || 0;

        // 캠인증 보너스 계산
        const camRes = await client.query(
            'SELECT cam_enabled, cam_visibility FROM users WHERE id = $1',
            [req.session.userId]
        );
        const cam = camRes.rows[0] || {};
        
        // 중간에 껐는지 확인 (공부 시작 이후 cam_enabled가 false인 기록이 있거나 현재 false인 경우)
        const camCheck = await client.query(
            `SELECT id FROM cam_captures 
             WHERE user_id = $1 AND created_at >= $2 
             LIMIT 1`,
            [req.session.userId, user.study_started_at]
        );
        
        // 현재 비활성화 상태거나, 공부 시작 후 캡처 기록이 하나도 없으면 보너스 제외
        // (사용자가 중간에 껐다면 cam_enabled는 false가 됨)
        let camMultiplier = 1.0;
        if (cam.cam_enabled && camCheck.rows.length > 0) {
            if (cam.cam_visibility === 'all') {
                camMultiplier = 1.2; // 20% 보너스
            } else {
                camMultiplier = 1.1; // 10% 보너스
            }
        }

        let earnedGold = 0;
        let earnedExp = Math.floor(elapsedSec / 60);

        if (studyResult === 'SUCCESS') {
            if (studyMode === 'stopwatch') {
                earnedGold = Math.floor((elapsedSec / 3600) * STUDY_GOLD_PER_HR * 0.5 * camMultiplier);
            } else {
                earnedGold = Math.floor((targetSec / 3600) * STUDY_GOLD_PER_HR * camMultiplier);
            }
        } else if (studyResult === 'FAILED') {
            earnedExp = 0;
        }

        const recordInsertRes = await client.query(
            `INSERT INTO study_records (user_id, duration_sec, result, earned_gold, earned_exp, subject_id)
             VALUES ($1,$2,$3,$4,$5,$6)
             RETURNING id`,
            [req.session.userId, elapsedSec, studyResult, earnedGold, earnedExp, user.current_study_subject_id || null]
        );
        const studyRecordId = recordInsertRes.rows[0]?.id || null;

        if (studyResult === 'SUCCESS' && user.current_study_subject_id) {
            await client.query(
                `WITH target_plan AS (
                    SELECT id
                    FROM study_plans
                    WHERE user_id = $1
                      AND subject_id = $2
                      AND plan_date = CURRENT_DATE
                      AND is_completed = FALSE
                    ORDER BY start_minute ASC
                    LIMIT 1
                 )
                 UPDATE study_plans p
                 SET is_completed = TRUE
                 FROM target_plan
                 WHERE p.id = target_plan.id`,
                [req.session.userId, user.current_study_subject_id]
            );
        }

        const updRes = await client.query(
            `UPDATE users
             SET gold = gold + $1,
                 exp  = exp  + $2,
                 is_studying = false,
                 study_started_at = NULL,
                 target_duration_sec = 0,
                 current_study_subject_id = NULL
             WHERE id = $3
             RETURNING id, nickname, university, gold, exp, tier, tickets, is_studying, mock_exam_score`,
            [earnedGold, earnedExp, req.session.userId]
        );

        await client.query('COMMIT');
        res.json({ ok: true, earnedGold, earnedExp, studyRecordId, user: updRes.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('complete error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.post('/upload-proof', requireAuth, uploadProof.array('studyProof', 10), async (req, res) => {
    if (!Array.isArray(req.files) || req.files.length === 0) {
        return res.status(400).json({ error: '이미지 파일을 1장 이상 선택해주세요.' });
    }

    const recordId = parseInt(req.body.record_id, 10);
    if (!recordId) return res.status(400).json({ error: '유효하지 않은 공부 기록입니다.' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const recordRes = await client.query(
            `SELECT id, result, proof_bonus_claimed
             FROM study_records
             WHERE id = $1 AND user_id = $2
             FOR UPDATE`,
            [recordId, req.session.userId]
        );

        if (recordRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: '공부 기록을 찾을 수 없습니다.' });
        }

        const record = recordRes.rows[0];
        if (record.result !== 'SUCCESS') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: '성공한 공부 기록만 인증할 수 있습니다.' });
        }

        const imageUrls = req.files.map((f) => `/uploads/study-proofs/${f.filename}`);
        const bonusGold = record.proof_bonus_claimed ? 0 : STUDY_PROOF_BONUS_GOLD;

        for (const imageUrl of imageUrls) {
            await client.query(
                `INSERT INTO study_proof_images (study_record_id, user_id, image_url)
                 VALUES ($1, $2, $3)`,
                [recordId, req.session.userId, imageUrl]
            );
        }

        await client.query(
            `UPDATE study_records
             SET proof_image_url = COALESCE(proof_image_url, $1),
                 proof_bonus_gold = proof_bonus_gold + $2,
                 proof_bonus_claimed = CASE WHEN $2 > 0 THEN TRUE ELSE proof_bonus_claimed END
             WHERE id = $3 AND user_id = $4`,
            [imageUrls[0], bonusGold, recordId, req.session.userId]
        );

        let userRow = null;
        if (bonusGold > 0) {
            const userRes = await client.query(
                `UPDATE users
                 SET gold = gold + $1
                 WHERE id = $2
                 RETURNING id, nickname, university, gold, exp, tier, tickets, is_studying, mock_exam_score`,
                [bonusGold, req.session.userId]
            );
            userRow = userRes.rows[0] || null;
        }

        await client.query('COMMIT');
        res.json({
            ok: true,
            bonusGold,
            proofImageUrl: imageUrls[0],
            proofImageUrls: imageUrls,
            uploadedCount: imageUrls.length,
            user: userRow
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('study/upload-proof error:', err);
        res.status(500).json({ error: '서버 오류' });
    } finally {
        client.release();
    }
});

router.get('/proof-image/:filename', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });

    try {
        const filename = path.basename(req.params.filename);
        const ownerMatch = filename.match(/^studyproof_(\d+)_/);
        if (!ownerMatch) return res.status(400).json({ error: '유효하지 않은 파일명입니다.' });

        const ownerId = parseInt(ownerMatch[1], 10);
        const adminCheck = await pool.query('SELECT is_admin FROM users WHERE id = $1', [req.session.userId]);
        const isAdmin = adminCheck.rows[0]?.is_admin;

        if (!isAdmin && ownerId !== req.session.userId) {
            return res.status(403).json({ error: '접근 권한이 없습니다.' });
        }

        const filePath = path.join(proofUploadDir, filename);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
        res.sendFile(filePath);
    } catch (err) {
        console.error('study/proof-image error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

router.get('/stats', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const userResult = await pool.query(
            'SELECT id, nickname, university, gold, exp, tier, tickets, is_studying, mock_exam_score FROM users WHERE id = $1',
            [req.session.userId]
        );
        const recordsResult = await pool.query(
            `SELECT COUNT(*) as total_sessions,
                    COALESCE(SUM(duration_sec),0) as total_sec,
                    COALESCE(SUM(CASE WHEN result='SUCCESS' THEN duration_sec ELSE 0 END),0) as success_sec
             FROM study_records WHERE user_id = $1`,
            [req.session.userId]
        );
        const todayResult = await pool.query(
            `SELECT COALESCE(SUM(duration_sec),0) as today_sec
             FROM study_records WHERE user_id = $1 AND created_at >= CURRENT_DATE`,
            [req.session.userId]
        );
        res.json({ user: userResult.rows[0], stats: { ...recordsResult.rows[0], ...todayResult.rows[0] } });
    } catch (err) {
        console.error('stats error:', err);
        res.status(500).json({ error: '서버 오류' });
    }
});

module.exports = router;
