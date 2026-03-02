// 대한민국 주요 대학 입결 기준 등급 및 시간당 골드 요율
// Grade 1: 의치한약수 (100G/hr)
// Grade 2: SKY + 과기원 (70G/hr)
// Grade 3: 상위권 (50G/hr)
// Grade 4: 중상위권 (35G/hr)
// Grade 5: 중위권 / 지방 거점 국립대 (20G/hr)
// Grade 6: 중하위권 (10G/hr)
// Grade 7: 기타 / 광명상가급 (5G/hr)

const GRADE_RATE = { 1: 100, 2: 70, 3: 50, 4: 35, 5: 20, 6: 10, 7: 5 };

// 의치한약수 키워드 (학교명 또는 학과명에 포함 시 Grade 1)
const MED_KEYWORDS = ['의과대학', '의학과', '의예과', '치과대학', '치의학과', '치의예과',
    '한의과대학', '한의학과', '약학대학', '약학과', '수의과대학', '수의학과',
    '의대', '치대', '한의대', '약대', '수의대'];

// 대학별 등급 목록
const UNIVERSITY_LIST = [
    // Grade 2 (70G/hr) - SKY + 과기원
    { name: '서울대학교', grade: 2 }, { name: '서울대', grade: 2 },
    { name: '연세대학교', grade: 2 }, { name: '연세대', grade: 2 },
    { name: '고려대학교', grade: 2 }, { name: '고려대', grade: 2 },
    { name: '카이스트', grade: 2 }, { name: 'KAIST', grade: 2 },
    { name: '포항공과대학교', grade: 2 }, { name: '포항공대', grade: 2 }, { name: 'POSTECH', grade: 2 },
    { name: '울산과학기술원', grade: 2 }, { name: 'UNIST', grade: 2 },
    { name: '광주과학기술원', grade: 2 }, { name: 'GIST', grade: 2 },
    { name: '대구경북과학기술원', grade: 2 }, { name: 'DGIST', grade: 2 },

    // Grade 3 (50G/hr) - 상위권
    { name: '성균관대학교', grade: 3 }, { name: '성균관대', grade: 3 },
    { name: '한양대학교', grade: 3 }, { name: '한양대', grade: 3 },
    { name: '서강대학교', grade: 3 }, { name: '서강대', grade: 3 },
    { name: '이화여자대학교', grade: 3 }, { name: '이화여대', grade: 3 }, { name: '이화대', grade: 3 },
    { name: '서울시립대학교', grade: 3 }, { name: '서울시립대', grade: 3 }, { name: '시립대', grade: 3 },

    // Grade 4 (35G/hr) - 중상위권
    { name: '중앙대학교', grade: 4 }, { name: '중앙대', grade: 4 },
    { name: '경희대학교', grade: 4 }, { name: '경희대', grade: 4 },
    { name: '한국외국어대학교', grade: 4 }, { name: '한국외대', grade: 4 }, { name: '외대', grade: 4 },
    { name: '건국대학교', grade: 4 }, { name: '건국대', grade: 4 },
    { name: '동국대학교', grade: 4 }, { name: '동국대', grade: 4 },
    { name: '홍익대학교', grade: 4 }, { name: '홍익대', grade: 4 },
    { name: '숙명여자대학교', grade: 4 }, { name: '숙명여대', grade: 4 },
    { name: '인하대학교', grade: 4 }, { name: '인하대', grade: 4 },
    { name: '아주대학교', grade: 4 }, { name: '아주대', grade: 4 },
    { name: '항공대학교', grade: 4 }, { name: '한국항공대', grade: 4 },

    // Grade 5 (20G/hr) - 중위권 / 지방 거점국립대
    { name: '부산대학교', grade: 5 }, { name: '부산대', grade: 5 },
    { name: '경북대학교', grade: 5 }, { name: '경북대', grade: 5 },
    { name: '전남대학교', grade: 5 }, { name: '전남대', grade: 5 },
    { name: '전북대학교', grade: 5 }, { name: '전북대', grade: 5 },
    { name: '충남대학교', grade: 5 }, { name: '충남대', grade: 5 },
    { name: '충북대학교', grade: 5 }, { name: '충북대', grade: 5 },
    { name: '강원대학교', grade: 5 }, { name: '강원대', grade: 5 },
    { name: '경상국립대학교', grade: 5 }, { name: '경상대', grade: 5 },
    { name: '제주대학교', grade: 5 }, { name: '제주대', grade: 5 },
    { name: '숭실대학교', grade: 5 }, { name: '숭실대', grade: 5 },
    { name: '국민대학교', grade: 5 }, { name: '국민대', grade: 5 },
    { name: '단국대학교', grade: 5 }, { name: '단국대', grade: 5 },
    { name: '세종대학교', grade: 5 }, { name: '세종대', grade: 5 },
    { name: '광운대학교', grade: 5 }, { name: '광운대', grade: 5 },
    { name: '한국공학대학교', grade: 5 }, { name: '한기대', grade: 5 },

    // Grade 6 (10G/hr) - 중하위권
    { name: '가천대학교', grade: 6 }, { name: '가천대', grade: 6 },
    { name: '덕성여자대학교', grade: 6 }, { name: '덕성여대', grade: 6 },
    { name: '성신여자대학교', grade: 6 }, { name: '성신여대', grade: 6 },
    { name: '서울여자대학교', grade: 6 }, { name: '서울여대', grade: 6 },
    { name: '동덕여자대학교', grade: 6 }, { name: '동덕여대', grade: 6 },
    { name: '명지대학교', grade: 6 }, { name: '명지대', grade: 6 },
    { name: '한성대학교', grade: 6 }, { name: '한성대', grade: 6 },
    { name: '경기대학교', grade: 6 }, { name: '경기대', grade: 6 },
    { name: '수원대학교', grade: 6 }, { name: '수원대', grade: 6 },
    { name: '인천대학교', grade: 6 }, { name: '인천대', grade: 6 },
    { name: '을지대학교', grade: 6 }, { name: '을지대', grade: 6 },
    { name: '삼육대학교', grade: 6 }, { name: '삼육대', grade: 6 },
    { name: '서울신학대학교', grade: 6 },
    { name: '협성대학교', grade: 6 }, { name: '협성대', grade: 6 },
    { name: '한신대학교', grade: 6 }, { name: '한신대', grade: 6 },
];

/**
 * 대학명으로 등급과 시간당 골드 요율 반환
 * @param {string} universityName
 * @returns {{ grade: number, rate: number }}
 */
function getUniversityInfo(universityName) {
    if (!universityName) return { grade: 7, rate: 5 };

    // 의치한약수 키워드 우선 확인 (학과 포함)
    for (const kw of MED_KEYWORDS) {
        if (universityName.includes(kw)) return { grade: 1, rate: 100 };
    }

    // 대학 목록에서 검색 (정확히 포함하는 경우)
    for (const uni of UNIVERSITY_LIST) {
        if (universityName.includes(uni.name) || uni.name.includes(universityName)) {
            return { grade: uni.grade, rate: GRADE_RATE[uni.grade] };
        }
    }

    return { grade: 7, rate: 5 };
}

/**
 * 토너먼트권 가격: 본인 대학 시간당 골드 × 14시간
 */
function getTicketPrice(universityName) {
    const { rate } = getUniversityInfo(universityName);
    return rate * 14;
}

module.exports = { getUniversityInfo, getTicketPrice, GRADE_RATE };
