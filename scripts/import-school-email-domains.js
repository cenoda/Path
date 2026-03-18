const fs = require('fs');
const path = require('path');
const pool = require('../server/db');
const { parseUniversityDomainText } = require('../server/utils/schoolEmailDomain');

async function main() {
    const inputPath = process.argv[2]
        ? path.resolve(process.argv[2])
        : path.join(__dirname, '..', 'server', 'data', 'school-email-domains.raw.txt');

    if (!fs.existsSync(inputPath)) {
        console.error(`[ERROR] 입력 파일을 찾을 수 없습니다: ${inputPath}`);
        console.error('[HINT] 인자로 파일 경로를 넘기거나 server/data/school-email-domains.raw.txt 파일을 만들어주세요.');
        process.exit(1);
    }

    const rawText = fs.readFileSync(inputPath, 'utf8');
    const { entries, invalidLines, stats } = parseUniversityDomainText(rawText);

    if (!entries.length) {
        console.error('[ERROR] 유효한 데이터가 없습니다. 입력 포맷을 확인해주세요.');
        if (invalidLines.length) {
            console.error('[INFO] 파싱 실패 샘플:', invalidLines.slice(0, 5));
        }
        process.exit(1);
    }

    const domains = [...new Set(entries.map((entry) => entry.domain))];

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        let insertedDomains = 0;
        for (const domain of domains) {
            const result = await client.query(
                `INSERT INTO school_email_domains (domain, is_active, source)
                 VALUES ($1, TRUE, 'bulk-import')
                 ON CONFLICT (domain) DO NOTHING`,
                [domain]
            );
            insertedDomains += result.rowCount;
        }

        let insertedMappings = 0;
        for (const entry of entries) {
            const result = await client.query(
                `INSERT INTO school_email_domain_universities (domain, university_name)
                 VALUES ($1, $2)
                 ON CONFLICT (domain, university_name) DO NOTHING`,
                [entry.domain, entry.universityName]
            );
            insertedMappings += result.rowCount;
        }

        await client.query('COMMIT');

        console.log('[DONE] 학교 이메일 도메인 가져오기 완료');
        console.log(JSON.stringify({
            inputPath,
            parsed: stats,
            insertedDomains,
            insertedMappings,
            ignoredDuplicates: stats.validEntries - insertedMappings,
            invalidCount: invalidLines.length,
        }, null, 2));

        if (invalidLines.length) {
            console.log('[WARN] 파싱 실패 샘플(최대 10개)');
            console.log(JSON.stringify(invalidLines.slice(0, 10), null, 2));
        }
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('[ERROR] 가져오기 실패:', err.message);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

main();
