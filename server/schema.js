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
                profile_image_url       TEXT,
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
                admin_role              VARCHAR(10) DEFAULT 'none',
                created_at              TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_role VARCHAR(10) DEFAULT 'none';
            ALTER TABLE users DROP CONSTRAINT IF EXISTS users_admin_role_check;
            ALTER TABLE users
                ADD CONSTRAINT users_admin_role_check
                CHECK (admin_role IN ('none', 'sub', 'main'));
            UPDATE users
            SET admin_role = CASE
                WHEN is_admin = TRUE AND (admin_role IS NULL OR admin_role = 'none') THEN 'sub'
                WHEN is_admin = FALSE AND admin_role IN ('sub', 'main') THEN 'none'
                ELSE admin_role
            END;
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
            ALTER TABLE study_records ADD COLUMN IF NOT EXISTS proof_image_url TEXT;
            ALTER TABLE study_records ADD COLUMN IF NOT EXISTS proof_bonus_gold INTEGER DEFAULT 0;
            ALTER TABLE study_records ADD COLUMN IF NOT EXISTS proof_bonus_claimed BOOLEAN DEFAULT FALSE;
            CREATE INDEX IF NOT EXISTS idx_study_records_user_subject_created ON study_records(user_id, subject_id, created_at);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS study_proof_images (
                id               SERIAL PRIMARY KEY,
                study_record_id  INTEGER NOT NULL REFERENCES study_records(id) ON DELETE CASCADE,
                user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                image_url        TEXT NOT NULL,
                created_at       TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_study_proof_images_record_id ON study_proof_images(study_record_id);
            CREATE INDEX IF NOT EXISTS idx_study_proof_images_user_id ON study_proof_images(user_id);
            CREATE INDEX IF NOT EXISTS idx_study_proof_images_created_at ON study_proof_images(created_at);
        `);

        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS cam_enabled BOOLEAN DEFAULT FALSE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS cam_visibility VARCHAR(20) DEFAULT 'all';
        `);

        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS status_emoji VARCHAR(12) DEFAULT NULL;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS status_message VARCHAR(60) DEFAULT NULL;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_image_url TEXT;
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

        // ── 커뮤니티 테이블 ─────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS community_posts (
                id             SERIAL PRIMARY KEY,
                user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
                category       VARCHAR(20)  NOT NULL DEFAULT '정보',
                title          VARCHAR(200) NOT NULL,
                body           TEXT         NOT NULL DEFAULT '',
                image_url      TEXT,
                link_url       TEXT,
                ip_prefix      VARCHAR(20),
                nickname       VARCHAR(50),
                views          INTEGER NOT NULL DEFAULT 0,
                likes          INTEGER NOT NULL DEFAULT 0,
                comments_count INTEGER NOT NULL DEFAULT 0,
                created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_cp_created_at ON community_posts(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cp_category   ON community_posts(category);
            CREATE INDEX IF NOT EXISTS idx_cp_likes      ON community_posts(likes DESC);
            CREATE INDEX IF NOT EXISTS idx_cp_category_created_at ON community_posts(category, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cp_category_likes_created_at ON community_posts(category, likes DESC, created_at DESC);
        `);

        await client.query(`
            ALTER TABLE community_posts
                ADD COLUMN IF NOT EXISTS image_url TEXT;
            ALTER TABLE community_posts
                ADD COLUMN IF NOT EXISTS link_url TEXT;

            ALTER TABLE community_posts
                DROP CONSTRAINT IF EXISTS community_posts_category_check;
            ALTER TABLE community_posts
                ADD CONSTRAINT community_posts_category_check
                CHECK (category IN ('념글', '정보', '질문', '잡담')) NOT VALID;

            ALTER TABLE community_posts
                DROP CONSTRAINT IF EXISTS community_posts_non_negative_counts_check;
            ALTER TABLE community_posts
                ADD CONSTRAINT community_posts_non_negative_counts_check
                CHECK (views >= 0 AND likes >= 0 AND comments_count >= 0) NOT VALID;
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS community_likes (
                post_id  INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
                user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                PRIMARY KEY (post_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_cl_user_post ON community_likes(user_id, post_id);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS community_comments (
                id         SERIAL PRIMARY KEY,
                post_id    INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
                user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
                body       TEXT NOT NULL,
                ip_prefix  VARCHAR(20),
                nickname   VARCHAR(50),
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_cc_post_id ON community_comments(post_id);
            CREATE INDEX IF NOT EXISTS idx_cc_post_created_at ON community_comments(post_id, created_at DESC);
        `);

        // ── 결제 / 수익 모델 테이블 ────────────────────────────────────────
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT FALSE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMP;
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS payments (
                id            SERIAL PRIMARY KEY,
                user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                platform      VARCHAR(10) NOT NULL DEFAULT 'web',
                payment_key   VARCHAR(300) UNIQUE,
                order_id      VARCHAR(200) UNIQUE NOT NULL,
                amount        INTEGER NOT NULL,
                gold_amount   INTEGER NOT NULL,
                item_type     VARCHAR(20) DEFAULT 'gold_pack',
                status        VARCHAR(20) DEFAULT 'pending',
                created_at    TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
            CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
            CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS subscriptions (
                id            SERIAL PRIMARY KEY,
                user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
                platform      VARCHAR(10) NOT NULL DEFAULT 'web',
                billing_key   VARCHAR(300),
                plan_id       VARCHAR(50) NOT NULL DEFAULT 'premium_monthly',
                started_at    TIMESTAMP DEFAULT NOW(),
                expires_at    TIMESTAMP NOT NULL,
                status        VARCHAR(20) DEFAULT 'active',
                created_at    TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
            CREATE INDEX IF NOT EXISTS idx_subscriptions_expires_at ON subscriptions(expires_at);
        `);

        // ── 코스메틱 확장: 프로필 뱃지, 닉네임 색상 ──────────────────────
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS nickname_color VARCHAR(30) DEFAULT 'default';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_nickname_colors TEXT DEFAULT 'default';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_badge VARCHAR(50) DEFAULT 'none';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_badges TEXT DEFAULT '';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily_bonus_at TIMESTAMP;
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
