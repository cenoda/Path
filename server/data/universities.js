class Department {
    constructor(data) {
        this.name = data.name;
        this.category = data.category;
        this.admissions = data.admissions || {};
    }

    getPercentile() {
        const jeongsi = this.admissions['정시'];
        if (jeongsi?.백분위) return jeongsi.백분위;
        return null;
    }
}

class University {
    constructor(data) {
        this.name = data.name;
        this.aliases = data.aliases || [];
        this.region = data.region;
        this.type = data.type;
        this.basePercentile = data.basePercentile;
        this.departments = (data.departments || []).map(d => new Department(d));
    }

    getDepartment(name) {
        return this.departments.find(d =>
            d.name === name || d.name.includes(name) || name.includes(d.name)
        );
    }

    getDepartmentsByCategory(category) {
        return this.departments.filter(d => d.category === category);
    }

    getPercentileForDept(deptName) {
        const dept = this.getDepartment(deptName);
        if (dept) {
            const p = dept.getPercentile();
            if (p) return p;
        }
        return this.basePercentile;
    }
}

const UNIVERSITIES = [
    new University({
        name: '서울대학교', aliases: ['서울대'], region: '서울', type: '국립', basePercentile: 99.5,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부종합': { 내신참고: 1.1 }, '정시': { 백분위: 99, 표준점수합: 395 } } },
            { name: '경제학부', category: '상경', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 99, 표준점수합: 393 } } },
            { name: '정치외교학부', category: '인문', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 98, 표준점수합: 390 } } },
            { name: '국어국문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 98, 표준점수합: 388 } } },
            { name: '영어영문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 98, 표준점수합: 389 } } },
            { name: '심리학과', category: '인문', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 99, 표준점수합: 392 } } },
            { name: '수학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 98, 표준점수합: 288 } } },
            { name: '물리천문학부', category: '자연', admissions: { '학생부종합': { 내신참고: 1.4 }, '정시': { 백분위: 98, 표준점수합: 286 } } },
            { name: '화학부', category: '자연', admissions: { '학생부종합': { 내신참고: 1.4 }, '정시': { 백분위: 97, 표준점수합: 284 } } },
            { name: '생명과학부', category: '자연', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 98, 표준점수합: 287 } } },
            { name: '컴퓨터공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.1 }, '정시': { 백분위: 99, 표준점수합: 292 } } },
            { name: '전기정보공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 99, 표준점수합: 290 } } },
            { name: '기계공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 98, 표준점수합: 288 } } },
            { name: '건축학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 98, 표준점수합: 286 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.0 }, '정시': { 백분위: 99.8, 표준점수합: 298 } } },
            { name: '수의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.1 }, '정시': { 백분위: 99.3, 표준점수합: 293 } } },
            { name: '간호학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 98, 표준점수합: 287 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.1 }, '정시': { 백분위: 99.2, 표준점수합: 292 } } },
            { name: '사범대학 교육학과', category: '사범', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 98, 표준점수합: 388 } } },
            { name: '자유전공학부', category: '상경', admissions: { '학생부종합': { 내신참고: 1.0 }, '정시': { 백분위: 99, 표준점수합: 396 } } },
        ]
    }),

    new University({
        name: '연세대학교', aliases: ['연세대', '연대'], region: '서울', type: '사립', basePercentile: 98.5,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 1.2 }, '학생부종합': { 내신참고: 1.3 }, '논술': { 경쟁률: 45 }, '정시': { 백분위: 98, 표준점수합: 390 } } },
            { name: '경제학부', category: '상경', admissions: { '학생부교과': { 내신: 1.3 }, '학생부종합': { 내신참고: 1.4 }, '논술': { 경쟁률: 40 }, '정시': { 백분위: 97, 표준점수합: 387 } } },
            { name: '영어영문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 1.5 }, '논술': { 경쟁률: 35 }, '정시': { 백분위: 96, 표준점수합: 384 } } },
            { name: '국어국문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 1.5 }, '정시': { 백분위: 96, 표준점수합: 383 } } },
            { name: '심리학과', category: '인문', admissions: { '학생부종합': { 내신참고: 1.4 }, '논술': { 경쟁률: 42 }, '정시': { 백분위: 97, 표준점수합: 387 } } },
            { name: '수학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.6 }, '논술': { 경쟁률: 32 }, '정시': { 백분위: 96, 표준점수합: 282 } } },
            { name: '물리학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.7 }, '정시': { 백분위: 96, 표준점수합: 280 } } },
            { name: '화학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.7 }, '정시': { 백분위: 95, 표준점수합: 278 } } },
            { name: '생명공학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.6 }, '정시': { 백분위: 96, 표준점수합: 281 } } },
            { name: '컴퓨터과학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.3 }, '논술': { 경쟁률: 50 }, '정시': { 백분위: 98, 표준점수합: 288 } } },
            { name: '전기전자공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.3 }, '논술': { 경쟁률: 48 }, '정시': { 백분위: 98, 표준점수합: 287 } } },
            { name: '기계공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.5 }, '정시': { 백분위: 97, 표준점수합: 284 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.0 }, '정시': { 백분위: 99.7, 표준점수합: 297 } } },
            { name: '치의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.1 }, '정시': { 백분위: 99.5, 표준점수합: 295 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 99, 표준점수합: 291 } } },
            { name: '간호학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.5 }, '정시': { 백분위: 97, 표준점수합: 283 } } },
        ]
    }),

    new University({
        name: '고려대학교', aliases: ['고려대', '고대'], region: '서울', type: '사립', basePercentile: 98.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 1.3 }, '학생부종합': { 내신참고: 1.4 }, '논술': { 경쟁률: 42 }, '정시': { 백분위: 97, 표준점수합: 388 } } },
            { name: '경제학과', category: '상경', admissions: { '학생부종합': { 내신참고: 1.5 }, '정시': { 백분위: 97, 표준점수합: 386 } } },
            { name: '정치외교학과', category: '인문', admissions: { '학생부종합': { 내신참고: 1.5 }, '정시': { 백분위: 96, 표준점수합: 384 } } },
            { name: '국어국문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 1.6 }, '정시': { 백분위: 96, 표준점수합: 382 } } },
            { name: '영어영문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 1.5 }, '정시': { 백분위: 96, 표준점수합: 383 } } },
            { name: '심리학과', category: '인문', admissions: { '학생부종합': { 내신참고: 1.4 }, '정시': { 백분위: 97, 표준점수합: 386 } } },
            { name: '수학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.7 }, '정시': { 백분위: 96, 표준점수합: 280 } } },
            { name: '화학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.8 }, '정시': { 백분위: 95, 표준점수합: 276 } } },
            { name: '생명과학부', category: '자연', admissions: { '학생부종합': { 내신참고: 1.6 }, '정시': { 백분위: 96, 표준점수합: 280 } } },
            { name: '컴퓨터학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.3 }, '논술': { 경쟁률: 46 }, '정시': { 백분위: 98, 표준점수합: 286 } } },
            { name: '전기전자공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.4 }, '정시': { 백분위: 97, 표준점수합: 285 } } },
            { name: '기계공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.5 }, '정시': { 백분위: 97, 표준점수합: 283 } } },
            { name: '의과대학', category: '의학', admissions: { '학생부종합': { 내신참고: 1.0 }, '정시': { 백분위: 99.7, 표준점수합: 296 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 99, 표준점수합: 290 } } },
            { name: '간호학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.5 }, '정시': { 백분위: 96, 표준점수합: 281 } } },
        ]
    }),

    new University({
        name: 'KAIST', aliases: ['카이스트', '한국과학기술원'], region: '대전', type: '과기원', basePercentile: 99.0,
        departments: [
            { name: '전산학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.1 } } },
            { name: '전기및전자공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.2 } } },
            { name: '기계공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.3 } } },
            { name: '수리과학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.3 } } },
            { name: '물리학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.4 } } },
            { name: '화학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.5 } } },
            { name: '생명과학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.4 } } },
            { name: '산업및시스템공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.3 } } },
            { name: '항공우주공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.3 } } },
            { name: '바이오및뇌공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.3 } } },
        ]
    }),

    new University({
        name: '포항공과대학교', aliases: ['포항공대', 'POSTECH'], region: '경북', type: '사립', basePercentile: 99.0,
        departments: [
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.2 } } },
            { name: '전자전기공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.3 } } },
            { name: '기계공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.3 } } },
            { name: '수학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.4 } } },
            { name: '물리학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.4 } } },
            { name: '화학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.5 } } },
            { name: '생명과학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.4 } } },
            { name: '산업경영공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.4 } } },
        ]
    }),

    new University({
        name: '성균관대학교', aliases: ['성균관대', '성대', '성균관'], region: '서울', type: '사립', basePercentile: 96.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 1.5 }, '학생부종합': { 내신참고: 1.7 }, '논술': { 경쟁률: 38 }, '정시': { 백분위: 96, 표준점수합: 382 } } },
            { name: '경제학과', category: '상경', admissions: { '학생부종합': { 내신참고: 1.8 }, '논술': { 경쟁률: 32 }, '정시': { 백분위: 95, 표준점수합: 378 } } },
            { name: '글로벌경영학과', category: '상경', admissions: { '학생부종합': { 내신참고: 1.6 }, '정시': { 백분위: 96, 표준점수합: 383 } } },
            { name: '국어국문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 2.0 }, '정시': { 백분위: 94, 표준점수합: 374 } } },
            { name: '영어영문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 1.9 }, '정시': { 백분위: 94, 표준점수합: 375 } } },
            { name: '소프트웨어학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.5 }, '논술': { 경쟁률: 42 }, '정시': { 백분위: 97, 표준점수합: 284 } } },
            { name: '전자전기공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.6 }, '논술': { 경쟁률: 38 }, '정시': { 백분위: 96, 표준점수합: 282 } } },
            { name: '화학공학/고분자공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.8 }, '정시': { 백분위: 95, 표준점수합: 278 } } },
            { name: '기계공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.8 }, '정시': { 백분위: 95, 표준점수합: 277 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.0 }, '정시': { 백분위: 99.6, 표준점수합: 296 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 98, 표준점수합: 288 } } },
        ]
    }),

    new University({
        name: '한양대학교', aliases: ['한양대', '한대'], region: '서울', type: '사립', basePercentile: 95.5,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부종합': { 내신참고: 1.8 }, '정시': { 백분위: 95, 표준점수합: 380 } } },
            { name: '경제금융학부', category: '상경', admissions: { '학생부종합': { 내신참고: 1.9 }, '정시': { 백분위: 94, 표준점수합: 377 } } },
            { name: '국어국문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 2.2 }, '정시': { 백분위: 93, 표준점수합: 372 } } },
            { name: '영어영문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 2.0 }, '정시': { 백분위: 93, 표준점수합: 374 } } },
            { name: '수학과', category: '자연', admissions: { '학생부종합': { 내신참고: 2.2 }, '정시': { 백분위: 93, 표준점수합: 272 } } },
            { name: '화학과', category: '자연', admissions: { '학생부종합': { 내신참고: 2.3 }, '정시': { 백분위: 92, 표준점수합: 268 } } },
            { name: '컴퓨터소프트웨어학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.6 }, '정시': { 백분위: 96, 표준점수합: 282 } } },
            { name: '전기공학전공', category: '공학', admissions: { '학생부종합': { 내신참고: 1.8 }, '정시': { 백분위: 95, 표준점수합: 280 } } },
            { name: '기계공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.9 }, '정시': { 백분위: 95, 표준점수합: 278 } } },
            { name: '건축학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.8 }, '정시': { 백분위: 95, 표준점수합: 278 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.0 }, '정시': { 백분위: 99.6, 표준점수합: 296 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 98, 표준점수합: 287 } } },
        ]
    }),

    new University({
        name: '서강대학교', aliases: ['서강대'], region: '서울', type: '사립', basePercentile: 95.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부종합': { 내신참고: 1.8 }, '논술': { 경쟁률: 35 }, '정시': { 백분위: 95, 표준점수합: 378 } } },
            { name: '경제학부', category: '상경', admissions: { '학생부종합': { 내신참고: 1.9 }, '논술': { 경쟁률: 30 }, '정시': { 백분위: 94, 표준점수합: 375 } } },
            { name: '국어국문학전공', category: '인문', admissions: { '학생부종합': { 내신참고: 2.1 }, '정시': { 백분위: 93, 표준점수합: 372 } } },
            { name: '영미문화전공', category: '인문', admissions: { '학생부종합': { 내신참고: 2.0 }, '정시': { 백분위: 93, 표준점수합: 373 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.6 }, '논술': { 경쟁률: 40 }, '정시': { 백분위: 96, 표준점수합: 280 } } },
            { name: '전자공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.7 }, '정시': { 백분위: 95, 표준점수합: 278 } } },
            { name: '화공생명공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.9 }, '정시': { 백분위: 94, 표준점수합: 275 } } },
            { name: '수학과', category: '자연', admissions: { '학생부종합': { 내신참고: 2.0 }, '정시': { 백분위: 94, 표준점수합: 274 } } },
        ]
    }),

    new University({
        name: '이화여자대학교', aliases: ['이화여대', '이화대', '이대'], region: '서울', type: '사립', basePercentile: 93.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 1.8 }, '학생부종합': { 내신참고: 2.0 }, '논술': { 경쟁률: 28 }, '정시': { 백분위: 93, 표준점수합: 372 } } },
            { name: '국어국문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 2.3 }, '정시': { 백분위: 91, 표준점수합: 366 } } },
            { name: '영어영문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 2.2 }, '정시': { 백분위: 91, 표준점수합: 367 } } },
            { name: '심리학과', category: '인문', admissions: { '학생부종합': { 내신참고: 2.0 }, '정시': { 백분위: 93, 표준점수합: 373 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.9 }, '논술': { 경쟁률: 32 }, '정시': { 백분위: 93, 표준점수합: 274 } } },
            { name: '화학생명분자과학부', category: '자연', admissions: { '학생부종합': { 내신참고: 2.3 }, '정시': { 백분위: 90, 표준점수합: 266 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.0 }, '정시': { 백분위: 99.5, 표준점수합: 294 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 98, 표준점수합: 286 } } },
        ]
    }),

    new University({
        name: '중앙대학교', aliases: ['중앙대', '중대'], region: '서울', type: '사립', basePercentile: 91.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 2.0 }, '학생부종합': { 내신참고: 2.3 }, '논술': { 경쟁률: 30 }, '정시': { 백분위: 91, 표준점수합: 370 } } },
            { name: '경제학부', category: '상경', admissions: { '학생부종합': { 내신참고: 2.4 }, '정시': { 백분위: 90, 표준점수합: 367 } } },
            { name: '국어국문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 2.6 }, '정시': { 백분위: 89, 표준점수합: 363 } } },
            { name: '영어영문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 2.5 }, '정시': { 백분위: 89, 표준점수합: 364 } } },
            { name: '소프트웨어학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.0 }, '논술': { 경쟁률: 35 }, '정시': { 백분위: 92, 표준점수합: 274 } } },
            { name: '전자전기공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.2 }, '정시': { 백분위: 91, 표준점수합: 270 } } },
            { name: '기계공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.3 }, '정시': { 백분위: 90, 표준점수합: 268 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.4 }, '정시': { 백분위: 97, 표준점수합: 284 } } },
            { name: '간호학과', category: '의학', admissions: { '학생부종합': { 내신참고: 2.0 }, '정시': { 백분위: 92, 표준점수합: 272 } } },
        ]
    }),

    new University({
        name: '경희대학교', aliases: ['경희대'], region: '서울', type: '사립', basePercentile: 90.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 2.2 }, '학생부종합': { 내신참고: 2.5 }, '논술': { 경쟁률: 28 }, '정시': { 백분위: 90, 표준점수합: 368 } } },
            { name: '경제학과', category: '상경', admissions: { '학생부종합': { 내신참고: 2.6 }, '정시': { 백분위: 89, 표준점수합: 365 } } },
            { name: '국어국문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 2.8 }, '정시': { 백분위: 87, 표준점수합: 360 } } },
            { name: '영어영문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 2.7 }, '정시': { 백분위: 88, 표준점수합: 362 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.3 }, '논술': { 경쟁률: 30 }, '정시': { 백분위: 91, 표준점수합: 270 } } },
            { name: '전자공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.5 }, '정시': { 백분위: 90, 표준점수합: 266 } } },
            { name: '한의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.1 }, '정시': { 백분위: 99.3, 표준점수합: 293 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.0 }, '정시': { 백분위: 99.5, 표준점수합: 295 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.4 }, '정시': { 백분위: 97, 표준점수합: 284 } } },
            { name: '치의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.1 }, '정시': { 백분위: 99.4, 표준점수합: 294 } } },
        ]
    }),

    new University({
        name: '한국외국어대학교', aliases: ['한국외대', '외대'], region: '서울', type: '사립', basePercentile: 89.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부종합': { 내신참고: 2.5 }, '정시': { 백분위: 89, 표준점수합: 365 } } },
            { name: '영어대학', category: '인문', admissions: { '학생부종합': { 내신참고: 2.3 }, '정시': { 백분위: 90, 표준점수합: 367 } } },
            { name: '일본어대학', category: '인문', admissions: { '학생부종합': { 내신참고: 2.6 }, '정시': { 백분위: 87, 표준점수합: 360 } } },
            { name: '중국어대학', category: '인문', admissions: { '학생부종합': { 내신참고: 2.5 }, '정시': { 백분위: 88, 표준점수합: 362 } } },
            { name: '통번역학과', category: '인문', admissions: { '학생부종합': { 내신참고: 2.2 }, '정시': { 백분위: 90, 표준점수합: 368 } } },
            { name: '국제학부', category: '상경', admissions: { '학생부종합': { 내신참고: 2.3 }, '정시': { 백분위: 90, 표준점수합: 367 } } },
        ]
    }),

    new University({
        name: '건국대학교', aliases: ['건국대', '건대'], region: '서울', type: '사립', basePercentile: 88.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 2.4 }, '학생부종합': { 내신참고: 2.7 }, '논술': { 경쟁률: 25 }, '정시': { 백분위: 88, 표준점수합: 363 } } },
            { name: '경제학과', category: '상경', admissions: { '학생부종합': { 내신참고: 2.8 }, '정시': { 백분위: 87, 표준점수합: 360 } } },
            { name: '국어국문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 3.0 }, '정시': { 백분위: 85, 표준점수합: 356 } } },
            { name: '컴퓨터공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.4 }, '논술': { 경쟁률: 28 }, '정시': { 백분위: 89, 표준점수합: 266 } } },
            { name: '전기전자공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.6 }, '정시': { 백분위: 88, 표준점수합: 263 } } },
            { name: '기계공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.7 }, '정시': { 백분위: 87, 표준점수합: 260 } } },
            { name: '생명공학과', category: '자연', admissions: { '학생부종합': { 내신참고: 2.8 }, '정시': { 백분위: 86, 표준점수합: 258 } } },
            { name: '수의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 99, 표준점수합: 290 } } },
        ]
    }),

    new University({
        name: '동국대학교', aliases: ['동국대'], region: '서울', type: '사립', basePercentile: 87.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 2.5 }, '학생부종합': { 내신참고: 2.8 }, '논술': { 경쟁률: 22 }, '정시': { 백분위: 87, 표준점수합: 362 } } },
            { name: '경제학과', category: '상경', admissions: { '학생부종합': { 내신참고: 2.9 }, '정시': { 백분위: 86, 표준점수합: 358 } } },
            { name: '국어국문문예창작학부', category: '인문', admissions: { '학생부종합': { 내신참고: 3.0 }, '정시': { 백분위: 85, 표준점수합: 355 } } },
            { name: '컴퓨터공학전공', category: '공학', admissions: { '학생부종합': { 내신참고: 2.5 }, '논술': { 경쟁률: 25 }, '정시': { 백분위: 88, 표준점수합: 264 } } },
            { name: '전자전기공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.7 }, '정시': { 백분위: 86, 표준점수합: 260 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.5 }, '정시': { 백분위: 96, 표준점수합: 282 } } },
        ]
    }),

    new University({
        name: '홍익대학교', aliases: ['홍익대', '홍대'], region: '서울', type: '사립', basePercentile: 87.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부종합': { 내신참고: 2.8 }, '정시': { 백분위: 87, 표준점수합: 360 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.5 }, '정시': { 백분위: 88, 표준점수합: 263 } } },
            { name: '전자전기공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.7 }, '정시': { 백분위: 87, 표준점수합: 260 } } },
            { name: '미술대학 회화과', category: '예체능', admissions: { '실기': { 경쟁률: 15 }, '정시': { 백분위: 88 } } },
            { name: '디자인학부', category: '예체능', admissions: { '실기': { 경쟁률: 18 }, '정시': { 백분위: 90 } } },
            { name: '건축학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.5 }, '정시': { 백분위: 88, 표준점수합: 264 } } },
        ]
    }),

    new University({
        name: '숙명여자대학교', aliases: ['숙명여대', '숙대'], region: '서울', type: '사립', basePercentile: 86.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 2.3 }, '학생부종합': { 내신참고: 2.7 }, '정시': { 백분위: 86, 표준점수합: 358 } } },
            { name: '영어영문학부', category: '인문', admissions: { '학생부종합': { 내신참고: 2.8 }, '정시': { 백분위: 85, 표준점수합: 355 } } },
            { name: '컴퓨터과학전공', category: '공학', admissions: { '학생부종합': { 내신참고: 2.5 }, '정시': { 백분위: 87, 표준점수합: 260 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.5 }, '정시': { 백분위: 96, 표준점수합: 282 } } },
        ]
    }),

    new University({
        name: '인하대학교', aliases: ['인하대'], region: '인천', type: '사립', basePercentile: 85.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 2.6 }, '학생부종합': { 내신참고: 2.9 }, '정시': { 백분위: 85, 표준점수합: 355 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.6 }, '논술': { 경쟁률: 22 }, '정시': { 백분위: 87, 표준점수합: 260 } } },
            { name: '전기공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.8 }, '정시': { 백분위: 85, 표준점수합: 256 } } },
            { name: '기계공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.8 }, '정시': { 백분위: 85, 표준점수합: 255 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.1 }, '정시': { 백분위: 99.4, 표준점수합: 294 } } },
        ]
    }),

    new University({
        name: '아주대학교', aliases: ['아주대'], region: '경기', type: '사립', basePercentile: 84.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 2.7 }, '학생부종합': { 내신참고: 3.0 }, '정시': { 백분위: 84, 표준점수합: 352 } } },
            { name: '소프트웨어학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.5 }, '정시': { 백분위: 86, 표준점수합: 258 } } },
            { name: '전자공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.8 }, '정시': { 백분위: 84, 표준점수합: 254 } } },
            { name: '의학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.1 }, '정시': { 백분위: 99.3, 표준점수합: 293 } } },
        ]
    }),

    new University({
        name: '부산대학교', aliases: ['부산대', '부대'], region: '부산', type: '국립', basePercentile: 88.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 2.2 }, '학생부종합': { 내신참고: 2.6 }, '정시': { 백분위: 87, 표준점수합: 362 } } },
            { name: '경제학부', category: '상경', admissions: { '학생부종합': { 내신참고: 2.7 }, '정시': { 백분위: 86, 표준점수합: 358 } } },
            { name: '국어국문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 2.9 }, '정시': { 백분위: 84, 표준점수합: 354 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.5 }, '정시': { 백분위: 88, 표준점수합: 264 } } },
            { name: '전기공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.6 }, '정시': { 백분위: 87, 표준점수합: 262 } } },
            { name: '기계공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.7 }, '정시': { 백분위: 86, 표준점수합: 260 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.1 }, '정시': { 백분위: 99.4, 표준점수합: 294 } } },
            { name: '치의학전문대학원', category: '의학', admissions: { '정시': { 백분위: 99, 표준점수합: 290 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.5 }, '정시': { 백분위: 96, 표준점수합: 282 } } },
            { name: '간호학과', category: '의학', admissions: { '학생부교과': { 내신: 2.0 }, '정시': { 백분위: 90, 표준점수합: 268 } } },
        ]
    }),

    new University({
        name: '경북대학교', aliases: ['경북대'], region: '대구', type: '국립', basePercentile: 86.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 2.5 }, '학생부종합': { 내신참고: 2.8 }, '정시': { 백분위: 85, 표준점수합: 356 } } },
            { name: '국어국문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 3.1 }, '정시': { 백분위: 83, 표준점수합: 350 } } },
            { name: '컴퓨터학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.7 }, '정시': { 백분위: 86, 표준점수합: 260 } } },
            { name: '전자공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.8 }, '정시': { 백분위: 85, 표준점수합: 258 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.1 }, '정시': { 백분위: 99.3, 표준점수합: 293 } } },
            { name: '치의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 99, 표준점수합: 290 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.5 }, '정시': { 백분위: 96, 표준점수합: 280 } } },
        ]
    }),

    new University({
        name: '울산과학기술원', aliases: ['UNIST', '유니스트'], region: '울산', type: '과기원', basePercentile: 97.0,
        departments: [
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.5 } } },
            { name: '전기전자공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.6 } } },
            { name: '기계공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.7 } } },
            { name: '에너지화학공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 1.7 } } },
            { name: '생명과학과', category: '자연', admissions: { '학생부종합': { 내신참고: 1.8 } } },
        ]
    }),

    new University({
        name: '광주과학기술원', aliases: ['GIST', '지스트'], region: '광주', type: '과기원', basePercentile: 96.5,
        departments: [
            { name: '전기전자컴퓨터공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.6 } } },
            { name: '신소재공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.7 } } },
            { name: '지구환경공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.8 } } },
            { name: '생명과학부', category: '자연', admissions: { '학생부종합': { 내신참고: 1.8 } } },
        ]
    }),

    new University({
        name: '대구경북과학기술원', aliases: ['DGIST', '디지스트'], region: '대구', type: '과기원', basePercentile: 96.0,
        departments: [
            { name: '기초학부', category: '공학', admissions: { '학생부종합': { 내신참고: 1.7 } } },
        ]
    }),

    new University({
        name: '서울시립대학교', aliases: ['서울시립대', '시립대'], region: '서울', type: '국립', basePercentile: 93.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 1.8 }, '학생부종합': { 내신참고: 2.2 }, '논술': { 경쟁률: 30 }, '정시': { 백분위: 92, 표준점수합: 374 } } },
            { name: '경제학부', category: '상경', admissions: { '학생부종합': { 내신참고: 2.3 }, '정시': { 백분위: 91, 표준점수합: 370 } } },
            { name: '국어국문학과', category: '인문', admissions: { '학생부종합': { 내신참고: 2.5 }, '정시': { 백분위: 89, 표준점수합: 365 } } },
            { name: '컴퓨터과학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.0 }, '논술': { 경쟁률: 35 }, '정시': { 백분위: 93, 표준점수합: 276 } } },
            { name: '전자전기컴퓨터공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.1 }, '정시': { 백분위: 92, 표준점수합: 274 } } },
        ]
    }),

    new University({
        name: '숭실대학교', aliases: ['숭실대'], region: '서울', type: '사립', basePercentile: 82.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 2.8 }, '학생부종합': { 내신참고: 3.2 }, '정시': { 백분위: 82, 표준점수합: 348 } } },
            { name: '컴퓨터학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.8 }, '정시': { 백분위: 84, 표준점수합: 254 } } },
            { name: '전자정보공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 3.0 }, '정시': { 백분위: 82, 표준점수합: 250 } } },
            { name: 'AI융합학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.6 }, '정시': { 백분위: 85, 표준점수합: 256 } } },
        ]
    }),

    new University({
        name: '국민대학교', aliases: ['국민대'], region: '서울', type: '사립', basePercentile: 80.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 3.0 }, '학생부종합': { 내신참고: 3.4 }, '정시': { 백분위: 80, 표준점수합: 344 } } },
            { name: '소프트웨어학부', category: '공학', admissions: { '학생부종합': { 내신참고: 3.0 }, '정시': { 백분위: 82, 표준점수합: 250 } } },
            { name: '자동차공학전공', category: '공학', admissions: { '학생부종합': { 내신참고: 3.2 }, '정시': { 백분위: 81, 표준점수합: 248 } } },
        ]
    }),

    new University({
        name: '세종대학교', aliases: ['세종대'], region: '서울', type: '사립', basePercentile: 80.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 3.0 }, '학생부종합': { 내신참고: 3.4 }, '정시': { 백분위: 80, 표준점수합: 344 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.8 }, '정시': { 백분위: 83, 표준점수합: 252 } } },
            { name: '전자정보통신공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.0 }, '정시': { 백분위: 81, 표준점수합: 248 } } },
        ]
    }),

    new University({
        name: '단국대학교', aliases: ['단국대'], region: '경기', type: '사립', basePercentile: 78.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 3.2 }, '학생부종합': { 내신참고: 3.5 }, '정시': { 백분위: 78, 표준점수합: 340 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.0 }, '정시': { 백분위: 80, 표준점수합: 248 } } },
            { name: '전자전기공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 3.2 }, '정시': { 백분위: 78, 표준점수합: 244 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 99.3, 표준점수합: 293 } } },
            { name: '치의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 99, 표준점수합: 290 } } },
        ]
    }),

    new University({
        name: '충남대학교', aliases: ['충남대'], region: '대전', type: '국립', basePercentile: 82.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 2.8 }, '학생부종합': { 내신참고: 3.1 }, '정시': { 백분위: 82, 표준점수합: 348 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.9 }, '정시': { 백분위: 83, 표준점수합: 252 } } },
            { name: '전기공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.0 }, '정시': { 백분위: 82, 표준점수합: 250 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 99.2, 표준점수합: 292 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.6 }, '정시': { 백분위: 95, 표준점수합: 278 } } },
        ]
    }),

    new University({
        name: '전남대학교', aliases: ['전남대'], region: '광주', type: '국립', basePercentile: 82.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 2.9 }, '정시': { 백분위: 81, 표준점수합: 346 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.0 }, '정시': { 백분위: 82, 표준점수합: 250 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 99.2, 표준점수합: 292 } } },
            { name: '치의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 99, 표준점수합: 289 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.6 }, '정시': { 백분위: 95, 표준점수합: 277 } } },
        ]
    }),

    new University({
        name: '전북대학교', aliases: ['전북대'], region: '전북', type: '국립', basePercentile: 80.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 3.1 }, '정시': { 백분위: 79, 표준점수합: 342 } } },
            { name: '컴퓨터공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 3.1 }, '정시': { 백분위: 80, 표준점수합: 248 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 99.1, 표준점수합: 291 } } },
            { name: '치의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 98.5, 표준점수합: 288 } } },
        ]
    }),

    new University({
        name: '충북대학교', aliases: ['충북대'], region: '충북', type: '국립', basePercentile: 78.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 3.3 }, '정시': { 백분위: 77, 표준점수합: 338 } } },
            { name: '소프트웨어학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.2 }, '정시': { 백분위: 78, 표준점수합: 244 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 99.1, 표준점수합: 291 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.7 }, '정시': { 백분위: 94, 표준점수합: 276 } } },
        ]
    }),

    new University({
        name: '강원대학교', aliases: ['강원대'], region: '강원', type: '국립', basePercentile: 76.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 3.5 }, '정시': { 백분위: 75, 표준점수합: 335 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.3 }, '정시': { 백분위: 76, 표준점수합: 242 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 99, 표준점수합: 290 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.7 }, '정시': { 백분위: 94, 표준점수합: 275 } } },
        ]
    }),

    new University({
        name: '경상국립대학교', aliases: ['경상대'], region: '경남', type: '국립', basePercentile: 77.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 3.4 }, '정시': { 백분위: 76, 표준점수합: 336 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.3 }, '정시': { 백분위: 77, 표준점수합: 243 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 99, 표준점수합: 290 } } },
        ]
    }),

    new University({
        name: '제주대학교', aliases: ['제주대'], region: '제주', type: '국립', basePercentile: 74.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 3.6 }, '정시': { 백분위: 73, 표준점수합: 330 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.5 }, '정시': { 백분위: 74, 표준점수합: 240 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 99, 표준점수합: 289 } } },
        ]
    }),

    new University({
        name: '광운대학교', aliases: ['광운대'], region: '서울', type: '사립', basePercentile: 77.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 3.3 }, '정시': { 백분위: 77, 표준점수합: 338 } } },
            { name: '소프트웨어학부', category: '공학', admissions: { '학생부종합': { 내신참고: 3.0 }, '정시': { 백분위: 79, 표준점수합: 246 } } },
            { name: '전자공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.1 }, '정시': { 백분위: 78, 표준점수합: 244 } } },
        ]
    }),

    new University({
        name: '인천대학교', aliases: ['인천대'], region: '인천', type: '국립', basePercentile: 75.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 3.2 }, '정시': { 백분위: 75, 표준점수합: 335 } } },
            { name: '컴퓨터공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 3.0 }, '정시': { 백분위: 77, 표준점수합: 244 } } },
            { name: '전기공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.2 }, '정시': { 백분위: 75, 표준점수합: 240 } } },
        ]
    }),

    new University({
        name: '가천대학교', aliases: ['가천대'], region: '경기', type: '사립', basePercentile: 72.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 3.5 }, '정시': { 백분위: 72, 표준점수합: 328 } } },
            { name: '소프트웨어학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.2 }, '정시': { 백분위: 74, 표준점수합: 240 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.2 }, '정시': { 백분위: 99.2, 표준점수합: 292 } } },
            { name: '약학과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.7 }, '정시': { 백분위: 94, 표준점수합: 274 } } },
        ]
    }),

    new University({
        name: '명지대학교', aliases: ['명지대'], region: '서울', type: '사립', basePercentile: 70.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 3.7 }, '정시': { 백분위: 70, 표준점수합: 325 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.4 }, '정시': { 백분위: 72, 표준점수합: 238 } } },
            { name: '전자공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.5 }, '정시': { 백분위: 70, 표준점수합: 234 } } },
        ]
    }),

    new University({
        name: '경기대학교', aliases: ['경기대'], region: '경기', type: '사립', basePercentile: 65.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 4.0 }, '정시': { 백분위: 65, 표준점수합: 318 } } },
            { name: '컴퓨터공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 3.7 }, '정시': { 백분위: 67, 표준점수합: 232 } } },
        ]
    }),

    new University({
        name: '한국항공대학교', aliases: ['한국항공대', '항공대'], region: '경기', type: '사립', basePercentile: 83.0,
        departments: [
            { name: '항공우주공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.5 }, '정시': { 백분위: 85, 표준점수합: 258 } } },
            { name: '소프트웨어학과', category: '공학', admissions: { '학생부종합': { 내신참고: 2.7 }, '정시': { 백분위: 84, 표준점수합: 254 } } },
            { name: '항공교통물류학부', category: '공학', admissions: { '학생부종합': { 내신참고: 2.9 }, '정시': { 백분위: 82, 표준점수합: 250 } } },
        ]
    }),

    new University({
        name: '한국공학대학교', aliases: ['한기대'], region: '경기', type: '국립', basePercentile: 75.0,
        departments: [
            { name: '컴퓨터공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 3.2 }, '정시': { 백분위: 76, 표준점수합: 242 } } },
            { name: '기계공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 3.3 }, '정시': { 백분위: 75, 표준점수합: 240 } } },
            { name: '전자공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 3.3 }, '정시': { 백분위: 75, 표준점수합: 240 } } },
        ]
    }),

    new University({
        name: '덕성여자대학교', aliases: ['덕성여대'], region: '서울', type: '사립', basePercentile: 70.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 3.6 }, '정시': { 백분위: 70, 표준점수합: 325 } } },
            { name: '컴퓨터공학전공', category: '공학', admissions: { '학생부종합': { 내신참고: 3.5 }, '정시': { 백분위: 71, 표준점수합: 234 } } },
        ]
    }),

    new University({
        name: '성신여자대학교', aliases: ['성신여대'], region: '서울', type: '사립', basePercentile: 70.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 3.5 }, '정시': { 백분위: 70, 표준점수합: 326 } } },
            { name: '컴퓨터공학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.4 }, '정시': { 백분위: 72, 표준점수합: 236 } } },
        ]
    }),

    new University({
        name: '서울여자대학교', aliases: ['서울여대'], region: '서울', type: '사립', basePercentile: 68.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 3.7 }, '정시': { 백분위: 68, 표준점수합: 322 } } },
            { name: '소프트웨어융합학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.6 }, '정시': { 백분위: 69, 표준점수합: 232 } } },
        ]
    }),

    new University({
        name: '동덕여자대학교', aliases: ['동덕여대'], region: '서울', type: '사립', basePercentile: 66.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 3.9 }, '정시': { 백분위: 66, 표준점수합: 318 } } },
            { name: '컴퓨터학과', category: '공학', admissions: { '학생부종합': { 내신참고: 3.7 }, '정시': { 백분위: 67, 표준점수합: 228 } } },
        ]
    }),

    new University({
        name: '한성대학교', aliases: ['한성대'], region: '서울', type: '사립', basePercentile: 68.0,
        departments: [
            { name: '경영학부', category: '상경', admissions: { '학생부교과': { 내신: 3.8 }, '정시': { 백분위: 68, 표준점수합: 320 } } },
            { name: 'IT공학부', category: '공학', admissions: { '학생부종합': { 내신참고: 3.5 }, '정시': { 백분위: 70, 표준점수합: 234 } } },
        ]
    }),

    new University({
        name: '수원대학교', aliases: ['수원대'], region: '경기', type: '사립', basePercentile: 60.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 4.5 }, '정시': { 백분위: 60, 표준점수합: 310 } } },
            { name: '컴퓨터학부', category: '공학', admissions: { '정시': { 백분위: 62, 표준점수합: 224 } } },
        ]
    }),

    new University({
        name: '을지대학교', aliases: ['을지대'], region: '경기', type: '사립', basePercentile: 65.0,
        departments: [
            { name: '간호학과', category: '의학', admissions: { '학생부교과': { 내신: 2.8 }, '정시': { 백분위: 80, 표준점수합: 248 } } },
            { name: '의예과', category: '의학', admissions: { '학생부종합': { 내신참고: 1.3 }, '정시': { 백분위: 99, 표준점수합: 289 } } },
            { name: '물리치료학과', category: '의학', admissions: { '학생부교과': { 내신: 3.2 }, '정시': { 백분위: 72, 표준점수합: 238 } } },
        ]
    }),

    new University({
        name: '삼육대학교', aliases: ['삼육대'], region: '서울', type: '사립', basePercentile: 58.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 4.8 }, '정시': { 백분위: 58, 표준점수합: 305 } } },
            { name: '컴퓨터공학부', category: '공학', admissions: { '정시': { 백분위: 60, 표준점수합: 220 } } },
        ]
    }),

    new University({
        name: '협성대학교', aliases: ['협성대'], region: '경기', type: '사립', basePercentile: 50.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 5.5 }, '정시': { 백분위: 50, 표준점수합: 290 } } },
        ]
    }),

    new University({
        name: '한신대학교', aliases: ['한신대'], region: '경기', type: '사립', basePercentile: 50.0,
        departments: [
            { name: '경영학과', category: '상경', admissions: { '학생부교과': { 내신: 5.5 }, '정시': { 백분위: 50, 표준점수합: 290 } } },
        ]
    }),
];

const MED_KEYWORDS = ['의과대학', '의학과', '의예과', '치과대학', '치의학과', '치의예과',
    '한의과대학', '한의학과', '약학대학', '약학과', '수의과대학', '수의학과',
    '의대', '치대', '한의대', '약대', '수의대'];

const STUDY_GOLD_PER_HR = 10;

function findUniversity(name) {
    if (!name) return null;
    return UNIVERSITIES.find(u =>
        u.name === name ||
        u.aliases.some(a => name.includes(a) || a.includes(name)) ||
        name.includes(u.name) || u.name.includes(name)
    );
}

function getPercentile(universityName) {
    if (!universityName) return 50;

    for (const kw of MED_KEYWORDS) {
        if (universityName.includes(kw)) return 99.5;
    }

    const uni = findUniversity(universityName);
    if (uni) return uni.basePercentile;

    return 50;
}

function getTaxRate(universityName) {
    const pct = getPercentile(universityName);
    const ratio = (100 - pct) / 100;
    if (ratio <= 0) return 5;
    return -Math.log10(ratio);
}

function getTicketPrice() {
    return STUDY_GOLD_PER_HR * 14;
}

function getUniversityInfo(universityName) {
    const uni = findUniversity(universityName);
    if (!uni) return null;
    return {
        name: uni.name,
        region: uni.region,
        type: uni.type,
        basePercentile: uni.basePercentile,
        departments: uni.departments.map(d => ({
            name: d.name,
            category: d.category,
            admissions: d.admissions
        }))
    };
}

function getAllUniversities() {
    return UNIVERSITIES.map(u => ({
        name: u.name,
        aliases: u.aliases,
        region: u.region,
        type: u.type,
        basePercentile: u.basePercentile,
        departmentCount: u.departments.length,
        categories: [...new Set(u.departments.map(d => d.category))]
    }));
}

module.exports = {
    University, Department, UNIVERSITIES,
    getPercentile, getTaxRate, getTicketPrice, STUDY_GOLD_PER_HR,
    findUniversity, getUniversityInfo, getAllUniversities
};
