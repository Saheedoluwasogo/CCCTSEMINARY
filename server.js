'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const TOKEN_COOKIE = 'ccc_token';
const TOKEN_TTL = '7d';

const SITE_DIR = path.join(__dirname, 'USERS FRONT END');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ----- Helpers -------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(row) {
	return { id: row.id, name: row.name, email: row.email };
}

function setAuthCookie(res, user) {
	const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, {
		expiresIn: TOKEN_TTL,
	});
	res.cookie(TOKEN_COOKIE, token, {
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		maxAge: 7 * 24 * 60 * 60 * 1000,
	});
}

function currentUser(req) {
	const token = req.cookies && req.cookies[TOKEN_COOKIE];
	if (!token) return null;
	try {
		const payload = jwt.verify(token, JWT_SECRET);
		const row = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
		return row ? publicUser(row) : null;
	} catch (err) {
		return null;
	}
}

// ----- API -----------------------------------------------------------------
app.post('/api/register', (req, res) => {
	const name = (req.body.name || '').trim();
	const email = (req.body.email || '').trim().toLowerCase();
	const password = req.body.password || '';

	if (!name || !email || !password) {
		return res.status(400).json({ ok: false, error: 'Name, email and password are required.' });
	}
	if (!EMAIL_RE.test(email)) {
		return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
	}
	if (password.length < 6) {
		return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
	}

	const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
	if (existing) {
		return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
	}

	const passwordHash = bcrypt.hashSync(password, 10);
	const info = db
		.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
		.run(name, email, passwordHash);
	const user = { id: info.lastInsertRowid, name, email };

	setAuthCookie(res, user);
	return res.status(201).json({ ok: true, user });
});

app.post('/api/login', (req, res) => {
	const email = (req.body.email || '').trim().toLowerCase();
	const password = req.body.password || '';

	if (!email || !password) {
		return res.status(400).json({ ok: false, error: 'Email and password are required.' });
	}

	const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
	if (!row || !bcrypt.compareSync(password, row.password_hash)) {
		return res.status(401).json({ ok: false, error: 'Invalid email or password.' });
	}

	const user = publicUser(row);
	setAuthCookie(res, user);
	return res.json({ ok: true, user });
});

app.post('/api/logout', (req, res) => {
	res.clearCookie(TOKEN_COOKIE);
	return res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
	const user = currentUser(req);
	return res.json({ ok: true, user });
});

app.post('/api/contact', (req, res) => {
	const name = (req.body.name || '').trim();
	const email = (req.body.email || '').trim();
	const phone = (req.body.phone || '').trim();
	const subject = (req.body.subject || '').trim();
	const message = (req.body.message || '').trim();

	if (!name || !email || !message) {
		return res.status(400).json({ ok: false, error: 'Name, email and message are required.' });
	}
	if (!EMAIL_RE.test(email)) {
		return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
	}

	db.prepare(
		'INSERT INTO messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)'
	).run(name, email, phone, subject, message);

	return res.status(201).json({ ok: true, message: 'Thank you! Your message has been received.' });
});

app.post('/api/subscribe', (req, res) => {
	const email = (req.body.email || '').trim().toLowerCase();

	if (!EMAIL_RE.test(email)) {
		return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
	}

	db.prepare('INSERT OR IGNORE INTO subscriptions (email) VALUES (?)').run(email);

	return res.status(201).json({ ok: true, message: 'You are subscribed for Bible study updates.' });
});

// ----- Static site ---------------------------------------------------------
app.use(express.static(SITE_DIR));

app.get('/', (req, res) => {
	res.sendFile(path.join(SITE_DIR, 'index.html'));
});

app.listen(PORT, () => {
	console.log(`CCCTSeminary server running at http://localhost:${PORT}`);
});
