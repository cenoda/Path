const pool = require('./db');

async function initSchema() {
    const client = await pool.connect();
    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS "sessions" (
                "sid"    varchar      NOT NULL COLLATE "default",
                "sess"   json         NOT NULL,
                "expire" timestamp(6) NOT NULL,
                CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
            );
            CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "sessions" ("expire");
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS users (
                id                      SERIAL PRIMARY KEY,
                nickname                VARCHAR(30) UNIQUE NOT NULL,
                password_hash           TEXT NOT NULL,
                real_name               VARCHAR(50),
                university              VARCHAR(100),
                is_n_su                 BOOLEAN DEFAULT FALSE,
                prev_university         VARCHAR(100),
                gold                    INTEGER DEFAULT 0,
                exp                     INTEGER DEFAULT 0,
                tier                    VARCHAR(20) DEFAULT 'BRONZE',
                tickets                 INTEGER DEFAULT 0,
                mock_exam_score         INTEGER DEFAULT 0,
                score_status            VARCHAR(20) DEFAULT 'none',
                score_image_url         TEXT,
                gpa_score               NUMERIC(3,2),
                gpa_status              VARCHAR(20) DEFAULT 'none',
                gpa_image_url           TEXT,
                gpa_public              BOOLEAN DEFAULT FALSE,
                is_studying             BOOLEAN DEFAULT FALSE,
                study_started_at        TIMESTAMP,
                target_duration_sec     INTEGER DEFAULT 0,
                last_tax_collected_at   TIMESTAMP DEFAULT NOW(),
                privacy_agreed          BOOLEAN DEFAULT FALSE,
                is_admin                BOOLEAN DEFAULT FALSE,
                created_at              TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS study_records (
                id            SERIAL PRIMARY KEY,
                user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                duration_sec  INTEGER DEFAULT 0,
                result        VARCHAR(20) NOT NULL,
                earned_gold   INTEGER DEFAULT 0,
                earned_exp    INTEGER DEFAULT 0,
                created_at    TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_study_records_user_id ON study_records(user_id);
            CREATE INDEX IF NOT EXISTS idx_study_records_created_at ON study_records(created_at);
            CREATE INDEX IF NOT EXISTS idx_study_records_user_created ON study_records(user_id, created_at);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS study_subjects (
                id          SERIAL PRIMARY KEY,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                name        VARCHAR(60) NOT NULL,
                created_at  TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, name)
            );
            CREATE INDEX IF NOT EXISTS idx_study_subjects_user_id ON study_subjects(user_id);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS study_plans (
                id              SERIAL PRIMARY KEY,
                user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                subject_id      INTEGER REFERENCES study_subjects(id) ON DELETE SET NULL,
                plan_date       DATE NOT NULL,
                start_minute    INTEGER NOT NULL,
                end_minute      INTEGER NOT NULL,
                note            VARCHAR(120),
                is_completed    BOOLEAN DEFAULT FALSE,
                created_at      TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_study_plans_user_date ON study_plans(user_id, plan_date);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS invasions (
                id                  SERIAL PRIMARY KEY,
                attacker_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                defender_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                attacker_study_sec  INTEGER DEFAULT 0,
                defender_study_sec  INTEGER DEFAULT 0,
                result              VARCHAR(10) NOT NULL,
                loot_gold           INTEGER DEFAULT 0,
                created_at          TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_invasions_attacker ON invasions(attacker_id);
            CREATE INDEX IF NOT EXISTS idx_invasions_defender ON invasions(defender_id);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS notifications (
                id          SERIAL PRIMARY KEY,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                type        VARCHAR(30) DEFAULT 'info',
                message     TEXT NOT NULL,
                is_read     BOOLEAN DEFAULT FALSE,
                created_at  TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
        `);

        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS balloon_skin VARCHAR(50) DEFAULT 'default';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_skins TEXT DEFAULT 'default';
        `);

        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS current_study_subject_id INTEGER DEFAULT NULL;
            ALTER TABLE study_records ADD COLUMN IF NOT EXISTS subject_id INTEGER DEFAULT NULL;
            CREATE INDEX IF NOT EXISTS idx_study_records_user_subject_created ON study_records(user_id, subject_id, created_at);
        `);

        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS cam_enabled BOOLEAN DEFAULT FALSE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS cam_visibility VARCHAR(20) DEFAULT 'all';
        `);

        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS status_emoji VARCHAR(12) DEFAULT NULL;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS status_message VARCHAR(60) DEFAULT NULL;
        `);

        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(20) DEFAULT 'local';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS google_id VARCHAR(64) UNIQUE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS google_email VARCHAR(255);
            CREATE INDEX IF NOT EXISTS idx_users_google_email ON users(google_email);
        `);

        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_hash VARCHAR(64) DEFAULT NULL;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT FALSE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified_at TIMESTAMP DEFAULT NULL;
            CREATE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS phone_verifications (
                id              SERIAL PRIMARY KEY,
                phone_hash      VARCHAR(64) NOT NULL,
                code            VARCHAR(6) NOT NULL,
                expires_at      TIMESTAMP NOT NULL,
                verified        BOOLEAN DEFAULT FALSE,
                ip_address      VARCHAR(45),
                created_at      TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_phone_verifications_hash ON phone_verifications(phone_hash);
            CREATE INDEX IF NOT EXISTS idx_phone_verifications_expires ON phone_verifications(expires_at);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS cam_captures (
                id          SERIAL PRIMARY KEY,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                image_data  TEXT NOT NULL,
                visibility  VARCHAR(20) DEFAULT 'all',
                created_at  TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_cam_captures_user_id ON cam_captures(user_id);
            CREATE INDEX IF NOT EXISTS idx_cam_captures_created_at ON cam_captures(created_at);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS friendships (
                id          SERIAL PRIMARY KEY,
                sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                status      VARCHAR(20) DEFAULT 'pending',
                created_at  TIMESTAMP DEFAULT NOW(),
                UNIQUE(sender_id, receiver_id)
            );
            CREATE INDEX IF NOT EXISTS idx_friendships_sender ON friendships(sender_id);
            CREATE INDEX IF NOT EXISTS idx_friendships_receiver ON friendships(receiver_id);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS messages (
                id          SERIAL PRIMARY KEY,
                sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                content     TEXT NOT NULL,
                is_read     BOOLEAN DEFAULT FALSE,
                created_at  TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
            CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
            CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
        `);

        await client.query(`
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_path VARCHAR(500) DEFAULT NULL;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_type VARCHAR(100) DEFAULT NULL;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_size INTEGER DEFAULT NULL;
            ALTER TABLE messages ADD COLUMN IF NOT EXISTS file_name VARCHAR(255) DEFAULT NULL;
        `);

        console.log('DB 스키마 초기화 완료');
    } catch (err) {
        console.error('DB 스키마 초기화 오류:', err.message);
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { initSchema };
