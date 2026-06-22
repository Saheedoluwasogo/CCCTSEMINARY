'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

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
	all_users: 'Visitor',
	admin: 'Administrator',
};

// Study programmes, ordered from entry level upward. `fee` is the single
// course-registration fee charged once the student submits their courses.
const PROGRAMMES = {
	certificate: { label: 'Certificate in Theology', year: 'Year 1', code: 'CERT', fee: 20000 },
	diploma: { label: 'Diploma in Theology', year: 'Year 2', code: 'DIP', fee: 30000 },
	bachelor: { label: 'Bachelor in Theology', year: 'Year 3', code: 'BTH', fee: 50000 },
	masters: { label: 'Masters in Theology', year: 'Masters', code: 'MTH', fee: 80000 },
	phd: { label: 'PhD in Theology', year: 'Doctorate', code: 'PHD', fee: 120000 },
};

const STUDY_MODES = { online: 'Online', campus: 'Campus' };
const STUDENT_TYPES = { new: 'New Student', returning: 'Returning Student' };
const MODE_SWITCH_FEE = 5000;

// Documents a new student must submit before a matriculation number is issued.
const REQUIRED_DOCS = {
	passport_photo: 'Passport Photograph',
	medical_fitness: 'Medical Fitness Result',
	baptismal_certificate: 'Baptismal Certificate',
	anointment_certificate: 'Anointment Certificate',
	recommendation_letter: 'Letter of Recommendation',
	educational_certificate: 'Educational Certificate(s)',
};
const DOC_TYPES = Object.assign({ other: 'Other Document' }, REQUIRED_DOCS);

// ----- File uploads (student documents) ------------------------------------
const UPLOAD_DIR = process.env.UPLOAD_DIR
	? path.resolve(process.env.UPLOAD_DIR)
	: path.join(__dirname, 'data', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
	destination: function (req, file, cb) {
		const dir = path.join(UPLOAD_DIR, String(req.user.id));
		fs.mkdirSync(dir, { recursive: true });
		cb(null, dir);
	},
	filename: function (req, file, cb) {
		const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-60);
		cb(null, Date.now() + '-' + safe);
	},
});
const upload = multer({
	storage: storage,
	limits: { fileSize: 5 * 1024 * 1024 },
	fileFilter: function (req, file, cb) {
		const ok = /^(image\/(jpeg|png|gif|webp)|application\/pdf)$/.test(file.mimetype);
		cb(ok ? null : new Error('Only image or PDF files are allowed.'), ok);
	},
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ----- Helpers -------------------------------------------------------------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicUser(row) {
	const prog = PROGRAMMES[row.programme];
	return {
		id: row.id,
		name: row.name,
		email: row.email,
		role: row.role,
		roleLabel: ROLE_LABELS[row.role] || 'Visitor',
		matricNumber: row.matric_number,
		studyMode: row.study_mode,
		studyModeLabel: STUDY_MODES[row.study_mode] || null,
		programme: row.programme,
		programmeLabel: prog ? prog.label : null,
		programmeYear: prog ? prog.year : null,
		registrationFee: prog ? prog.fee : 0,
		studentType: row.student_type,
		studentTypeLabel: STUDENT_TYPES[row.student_type] || null,
		applicationStatus: row.application_status,
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

function requireRole() {
	const allowed = Array.prototype.slice.call(arguments);
	return function (req, res, next) {
		const user = currentUser(req);
		if (!user) {
			return res.status(401).json({ ok: false, error: 'Please sign in to continue.' });
		}
		if (allowed.indexOf(user.role) === -1) {
			return res.status(403).json({ ok: false, error: 'You do not have permission to do that.' });
		}
		req.user = user;
		next();
	};
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
		const programme = (req.body.programme || '').trim();
		let studyMode = (req.body.studyMode || req.body.study_mode || 'campus').trim();
		let studentType = (req.body.studentType || req.body.student_type || 'new').trim();
		if (!PROGRAMMES[programme]) {
			return res.status(400).json({ ok: false, error: 'Please choose a valid programme.' });
		}
		if (!STUDY_MODES[studyMode]) studyMode = 'campus';
		if (!STUDENT_TYPES[studentType]) studentType = 'new';

		// Returning students already hold a matriculation number; new students
		// must apply with an email and earn a matric number after uploading
		// their documents.
		if (studentType === 'returning') {
			if (!matric) {
				return res.status(400).json({ ok: false, error: 'Returning students must enter their matriculation number.' });
			}
			if (db.prepare('SELECT id FROM users WHERE matric_number = ?').get(matric)) {
				return res.status(409).json({ ok: false, error: 'An account with this matriculation number already exists. Please sign in instead.' });
			}
			if (email && db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
				return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
			}
			const info = db
				.prepare("INSERT INTO users (name, email, password_hash, role, matric_number, study_mode, programme, student_type, application_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'matriculated')")
				.run(name, email || null, passwordHash, role, matric, studyMode, programme, studentType);
			const user = publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid));
			setAuthCookie(res, user);
			return res.status(201).json({ ok: true, user });
		}

		// New student application.
		if (!email) {
			return res.status(400).json({ ok: false, error: 'New students must register with an email address.' });
		}
		if (!EMAIL_RE.test(email)) {
			return res.status(400).json({ ok: false, error: 'Please enter a valid email address.' });
		}
		if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
			return res.status(409).json({ ok: false, error: 'An account with this email already exists.' });
		}
		const info = db
			.prepare("INSERT INTO users (name, email, password_hash, role, study_mode, programme, student_type, application_status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')")
			.run(name, email, passwordHash, role, studyMode, programme, studentType);
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

// Staff/admin: manage a course's lecture materials.
const MATERIAL_KINDS = ['note', 'video', 'slide', 'link'];

app.get('/api/courses/:courseId/materials', requireRole('staff', 'admin'), (req, res) => {
	const courseId = parseInt(req.params.courseId, 10);
	const rows = db
		.prepare('SELECT id, course_id, title, kind, url, created_at FROM materials WHERE course_id = ? ORDER BY created_at DESC')
		.all(courseId);
	return res.json({ ok: true, materials: rows });
});

app.post('/api/courses/:courseId/materials', requireRole('staff', 'admin'), (req, res) => {
	const courseId = parseInt(req.params.courseId, 10);
	const title = (req.body.title || '').trim();
	let kind = (req.body.kind || 'note').trim();
	const url = (req.body.url || '').trim();
	if (MATERIAL_KINDS.indexOf(kind) === -1) kind = 'note';
	if (!db.prepare('SELECT id FROM courses WHERE id = ?').get(courseId)) {
		return res.status(404).json({ ok: false, error: 'Course not found.' });
	}
	if (!title) {
		return res.status(400).json({ ok: false, error: 'A material title is required.' });
	}
	const info = db
		.prepare('INSERT INTO materials (course_id, title, kind, url) VALUES (?, ?, ?, ?)')
		.run(courseId, title, kind, url || null);
	return res.status(201).json({ ok: true, message: 'Material added.', id: info.lastInsertRowid });
});

app.delete('/api/materials/:id', requireRole('staff', 'admin'), (req, res) => {
	const id = parseInt(req.params.id, 10);
	db.prepare('DELETE FROM materials WHERE id = ?').run(id);
	return res.json({ ok: true, message: 'Material removed.' });
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

// ----- Reference data for the front-end ------------------------------------
app.get('/api/meta', (req, res) => {
	const programmes = Object.keys(PROGRAMMES).map(function (key) {
		const p = PROGRAMMES[key];
		return { key: key, label: p.label, year: p.year, fee: p.fee };
	});
	const studyModes = Object.keys(STUDY_MODES).map(function (k) { return { key: k, label: STUDY_MODES[k] }; });
	const studentTypes = Object.keys(STUDENT_TYPES).map(function (k) { return { key: k, label: STUDENT_TYPES[k] }; });
	const requiredDocs = Object.keys(REQUIRED_DOCS).map(function (k) { return { key: k, label: REQUIRED_DOCS[k] }; });
	return res.json({ ok: true, programmes, studyModes, studentTypes, requiredDocs, modeSwitchFee: MODE_SWITCH_FEE });
});

// ----- Student documents & matriculation -----------------------------------
function documentStatus(userId) {
	const rows = db.prepare('SELECT id, doc_type, original_name, created_at FROM documents WHERE user_id = ? ORDER BY created_at DESC').all(userId);
	const byType = {};
	rows.forEach(function (r) { if (!byType[r.doc_type]) byType[r.doc_type] = r; });
	const required = Object.keys(REQUIRED_DOCS).map(function (key) {
		return { type: key, label: REQUIRED_DOCS[key], uploaded: !!byType[key], doc: byType[key] || null };
	});
	const others = rows.filter(function (r) { return !REQUIRED_DOCS[r.doc_type]; });
	const complete = required.every(function (d) { return d.uploaded; });
	return { required: required, others: others, complete: complete };
}

app.get('/api/my/documents', requireAuth, (req, res) => {
	const status = documentStatus(req.user.id);
	return res.json({
		ok: true,
		required: status.required,
		others: status.others,
		complete: status.complete,
		applicationStatus: req.user.applicationStatus,
		matricNumber: req.user.matricNumber,
	});
});

app.post('/api/my/documents', requireAuth, (req, res) => {
	upload.single('document')(req, res, function (err) {
		if (err) {
			return res.status(400).json({ ok: false, error: err.message || 'Upload failed.' });
		}
		if (!req.file) {
			return res.status(400).json({ ok: false, error: 'Please choose a file to upload.' });
		}
		let docType = (req.body.docType || req.body.doc_type || '').trim();
		if (!DOC_TYPES[docType]) docType = 'other';
		// Replace any existing document of the same (required) type.
		if (docType !== 'other') {
			const existing = db.prepare('SELECT * FROM documents WHERE user_id = ? AND doc_type = ?').all(req.user.id, docType);
			existing.forEach(function (d) {
				try { fs.unlinkSync(path.join(UPLOAD_DIR, String(req.user.id), d.filename)); } catch (e) { /* ignore */ }
				db.prepare('DELETE FROM documents WHERE id = ?').run(d.id);
			});
		}
		db.prepare('INSERT INTO documents (user_id, doc_type, filename, original_name) VALUES (?, ?, ?, ?)')
			.run(req.user.id, docType, req.file.filename, req.file.originalname);
		return res.status(201).json({ ok: true, message: DOC_TYPES[docType] + ' uploaded.' });
	});
});

app.delete('/api/my/documents/:id', requireAuth, (req, res) => {
	const id = parseInt(req.params.id, 10);
	const doc = db.prepare('SELECT * FROM documents WHERE id = ? AND user_id = ?').get(id, req.user.id);
	if (!doc) return res.status(404).json({ ok: false, error: 'Document not found.' });
	try { fs.unlinkSync(path.join(UPLOAD_DIR, String(req.user.id), doc.filename)); } catch (e) { /* ignore */ }
	db.prepare('DELETE FROM documents WHERE id = ?').run(id);
	return res.json({ ok: true, message: 'Document removed.' });
});

app.get('/api/documents/:id/file', requireAuth, (req, res) => {
	const id = parseInt(req.params.id, 10);
	const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
	if (!doc) return res.status(404).json({ ok: false, error: 'Document not found.' });
	const isOwner = doc.user_id === req.user.id;
	const isReviewer = req.user.role === 'staff' || req.user.role === 'admin';
	if (!isOwner && !isReviewer) {
		return res.status(403).json({ ok: false, error: 'You do not have permission to view this document.' });
	}
	return res.sendFile(path.join(UPLOAD_DIR, String(doc.user_id), doc.filename));
});

function issueMatric(programmeKey) {
	const prog = PROGRAMMES[programmeKey] || { code: 'GEN' };
	const year = new Date().getFullYear();
	const count = db.prepare("SELECT COUNT(*) AS n FROM users WHERE matric_number IS NOT NULL").get().n;
	const seq = String(count + 1).padStart(4, '0');
	return 'CCCTS/' + prog.code + '/' + year + '/' + seq;
}

app.post('/api/my/matriculate', requireRole('student'), (req, res) => {
	if (req.user.applicationStatus === 'matriculated' && req.user.matricNumber) {
		return res.json({ ok: true, message: 'You are already matriculated.', matricNumber: req.user.matricNumber });
	}
	const status = documentStatus(req.user.id);
	if (!status.complete) {
		return res.status(400).json({ ok: false, error: 'Please upload all required documents before requesting a matriculation number.' });
	}
	let matric;
	for (let i = 0; i < 5; i++) {
		matric = issueMatric(req.user.programme);
		if (!db.prepare('SELECT id FROM users WHERE matric_number = ?').get(matric)) break;
		matric = matric + '-' + Math.floor(Math.random() * 90 + 10);
	}
	db.prepare("UPDATE users SET matric_number = ?, application_status = 'matriculated' WHERE id = ?").run(matric, req.user.id);
	return res.json({ ok: true, message: 'Congratulations! Your matriculation number has been issued.', matricNumber: matric });
});

// ----- Course registration fee & study-mode switch -------------------------
app.get('/api/my/registration', requireAuth, (req, res) => {
	const fee = req.user.registrationFee || 0;
	const courses = db
		.prepare(`SELECT c.* FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.user_id = ? ORDER BY c.code`)
		.all(req.user.id);
	const paid = db
		.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM payments WHERE user_id = ? AND purpose = 'Course registration' AND status = 'paid'")
		.get(req.user.id).n;
	return res.json({
		ok: true,
		programme: req.user.programme,
		programmeLabel: req.user.programmeLabel,
		studyMode: req.user.studyMode,
		studyModeLabel: req.user.studyModeLabel,
		registrationFee: fee,
		paid: paid,
		outstanding: Math.max(fee - paid, 0),
		courseCount: courses.length,
		modeSwitchFee: MODE_SWITCH_FEE,
	});
});

app.post('/api/my/switch-mode', requireRole('student'), (req, res) => {
	const target = (req.body.mode || '').trim();
	if (!STUDY_MODES[target]) {
		return res.status(400).json({ ok: false, error: 'Please choose a valid study mode.' });
	}
	if (target === req.user.studyMode) {
		return res.status(400).json({ ok: false, error: 'You are already studying ' + STUDY_MODES[target] + '.' });
	}
	// Mock the switch fee payment (this is the seam for the real gateway).
	const reference = 'CCCTS-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
	db.prepare("INSERT INTO payments (user_id, reference, amount, purpose, status) VALUES (?, ?, ?, 'Study mode switch fee', 'paid')")
		.run(req.user.id, reference, MODE_SWITCH_FEE);
	db.prepare('UPDATE users SET study_mode = ? WHERE id = ?').run(target, req.user.id);
	return res.json({ ok: true, message: 'You are now a ' + STUDY_MODES[target] + ' student.', studyMode: target, reference: reference });
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
