const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const pool = require('./db');
const { initSchema } = require('./schema');

const app = express();
const PORT = process.env.PORT || 5000;
const isProduction = process.env.NODE_ENV === 'production';

app.set('trust proxy', 1);

const allowedOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
    origin(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) return callback(null, true);
        return callback(null, allowedOrigins.includes(origin));
    },
    credentials: true
}));

app.use(session({
    store: new pgSession({ pool, tableName: 'sessions' }),
    secret: process.env.SESSION_SECRET || 'path-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: isProduction,
        sameSite: process.env.SESSION_SAME_SITE || 'lax',
        domain: process.env.SESSION_COOKIE_DOMAIN || undefined
    }
}));

app.get('/api/health', (req, res) => {
    res.json({ ok: true, service: 'path-api' });
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/study', require('./routes/study'));
app.use('/api/ranking', require('./routes/ranking'));
app.use('/api/estate', require('./routes/estate'));
app.use('/api/invasion', require('./routes/invasion'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/university', require('./routes/university'));
app.use('/api/cam', require('./routes/cam'));
app.use('/api/friends', require('./routes/friends'));
app.use('/api/messages', require('./routes/messages'));

app.use('/uploads/scores/:filename', (req, res) => {
    res.redirect(`/api/auth/score-image/${req.params.filename}`);
});
app.use('/uploads/gpa/:filename', (req, res) => {
    res.redirect(`/api/auth/gpa-image/${req.params.filename}`);
});
app.use(express.static(path.join(__dirname, '..'), {
    maxAge: '1d',
    etag: true
}));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'P.A.T.H', 'login', 'index.html'));
});

initSchema()
    .then(() => {
        app.listen(PORT, '0.0.0.0', () => {
            console.log(`P.A.T.H 서버 실행 중 - http://0.0.0.0:${PORT}`);
        });
    })
    .catch(err => {
        console.error('서버 시작 실패 (DB 초기화 오류):', err.message);
        process.exit(1);
    });
