const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const cors = require('cors');
const path = require('path');
const pool = require('./db');

const app = express();
const PORT = 5000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({ origin: true, credentials: true }));

app.use(session({
    store: new pgSession({ pool, tableName: 'sessions' }),
    secret: process.env.SESSION_SECRET || 'path-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
    }
}));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/study', require('./routes/study'));
app.use('/api/ranking', require('./routes/ranking'));
app.use('/api/estate', require('./routes/estate'));
app.use('/api/invasion', require('./routes/invasion'));
app.use('/api/notifications', require('./routes/notifications'));

app.use(express.static(path.join(__dirname, '..')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'P.A.T.H', 'login', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`P.A.T.H 서버 실행 중 - http://0.0.0.0:${PORT}`);
});
