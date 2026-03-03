const pool = require('./server/db');
const { UNIVERSITIES } = require('./server/data/universities');

async function createUniversityEstates() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 각 대학교별 영지 생성
        for (const uni of UNIVERSITIES) {
            // estate_name 생성 (대학교 이름을 기반으로)
            const estateName = `${uni.name} 영지`;
            const description = `${uni.name} (${uni.region}) - 백분위 ${uni.basePercentile}%`;
            
            // 기존 영지가 있는지 확인
            const existing = await client.query(
                `SELECT id FROM estates WHERE name = $1 AND owner_id IS NULL LIMIT 1`,
                [estateName]
            );

            if (existing.rows.length === 0) {
                // estates 테이블 생성 (없을 경우)
                try {
                    await client.query(`
                        CREATE TABLE IF NOT EXISTS estates (
                            id SERIAL PRIMARY KEY,
                            name VARCHAR(255) NOT NULL,
                            university VARCHAR(255),
                            owner_id INTEGER REFERENCES users(id),
                            gold INTEGER DEFAULT 0,
                            income_rate NUMERIC(5,2) DEFAULT 0,
                            percentile NUMERIC(5,2),
                            is_main BOOLEAN DEFAULT false,
                            created_at TIMESTAMP DEFAULT NOW(),
                            updated_at TIMESTAMP DEFAULT NOW()
                        )
                    `);
                } catch (err) {
                    // 테이블이 이미 있으면 무시
                    if (!err.message.includes('already exists')) {
                        console.error('테이블 생성 오류:', err);
                    }
                }

                // 대학교별 영지 생성 (소유자 없이)
                await client.query(`
                    INSERT INTO estates (name, university, percentile, gold)
                    VALUES ($1, $2, $3, 50000)
                `, [estateName, uni.name, uni.basePercentile]);

                console.log(`✓ 생성됨: ${estateName}`);
            } else {
                console.log(`- 이미 존재: ${estateName}`);
            }
        }

        await client.query('COMMIT');
        console.log('\n✅ 모든 대학교 영지가 생성되었습니다!');
    } catch (err) {
        await client.query('ROLLBACK');
        console.error('❌ 오류:', err);
    } finally {
        client.release();
        pool.end();
    }
}

createUniversityEstates();
