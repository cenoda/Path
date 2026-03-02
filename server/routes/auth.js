const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db');

const router = express.Router();

const USER_FIELDS = 'id, nickname, university, gold, exp, tier, tickets, is_studying, mock_exam_score';

router.post('/register', async (req, res) => {
    const { nickname, password, university } = req.body;
    if (!nickname || !password || !university) {
        return res.status(400).json({ error: '닉네임, 비밀번호, 대학교를 모두 입력해주세요.' });
    }
    if (nickname.length < 2 || nickname.length > 20) {
        return res.status(400).json({ error: '닉네임은 2~20자 사이여야 합니다.' });
    }
    if (password.length < 4) {
        return res.status(400).json({ error: '비밀번호는 4자 이상이어야 합니다.' });
    }
    try {
        const existing = await pool.query('SELECT id FROM users WHERE nickname = $1', [nickname]);
        if (existing.rows.length > 0) {
            return res.status(409).json({ error: '이미 사용 중인 닉네임입니다.' });
        }
        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO users (nickname, password_hash, university) VALUES ($1, $2, $3) RETURNING ${USER_FIELDS}`,
            [nickname, hash, university]
        );
        const user = result.rows[0];
        req.session.userId = user.id;
        res.json({ ok: true, user });
    } catch (err) {
        console.error('register error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.post('/login', async (req, res) => {
    const { nickname, password } = req.body;
    if (!nickname || !password) {
        return res.status(400).json({ error: '닉네임과 비밀번호를 입력해주세요.' });
    }
    try {
        const result = await pool.query(
            `SELECT ${USER_FIELDS}, password_hash FROM users WHERE nickname = $1`,
            [nickname]
        );
        if (result.rows.length === 0) {
            return res.status(401).json({ error: '닉네임 또는 비밀번호가 올바르지 않습니다.' });
        }
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: '닉네임 또는 비밀번호가 올바르지 않습니다.' });
        }
        req.session.userId = user.id;
        const { password_hash, ...safeUser } = user;
        res.json({ ok: true, user: safeUser });
    } catch (err) {
        console.error('login error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

router.post('/logout', (req, res) => {
    req.session.destroy(() => { res.json({ ok: true }); });
});

router.get('/me', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    try {
        const result = await pool.query(
            `SELECT ${USER_FIELDS} FROM users WHERE id = $1`,
            [req.session.userId]
        );
        if (result.rows.length === 0) {
            req.session.destroy();
            return res.status(401).json({ error: '유저를 찾을 수 없습니다.' });
        }
        res.json({ user: result.rows[0] });
    } catch (err) {
        console.error('me error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

// 평가원 모의고사 점수 등록/수정
router.post('/update-score', async (req, res) => {
    if (!req.session.userId) return res.status(401).json({ error: '로그인이 필요합니다.' });
    const { score } = req.body;
    const s = parseInt(score);
    if (isNaN(s) || s < 0 || s > 600) {
        return res.status(400).json({ error: '점수는 0~600 사이 숫자로 입력해주세요.' });
    }
    try {
        const result = await pool.query(
            `UPDATE users SET mock_exam_score = $1 WHERE id = $2 RETURNING ${USER_FIELDS}`,
            [s, req.session.userId]
        );
        res.json({ ok: true, user: result.rows[0] });
    } catch (err) {
        console.error('update-score error:', err);
        res.status(500).json({ error: '서버 오류가 발생했습니다.' });
    }
});

module.exports = router;
