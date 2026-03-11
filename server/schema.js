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
                diamond                 INTEGER DEFAULT 0,
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
            ALTER TABLE users ADD COLUMN IF NOT EXISTS active_title VARCHAR(40) DEFAULT NULL;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_count INTEGER DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS streak_last_date DATE DEFAULT NULL;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS user_code VARCHAR(20);
            CREATE UNIQUE INDEX IF NOT EXISTS idx_users_user_code_unique ON users(user_code) WHERE user_code IS NOT NULL;
            UPDATE users
            SET user_code = CONCAT('PATH-', LPAD(id::text, 6, '0'))
            WHERE user_code IS NULL;
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
            CREATE TABLE IF NOT EXISTS user_titles (
                id          SERIAL PRIMARY KEY,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                code        VARCHAR(40) NOT NULL,
                title       VARCHAR(40) NOT NULL,
                is_active   BOOLEAN DEFAULT FALSE,
                achieved_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id, code)
            );
            CREATE INDEX IF NOT EXISTS idx_user_titles_user_id ON user_titles(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_titles_active ON user_titles(user_id, is_active);
        `);
        await client.query(`
            CREATE TABLE IF NOT EXISTS bounty_board (
                id             SERIAL PRIMARY KEY,
                bounty_type    VARCHAR(30) UNIQUE NOT NULL,
                target_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                reward_gold    INTEGER NOT NULL DEFAULT 0,
                reason         TEXT,
                updated_at     TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_bounty_board_updated ON bounty_board(updated_at DESC);
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
            ALTER TABLE users ADD COLUMN IF NOT EXISTS balloon_aura VARCHAR(50) DEFAULT 'none';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_auras TEXT DEFAULT 'none';
        `);

        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS ui_theme VARCHAR(30) DEFAULT 'default';
            ALTER TABLE users ADD COLUMN IF NOT EXISTS owned_themes TEXT DEFAULT 'default';
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
            ALTER TABLE users ADD COLUMN IF NOT EXISTS diamond INTEGER DEFAULT 0;
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS diamond_purchases (
                id              SERIAL PRIMARY KEY,
                user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                package_id      VARCHAR(40) NOT NULL,
                diamonds        INTEGER NOT NULL,
                paid_amount_krw INTEGER NOT NULL,
                provider        VARCHAR(30) NOT NULL,
                provider_tx_id  VARCHAR(120) UNIQUE NOT NULL,
                created_at      TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_diamond_purchases_user_created ON diamond_purchases(user_id, created_at DESC);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS diamond_payment_orders (
                id              SERIAL PRIMARY KEY,
                order_id        VARCHAR(80) UNIQUE NOT NULL,
                user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                package_id      VARCHAR(40) NOT NULL,
                provider        VARCHAR(30) NOT NULL,
                amount_krw      INTEGER NOT NULL,
                status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                created_at      TIMESTAMP DEFAULT NOW(),
                paid_at         TIMESTAMP NULL
            );
            CREATE INDEX IF NOT EXISTS idx_diamond_payment_orders_user_created ON diamond_payment_orders(user_id, created_at DESC);
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
            ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_id VARCHAR(128) UNIQUE;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS apple_email VARCHAR(255);
            CREATE INDEX IF NOT EXISTS idx_users_google_email ON users(google_email);
            CREATE INDEX IF NOT EXISTS idx_users_apple_email ON users(apple_email);
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
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (post_id, user_id)
            );
            ALTER TABLE community_likes
                ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
            CREATE INDEX IF NOT EXISTS idx_cl_user_post ON community_likes(user_id, post_id);
            CREATE INDEX IF NOT EXISTS idx_cl_user_created_at ON community_likes(user_id, created_at DESC);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS community_bookmarks (
                post_id  INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
                user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (post_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_cb_user_created_at ON community_bookmarks(user_id, created_at DESC);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS community_comments (
                id         SERIAL PRIMARY KEY,
                post_id    INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
                user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
                body       TEXT NOT NULL,
                ip_prefix  VARCHAR(20),
                nickname   VARCHAR(50),
                likes_count INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            ALTER TABLE community_comments
                ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;
            CREATE INDEX IF NOT EXISTS idx_cc_post_id ON community_comments(post_id);
            CREATE INDEX IF NOT EXISTS idx_cc_post_created_at ON community_comments(post_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_cc_likes_created_at ON community_comments(post_id, likes_count DESC, created_at DESC);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS community_comment_likes (
                comment_id INTEGER NOT NULL REFERENCES community_comments(id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (comment_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_ccl_user_created_at ON community_comment_likes(user_id, created_at DESC);
        `);

        // ── 그룹 타이머 방 ─────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS study_rooms (
                id              SERIAL PRIMARY KEY,
                name            VARCHAR(60) NOT NULL,
                goal            VARCHAR(100),
                creator_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                invite_code     VARCHAR(12) UNIQUE NOT NULL,
                max_members     INTEGER NOT NULL DEFAULT 10,
                is_active       BOOLEAN DEFAULT TRUE,
                created_at      TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_study_rooms_invite_code ON study_rooms(invite_code);
            CREATE INDEX IF NOT EXISTS idx_study_rooms_creator ON study_rooms(creator_id);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS study_room_members (
                room_id     INTEGER NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                joined_at   TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (room_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_study_room_members_user ON study_room_members(user_id);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS study_room_member_roles (
                room_id     INTEGER NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role        VARCHAR(20) NOT NULL DEFAULT 'member',
                updated_at  TIMESTAMP DEFAULT NOW(),
                PRIMARY KEY (room_id, user_id),
                CONSTRAINT study_room_member_roles_role_check
                    CHECK (role IN ('owner', 'manager', 'member'))
            );
            CREATE INDEX IF NOT EXISTS idx_study_room_member_roles_room_role
                ON study_room_member_roles(room_id, role);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS study_room_messages (
                id          SERIAL PRIMARY KEY,
                room_id     INTEGER NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                content     VARCHAR(500) NOT NULL,
                created_at  TIMESTAMP DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_study_room_messages_room ON study_room_messages(room_id, created_at);
        `);

        // ── 방 꾸미기 ──────────────────────────────────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS room_owned_items (
                id              SERIAL PRIMARY KEY,
                room_id         INTEGER NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
                item_key        VARCHAR(50) NOT NULL,
                category        VARCHAR(20) NOT NULL,
                purchased_by    INTEGER NOT NULL REFERENCES users(id),
                purchased_at    TIMESTAMP DEFAULT NOW(),
                UNIQUE(room_id, item_key)
            );
            CREATE INDEX IF NOT EXISTS idx_room_owned_items_room ON room_owned_items(room_id);
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS room_decor_state (
                room_id         INTEGER PRIMARY KEY REFERENCES study_rooms(id) ON DELETE CASCADE,
                wallpaper_key   VARCHAR(50) DEFAULT 'default',
                prop_keys       JSONB DEFAULT '[]'::jsonb,
                updated_at      TIMESTAMP DEFAULT NOW()
            );
        `);

        await client.query(`
            CREATE TABLE IF NOT EXISTS room_gold_contributed (
                room_id     INTEGER NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                total_gold  INTEGER DEFAULT 0 NOT NULL,
                PRIMARY KEY(room_id, user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_room_gold_contributed_room ON room_gold_contributed(room_id);
        `);

        // ── 공개/비공개 설정 ────────────────────────────────────────────────────
        await client.query(`
            ALTER TABLE study_rooms ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;
            ALTER TABLE study_rooms ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL;
            ALTER TABLE study_rooms ADD COLUMN IF NOT EXISTS deleted_by INTEGER NULL REFERENCES users(id) ON DELETE SET NULL;
            CREATE INDEX IF NOT EXISTS idx_study_rooms_public ON study_rooms(is_public) WHERE is_public = TRUE;
        `);

        // ── 방 역할 백필(owner/manager/member) ─────────────────────────────────────
        await client.query(`
            INSERT INTO study_room_member_roles (room_id, user_id, role)
            SELECT r.id, r.creator_id, 'owner'
            FROM study_rooms r
            ON CONFLICT (room_id, user_id)
            DO UPDATE SET role = 'owner', updated_at = NOW();

            INSERT INTO study_room_member_roles (room_id, user_id, role)
            SELECT m.room_id, m.user_id, 'member'
            FROM study_room_members m
            WHERE NOT EXISTS (
                SELECT 1
                FROM study_room_member_roles rr
                WHERE rr.room_id = m.room_id AND rr.user_id = m.user_id
            )
            ON CONFLICT (room_id, user_id)
            DO NOTHING;
        `);

        // ── 월드 좌표 저장 (마지막 위치 기억) ────────────────────────────────
        await client.query(`
            ALTER TABLE users ADD COLUMN IF NOT EXISTS world_x INTEGER DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS world_y INTEGER DEFAULT 0;
            ALTER TABLE users ADD COLUMN IF NOT EXISTS world_z INTEGER DEFAULT 0;
        `);

        // ── 관리자 감사 로그 (append-only: 수정/삭제 금지) ─────────────────────────
        await client.query(`
            CREATE TABLE IF NOT EXISTS admin_audit_logs (
                id              BIGSERIAL PRIMARY KEY,
                action          VARCHAR(80) NOT NULL,
                actor_user_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
                target_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
                details         JSONB NOT NULL DEFAULT '{}'::jsonb,
                created_at      TIMESTAMP NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_actor ON admin_audit_logs(actor_user_id, created_at DESC);
            CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_target ON admin_audit_logs(target_user_id, created_at DESC);

            CREATE OR REPLACE FUNCTION prevent_admin_audit_logs_mutation()
            RETURNS trigger AS $$
            BEGIN
                RAISE EXCEPTION 'admin_audit_logs is append-only';
            END;
            $$ LANGUAGE plpgsql;

            DROP TRIGGER IF EXISTS trg_admin_audit_logs_no_update ON admin_audit_logs;
            CREATE TRIGGER trg_admin_audit_logs_no_update
            BEFORE UPDATE ON admin_audit_logs
            FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_logs_mutation();

            DROP TRIGGER IF EXISTS trg_admin_audit_logs_no_delete ON admin_audit_logs;
            CREATE TRIGGER trg_admin_audit_logs_no_delete
            BEFORE DELETE ON admin_audit_logs
            FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_logs_mutation();
        `);

        // ── 입시 지원 시스템 ───────────────────────────────────────────────────

        // 과목별 점수 (유저당 1행, UPSERT로 업데이트)
        await client.query(`
            CREATE TABLE IF NOT EXISTS exam_scores (
                id                      SERIAL PRIMARY KEY,
                user_id                 INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                -- 국어
                korean_std              INTEGER,
                korean_percentile       NUMERIC(5,2),
                korean_subject          VARCHAR(20),
                -- 수학
                math_std                INTEGER,
                math_percentile         NUMERIC(5,2),
                math_subject            VARCHAR(20),
                -- 영어
                english_grade           SMALLINT,
                -- 탐구1
                explore1_subject        VARCHAR(50),
                explore1_std            INTEGER,
                explore1_percentile     NUMERIC(5,2),
                -- 탐구2
                explore2_subject        VARCHAR(50),
                explore2_std            INTEGER,
                explore2_percentile     NUMERIC(5,2),
                -- 한국사
                history_grade           SMALLINT,
                -- 제2외국어/한문 (선택)
                second_lang_subject     VARCHAR(50),
                second_lang_std         INTEGER,
                second_lang_percentile  NUMERIC(5,2),
                -- 성적표 인증
                score_image_url         TEXT,
                verified_status         VARCHAR(20) DEFAULT 'none',
                verified_at             TIMESTAMP,
                -- 메타
                source_round_name       VARCHAR(100),
                created_at              TIMESTAMP DEFAULT NOW(),
                updated_at              TIMESTAMP DEFAULT NOW(),
                UNIQUE(user_id)
            );
            CREATE INDEX IF NOT EXISTS idx_exam_scores_user_id ON exam_scores(user_id);
            CREATE INDEX IF NOT EXISTS idx_exam_scores_verified ON exam_scores(verified_status);
        `);

        // 입시 회차
        await client.query(`
            CREATE TABLE IF NOT EXISTS admission_rounds (
                id              SERIAL PRIMARY KEY,
                name            VARCHAR(100) NOT NULL,
                exam_type       VARCHAR(20) NOT NULL DEFAULT '모의고사',
                status          VARCHAR(20) NOT NULL DEFAULT 'upcoming',
                apply_start_at  TIMESTAMP,
                apply_end_at    TIMESTAMP,
                result_at       TIMESTAMP,
                created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
                created_at      TIMESTAMP DEFAULT NOW(),
                CONSTRAINT admission_rounds_status_check
                    CHECK (status IN ('upcoming','open','closed','announcing','announced','final')),
                CONSTRAINT admission_rounds_exam_type_check
                    CHECK (exam_type IN ('수능','평가원','교육청'))
            );
            CREATE INDEX IF NOT EXISTS idx_admission_rounds_status ON admission_rounds(status);
        `);

        // 원서
        await client.query(`
            CREATE TABLE IF NOT EXISTS applications (
                id              SERIAL PRIMARY KEY,
                round_id        INTEGER NOT NULL REFERENCES admission_rounds(id) ON DELETE CASCADE,
                user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                university      VARCHAR(100) NOT NULL,
                department      VARCHAR(100),
                group_type      CHAR(1) NOT NULL,
                status          VARCHAR(20) NOT NULL DEFAULT 'applied',
                cancelled_at    TIMESTAMP,
                result_at       TIMESTAMP,
                created_at      TIMESTAMP DEFAULT NOW(),
                UNIQUE(round_id, user_id, group_type),
                CONSTRAINT applications_group_type_check
                    CHECK (group_type IN ('가','나','다')),
                CONSTRAINT applications_status_check
                    CHECK (status IN ('applied','cancelled','passed','failed','waitlisted','enrolled','declined'))
            );
            CREATE INDEX IF NOT EXISTS idx_applications_round_user ON applications(round_id, user_id);
            CREATE INDEX IF NOT EXISTS idx_applications_round_group ON applications(round_id, group_type);
            CREATE INDEX IF NOT EXISTS idx_applications_user ON applications(user_id);
        `);

        // 회차별 대학 통계 (A 추정에 사용)
        await client.query(`
            CREATE TABLE IF NOT EXISTS admission_stats (
                id              SERIAL PRIMARY KEY,
                round_id        INTEGER NOT NULL REFERENCES admission_rounds(id) ON DELETE CASCADE,
                university      VARCHAR(100) NOT NULL,
                department      VARCHAR(100),
                group_type      CHAR(1),
                site_applicants INTEGER DEFAULT 0,
                estimated_A     NUMERIC(10,2) DEFAULT 0,
                accepted_count  INTEGER DEFAULT 0,
                UNIQUE(round_id, university, department, group_type)
            );
            CREATE INDEX IF NOT EXISTS idx_admission_stats_round ON admission_stats(round_id);
            CREATE INDEX IF NOT EXISTS idx_admission_stats_uni ON admission_stats(university, department);
        `);

        // 추합 라운드 (1~3차)
        await client.query(`
            CREATE TABLE IF NOT EXISTS supplementary_rounds (
                id              SERIAL PRIMARY KEY,
                round_id        INTEGER NOT NULL REFERENCES admission_rounds(id) ON DELETE CASCADE,
                sub_round       SMALLINT NOT NULL,
                status          VARCHAR(20) NOT NULL DEFAULT 'pending',
                opened_at       TIMESTAMP,
                closed_at       TIMESTAMP,
                UNIQUE(round_id, sub_round),
                CONSTRAINT supplementary_rounds_sub_check CHECK (sub_round IN (1,2,3)),
                CONSTRAINT supplementary_rounds_status_check
                    CHECK (status IN ('pending','open','announced','closed'))
            );
            CREATE INDEX IF NOT EXISTS idx_supplementary_rounds_round ON supplementary_rounds(round_id);
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
