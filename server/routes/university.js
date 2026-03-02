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

router.get('/compare-gpa', (req, res) => {
    const { university, gpa } = req.query;
    if (!university || !gpa) return res.status(400).json({ error: '대학명과 내신 등급을 입력해주세요.' });

    const myGpa = parseFloat(gpa);
    if (isNaN(myGpa) || myGpa < 1 || myGpa > 9) return res.status(400).json({ error: '내신 등급은 1.0~9.0 사이입니다.' });

    const info = getUniversityInfo(university);
    if (!info) return res.json({ found: false, university });

    const results = info.departments.map(dept => {
        const comparisons = {};
        if (dept.admissions['학생부교과'] && dept.admissions['학생부교과'].내신) {
            const cutoff = dept.admissions['학생부교과'].내신;
            const diff = myGpa - cutoff;
            comparisons['학생부교과'] = {
                cutoff,
                diff: Math.round(diff * 100) / 100,
                chance: diff <= -0.5 ? 'high' : diff <= 0 ? 'medium' : diff <= 0.5 ? 'low' : 'very_low'
            };
        }
        if (dept.admissions['학생부종합'] && dept.admissions['학생부종합'].내신참고) {
            const ref = dept.admissions['학생부종합'].내신참고;
            const diff = myGpa - ref;
            comparisons['학생부종합'] = {
                reference: ref,
                diff: Math.round(diff * 100) / 100,
                chance: diff <= -0.3 ? 'high' : diff <= 0.3 ? 'medium' : diff <= 1.0 ? 'low' : 'very_low'
            };
        }
        return {
            department: dept.name,
            category: dept.category,
            comparisons
        };
    }).filter(d => Object.keys(d.comparisons).length > 0);

    res.json({
        found: true,
        university: info.name,
        myGpa,
        departments: results
    });
});

module.exports = router;
