const express = require('express');
const { findUniversity, getUniversityInfo, getAllUniversities } = require('../data/universities');

const router = express.Router();

router.get('/list', (req, res) => {
    res.json({ universities: getAllUniversities() });
});

router.get('/info', (req, res) => {
    const { name } = req.query;
    if (!name) return res.status(400).json({ error: '대학명을 입력해주세요.' });
    const info = getUniversityInfo(name);
    if (!info) return res.json({ found: false, name });
    res.json({ found: true, university: info });
});

router.get('/search', (req, res) => {
    const { q, category, region } = req.query;
    let list = getAllUniversities();

    if (q) {
        const query = q.toLowerCase();
        list = list.filter(u =>
            u.name.toLowerCase().includes(query) ||
            u.aliases.some(a => a.toLowerCase().includes(query))
        );
    }
    if (region) list = list.filter(u => u.region === region);
    if (category) list = list.filter(u => u.categories.includes(category));

    res.json({ results: list });
});

module.exports = router;
