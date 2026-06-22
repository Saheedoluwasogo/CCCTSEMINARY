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

// Roles a visitor may self-register as. 'admin' is provisioned manually.
const SELF_ROLES = ['student', 'alumni', 'staff', 'non_staff', 'all_users'];
const ROLE_LABELS = {
	student: 'Student',
	alumni: 'Alumnus',
	staff: 'Staff',
	non_staff: 'Non-Staff',
	all_users: 'Member',
	admin: 'Administrator',
};

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ----- Helpers -------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(row) {
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		role: row.role,
		roleLabel: ROLE_LABELS[row.role] || 'Member',
		matricNumber: row.matric_number,
	};
}

function setAuthCookie(res, user) {
	const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, {
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

function requireAuth(req, res, next) {
	const user = currentUser(req);
	if (!user) {
		return res.status(401).json({ ok: false, error: 'Please sign in to continue.' });
	}
	req.user = user;
	next();
}

// ----- API -----------------------------------------------------------------
app.post('/api/register', (req, res) => {
	const name = (req.body.name || '').trim();
	const email = (req.body.email || '').trim().toLowerCase();
	const password = req.body.password || '';
	const matric = (req.body.matricNumber || req.body.matric_number || '').trim();
	let role = (req.body.role || 'all_users').trim();

	if (SELF_ROLES.indexOf(role) === -1) {
		role = 'all_users';
	}
	if (!name || !password) {
		return res.status(400).json({ ok: false, error: 'Name and password are required.' });
	}
	if (password.length < 6) {
		return res.status(400).json({ ok: false, error: 'Password must be at least 6 characters.' });
	}

	const passwordHash = bcrypt.hashSync(password, 10);

	if (role === 'student') {
		if (!matric) {
			return res.status(400).json({ ok: false, error: 'Matriculation number is required for students.' });
		}
		if (db.prepare('SELECT id FROM users WHERE matric_number = ?').get(matric)) {
			return res.status(409).json({ ok: false, error: 'An account with this matriculation number already exists.' });
		}
		if (email && db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
			return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
		}
		const info = db
			.prepare('INSERT INTO users (name, email, password_hash, role, matric_number) VALUES (?, ?, ?, ?, ?)')
			.run(name, email || null, passwordHash, role, matric);
		const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
		setAuthCookie(res, user);
		return res.status(201).json({ ok: true, user });
	}

	if (!email) {
		return res.status(400).json({ ok: false, error: 'Email is required.' });
	}
	if (!EMAIL_RE.test(email)) {
		return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
	}
	if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
		return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
	}

	const info = db
		.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
		.run(name, email, passwordHash, role);
	const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));

	setAuthCookie(res, user);
	return res.status(201).json({ ok: true, user });
});

app.post('/api/login', (req, res) => {
	const identifier = (req.body.identifier || req.body.email || '').trim();
	const password = req.body.password || '';

	if (!identifier || !password) {
		return res.status(400).json({ ok: false, error: 'Email/matric number and password are required.' });
	}

	// Match by matriculation number first, then fall back to email.
	let row = db.prepare('SELECT * FROM users WHERE matric_number = ?').get(identifier);
	if (!row) {
		row = db.prepare('SELECT * FROM users WHERE email = ?').get(identifier.toLowerCase());
	}
	if (!row || !bcrypt.compareSync(password, row.password_hash)) {
		return res.status(401).json({ ok: false, error: 'Invalid credentials.' });
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

// ----- Courses / enrollment / materials ------------------------------------
function courseRow(c) {
	return { id: c.id, code: c.code, title: c.title, description: c.description, units: c.units, fee: c.fee };
}

app.get('/api/courses', (req, res) => {
	const rows = db.prepare('SELECT * FROM courses ORDER BY code').all();
	return res.json({ ok: true, courses: rows.map(courseRow) });
});

app.get('/api/my/courses', requireAuth, (req, res) => {
	const rows = db
		.prepare(
			`SELECT c.*, e.created_at AS enrolled_at FROM enrollments e
			 JOIN courses c ON c.id = e.course_id
			 WHERE e.user_id = ? ORDER BY c.code`
		)
		.all(req.user.id);
	return res.json({ ok: true, courses: rows.map(courseRow) });
});

app.post('/api/enroll', requireAuth, (req, res) => {
	const courseId = parseInt(req.body.courseId, 10);
	if (!courseId) {
		return res.status(400).json({ ok: false, error: 'A course is required.' });
	}
	const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
	if (!course) {
		return res.status(404).json({ ok: false, error: 'Course not found.' });
	}
	db.prepare('INSERT OR IGNORE INTO enrollments (user_id, course_id) VALUES (?, ?)').run(
		req.user.id,
		courseId
	);
	return res.status(201).json({ ok: true, message: 'Registered for ' + course.code + '.' });
});

app.delete('/api/enroll/:courseId', requireAuth, (req, res) => {
	const courseId = parseInt(req.params.courseId, 10);
	db.prepare('DELETE FROM enrollments WHERE user_id = ? AND course_id = ?').run(req.user.id, courseId);
	return res.json({ ok: true, message: 'Course dropped.' });
});

app.get('/api/my/materials', requireAuth, (req, res) => {
	const rows = db
		.prepare(
			`SELECT m.*, c.code AS course_code, c.title AS course_title FROM materials m
			 JOIN courses c ON c.id = m.course_id
			 JOIN enrollments e ON e.course_id = m.course_id AND e.user_id = ?
			 ORDER BY c.code, m.created_at DESC`
		)
		.all(req.user.id);
	return res.json({ ok: true, materials: rows });
});

// ----- Payments (mock gateway; ready to swap for Paystack/Flutterwave) ------
app.get('/api/my/payments', requireAuth, (req, res) => {
	const rows = db
		.prepare('SELECT id, reference, amount, purpose, status, created_at FROM payments WHERE user_id = ? ORDER BY created_at DESC')
		.all(req.user.id);
	return res.json({ ok: true, payments: rows });
});

app.post('/api/payments/initialize', requireAuth, (req, res) => {
	const amount = parseInt(req.body.amount, 10);
	const purpose = (req.body.purpose || 'Tuition payment').trim();
	if (!amount || amount <= 0) {
		return res.status(400).json({ ok: false, error: 'A valid amount is required.' });
	}
	const reference = 'CCCTS-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
	db.prepare('INSERT INTO payments (user_id, reference, amount, purpose, status) VALUES (?, ?, ?, ?, ?)').run(
		req.user.id,
		reference,
		amount,
		purpose,
		'pending'
	);
	// NOTE: integrate Paystack/Flutterwave init here and return their authorization_url.
	return res.status(201).json({ ok: true, reference, amount, purpose });
});

app.post('/api/payments/verify', requireAuth, (req, res) => {
	const reference = (req.body.reference || '').trim();
	const row = db.prepare('SELECT * FROM payments WHERE reference = ? AND user_id = ?').get(reference, req.user.id);
	if (!row) {
		return res.status(404).json({ ok: false, error: 'Payment reference not found.' });
	}
	// NOTE: verify with the gateway before marking paid in production.
	db.prepare("UPDATE payments SET status = 'paid' WHERE id = ?").run(row.id);
	return res.json({ ok: true, message: 'Payment confirmed.', reference });
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
