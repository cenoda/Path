'use strict';

const { findUniversity } = require('../data/universities');

// ── 정규분포 유틸 ─────────────────────────────────────────────────────────
function normalCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989422820 * Math.exp(-x * x / 2);
    const poly = t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
    const cdf = 1 - d * poly;
    return x > 0 ? cdf : 1 - cdf;
}

function probit(p) {
    if (p <= 0.0001) return -3.7;
    if (p >= 0.9999) return 3.7;
    const a = [2.515517, 0.802853, 0.010328];
    const b = [1.432788, 0.189269, 0.001308];
    if (p > 0.5) {
        const t = Math.sqrt(-2 * Math.log(1 - p));
        return t - (a[0] + t * (a[1] + t * a[2])) / (1 + t * (b[0] + t * (b[1] + t * b[2])));
    } else {
        const t = Math.sqrt(-2 * Math.log(p));
        return -(t - (a[0] + t * (a[1] + t * a[2])) / (1 + t * (b[0] + t * (b[1] + t * b[2]))));
    }
}

// ── 수능 점수 분포 파라미터 ──────────────────────────────────────────────────
// 표준점수 합산 기준 (국+수+탐1+탐2, 최대 약 400)
const SCORE_MEAN = 260;
const SCORE_STD  = 40;

const TOTAL_TEST_TAKERS = 500000; // 전체 수험생 추정

// ── 대학 입결 계산 ────────────────────────────────────────────────────────
function percentileToCutline(basePercentile) {
    const p = Math.min(0.9999, Math.max(0.0001, basePercentile / 100));
    return SCORE_MEAN + probit(p) * SCORE_STD;
}

function getSigma(basePercentile) {
    const p = Math.max(0, Math.min(100, basePercentile));
    return (100 - p) * 0.12;
}

/**
 * 유저 점수 + 대학 백분위 → 합격 확률 (0~1)
 */
function calcAcceptProb(userScore, basePercentile) {
    const cutline = percentileToCutline(basePercentile);
    const sigma = getSigma(basePercentile);
    if (sigma < 0.1) return userScore >= cutline ? 0.9 : 0.1;
    const z = (userScore - cutline) / sigma;
    const raw = normalCDF(z);
    return Math.max(0.05, Math.min(0.95, Math.round(raw * 20) / 20)); // 5% 단위
}

// ── 칸수 변환 ─────────────────────────────────────────────────────────────
/**
 * 합격 확률 → 칸수 (1~7)
 * 7칸: 안정, 5칸: 적정, 3칸: 도전, 1칸: 소신
 */
function probToKan(prob) {
    if (prob >= 0.80) return 7;
    if (prob >= 0.68) return 6;
    if (prob >= 0.56) return 5;
    if (prob >= 0.44) return 4;
    if (prob >= 0.32) return 3;
    if (prob >= 0.20) return 2;
    return 1;
}

function kanLabel(kan) {
    if (kan >= 7) return '안정';
    if (kan >= 5) return '적정';
    if (kan >= 3) return '도전';
    return '소신';
}

// ── R 공식 (semper_ 스타일) ───────────────────────────────────────────────
/**
 * R = A/V - 1 + r × √(A/V)
 * A: 전국 실지원자 수 추정, V: 사이트 점수공개 지원자 수, r: 사이트 내 등수
 */
function calcR(A, V, r) {
    if (V <= 0) return A; // 데이터 없으면 A 반환 (최악 가정)
    const k = A / V;
    return k - 1 + r * Math.sqrt(k);
}

// ── A값 추정 (베이지안) ───────────────────────────────────────────────────
/**
 * basePercentile 기반 사전값 + 과거 회차 통계로 보정
 * @param {number} basePercentile 대학 합격선 백분위
 * @param {Array}  roundHistory   과거 admission_stats 행 배열 [{estimated_A, site_applicants}]
 * @param {number} applicantMultiplier  컷선 인근 지원 배율 (기본 8 - 소신지원 포함)
 */
function estimateA(basePercentile, roundHistory = [], applicantMultiplier = 8) {
    // 합격 가능 인원 = 전국 수험생 × (100 - percentile)%
    const qualifiedCount = TOTAL_TEST_TAKERS * (100 - basePercentile) / 100;
    // 실제 지원자는 컷 이하도 소신으로 지원하므로 배율 적용
    const priorA = Math.max(100, Math.round(qualifiedCount * applicantMultiplier));

    if (roundHistory.length === 0) return priorA;

    // 유효한 과거 데이터만 (estimated_A > 0)
    const validHistory = roundHistory.filter(h => h.estimated_A > 0);
    if (validHistory.length === 0) return priorA;

    // 최신 회차에 더 높은 가중치
    let weightedSum = 0;
    let weightTotal = 0;
    validHistory.forEach((h, i) => {
        const w = i + 1; // 최신일수록 높은 인덱스 → 높은 가중치
        weightedSum += h.estimated_A * w;
        weightTotal += w;
    });
    const historicalA = weightedSum / weightTotal;

    // 과거 회차 수에 따라 비중 증가 (최대 80%)
    const histWeight = Math.min(0.8, validHistory.length * 0.2);
    return Math.round(priorA * (1 - histWeight) + historicalA * histWeight);
}

// ── 합격 판정 (정규분포 확률 기반 랜덤) ───────────────────────────────────
/**
 * R(예상순위)과 정원으로 합격 확률 계산 후 랜덤 판정
 * @returns {boolean} 합격 여부
 */
function drawResultByRank(R, capacity) {
    if (capacity <= 0) return false;
    const ratio = R / capacity;
    // ratio < 0.5 → 90%+, ratio = 1 → 50%, ratio > 2 → 10%-
    const z = (ratio - 1) * 3; // 스케일 조정
    const prob = 1 - normalCDF(z);
    const clamped = Math.max(0.05, Math.min(0.95, prob));
    return Math.random() < clamped;
}

/**
 * 직접 확률로 랜덤 판정
 */
function drawResult(prob) {
    return Math.random() < Math.max(0.05, Math.min(0.95, prob));
}

// ── 대학 정원 추정 ────────────────────────────────────────────────────────
/**
 * 사이트 유저 수 기준 환산 정원
 * 실제 합격률 = (100 - basePercentile)% 의 역수 개념
 */
function estimateCapacity(basePercentile, siteUserCount) {
    const acceptRate = (100 - basePercentile) / 100;
    return Math.max(1, Math.round(siteUserCount * acceptRate));
}

// ── 과목별 점수로 합산 표준점수 계산 ─────────────────────────────────────
/**
 * exam_scores 행 → 합산 표준점수 (국+수+탐1+탐2 기준)
 */
function calcTotalStd(scores) {
    let total = 0;
    if (scores.korean_std) total += scores.korean_std;
    if (scores.math_std)   total += scores.math_std;
    if (scores.explore1_std) total += scores.explore1_std;
    if (scores.explore2_std) total += scores.explore2_std;
    return total;
}

/**
 * exam_scores 행 → 대학 환산점수 계산 (universities.js 활용)
 * @param {string} universityName
 * @param {string} track '인문'|'자연'
 * @param {object} scores exam_scores DB 행
 */
function calcConvertedScore(universityName, track, scores) {
    const uni = findUniversity(universityName);
    if (!uni || !uni.calcConvertedScore) return calcTotalStd(scores);

    const scoreInput = {
        국어: scores.korean_std || 0,
        수학: scores.math_std || 0,
        탐구1: scores.explore1_std || 0,
        탐구2: scores.explore2_std || 0,
        영어: scores.english_grade || 4,
        한국사: scores.history_grade || 4,
        수학선택: scores.math_subject || '',
        탐구유형: guessExploreType(scores.explore1_subject, scores.explore2_subject),
    };

    const converted = uni.calcConvertedScore(scoreInput, track);
    return converted !== null ? converted : calcTotalStd(scores);
}

function guessExploreType(subj1, subj2) {
    const scienceKeywords = ['물리', '화학', '생명', '지구', '과학'];
    const s = `${subj1 || ''}${subj2 || ''}`;
    return scienceKeywords.some(k => s.includes(k)) ? '과탐' : '사탐';
}

/**
 * 유저 점수(exam_scores 행) + 대학명 → 칸수 정보 반환
 */
function getKanInfo(scores, universityName, departmentName, track) {
    const uni = findUniversity(universityName);
    if (!uni) return null;

    const basePercentile = uni.getPercentileForDept
        ? uni.getPercentileForDept(departmentName || '')
        : uni.basePercentile;

    const userScore = calcConvertedScore(universityName, track || '인문', scores);
    if (!userScore) return null;

    const cutline = Math.round(percentileToCutline(basePercentile));
    const prob = calcAcceptProb(userScore, basePercentile);
    const kan  = probToKan(prob);

    return {
        kan,
        label:      kanLabel(kan),
        prob:       Math.round(prob * 100),
        cutline,
        userScore:  Math.round(userScore),
        basePercentile,
    };
}

module.exports = {
    normalCDF,
    probit,
    percentileToCutline,
    getSigma,
    calcAcceptProb,
    probToKan,
    kanLabel,
    calcR,
    estimateA,
    estimateCapacity,
    drawResult,
    drawResultByRank,
    calcTotalStd,
    calcConvertedScore,
    getKanInfo,
    TOTAL_TEST_TAKERS,
};
