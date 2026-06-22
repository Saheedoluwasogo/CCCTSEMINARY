'use strict';

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR
	? path.resolve(process.env.DATA_DIR)
	: path.join(__dirname, 'data');

if (!fs.existsSync(DATA_DIR)) {
	fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'ccctseminary.db'));
db.pragma('journal_mode = WAL');

db.exec(`
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		email TEXT UNIQUE COLLATE NOCASE,
		password_hash TEXT NOT NULL,
		role TEXT NOT NULL DEFAULT 'all_users',
		matric_number TEXT UNIQUE COLLATE NOCASE,
		study_mode TEXT,
		programme TEXT,
		student_type TEXT,
		application_status TEXT NOT NULL DEFAULT 'matriculated',
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);

	CREATE TABLE IF NOT EXISTS documents (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		doc_type TEXT NOT NULL,
		filename TEXT NOT NULL,
		original_name TEXT,
		created_at TEXT NOT NULL DEFAULT (datetime('now')),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);

	CREATE TABLE IF NOT EXISTS messages (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		email TEXT NOT NULL,
		phone TEXT,
		subject TEXT,
		message TEXT NOT NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);

	CREATE TABLE IF NOT EXISTS subscriptions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		email TEXT NOT NULL UNIQUE COLLATE NOCASE,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);

	CREATE TABLE IF NOT EXISTS courses (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		code TEXT NOT NULL UNIQUE COLLATE NOCASE,
		title TEXT NOT NULL,
		description TEXT,
		units INTEGER NOT NULL DEFAULT 3,
		fee INTEGER NOT NULL DEFAULT 0,
		created_at TEXT NOT NULL DEFAULT (datetime('now'))
	);

	CREATE TABLE IF NOT EXISTS enrollments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		course_id INTEGER NOT NULL,
		created_at TEXT NOT NULL DEFAULT (datetime('now')),
		UNIQUE (user_id, course_id),
		FOREIGN KEY (user_id) REFERENCES users(id),
		FOREIGN KEY (course_id) REFERENCES courses(id)
	);

	CREATE TABLE IF NOT EXISTS materials (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		course_id INTEGER NOT NULL,
		title TEXT NOT NULL,
		kind TEXT NOT NULL DEFAULT 'note',
		url TEXT,
		created_at TEXT NOT NULL DEFAULT (datetime('now')),
		FOREIGN KEY (course_id) REFERENCES courses(id)
	);

	CREATE TABLE IF NOT EXISTS payments (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		reference TEXT NOT NULL UNIQUE,
		amount INTEGER NOT NULL,
		purpose TEXT,
		status TEXT NOT NULL DEFAULT 'pending',
		created_at TEXT NOT NULL DEFAULT (datetime('now')),
		FOREIGN KEY (user_id) REFERENCES users(id)
	);
`);

// ----- Lightweight migrations for pre-existing databases --------------------
function userColumns() {
	return db.prepare('PRAGMA table_info(users)').all();
}

let cols = userColumns();
const colNames = cols.map(function (c) { return c.name; });

if (colNames.indexOf('role') === -1) {
	db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'all_users'");
}
if (colNames.indexOf('matric_number') === -1) {
	db.exec('ALTER TABLE users ADD COLUMN matric_number TEXT');
}
if (colNames.indexOf('study_mode') === -1) {
	db.exec('ALTER TABLE users ADD COLUMN study_mode TEXT');
}
if (colNames.indexOf('programme') === -1) {
	db.exec('ALTER TABLE users ADD COLUMN programme TEXT');
}
if (colNames.indexOf('student_type') === -1) {
	db.exec('ALTER TABLE users ADD COLUMN student_type TEXT');
}
if (colNames.indexOf('application_status') === -1) {
	db.exec("ALTER TABLE users ADD COLUMN application_status TEXT NOT NULL DEFAULT 'matriculated'");
	// Existing students keep their matriculated status; nothing else to backfill.
}

// Older databases created email as NOT NULL, which blocks matric-only students.
// Rebuild the table so email is nullable while preserving existing rows.
cols = userColumns();
const emailCol = cols.find(function (c) { return c.name === 'email'; });
if (emailCol && emailCol.notnull === 1) {
	db.exec('PRAGMA foreign_keys=off');
	const rebuild = db.transaction(function () {
		db.exec(`
			CREATE TABLE users_new (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				name TEXT NOT NULL,
				email TEXT UNIQUE COLLATE NOCASE,
				password_hash TEXT NOT NULL,
				role TEXT NOT NULL DEFAULT 'all_users',
				matric_number TEXT UNIQUE COLLATE NOCASE,
				study_mode TEXT,
				programme TEXT,
				student_type TEXT,
				application_status TEXT NOT NULL DEFAULT 'matriculated',
				created_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
			INSERT INTO users_new (id, name, email, password_hash, role, matric_number, study_mode, programme, student_type, application_status, created_at)
				SELECT id, name, email, password_hash, COALESCE(role, 'all_users'), matric_number, study_mode, programme, student_type, COALESCE(application_status, 'matriculated'), created_at FROM users;
			DROP TABLE users;
			ALTER TABLE users_new RENAME TO users;
		`);
	});
	rebuild();
	db.exec('PRAGMA foreign_keys=on');
}

db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_matric ON users(matric_number)');

// ----- Seed a few foundational courses (idempotent) -------------------------
const courseCount = db.prepare('SELECT COUNT(*) AS n FROM courses').get().n;
if (courseCount === 0) {
	const insert = db.prepare(
		'INSERT INTO courses (code, title, description, units, fee) VALUES (?, ?, ?, ?, ?)'
	);
	const seed = db.transaction(function (rows) {
		rows.forEach(function (r) { insert.run(r[0], r[1], r[2], r[3], r[4]); });
	});
	seed([
		['CMT113', 'Biblical Foundation', 'Foundational study of the Scriptures and biblical history.', 3, 15000],
		['HDS111', 'Communication Skills', 'Effective communication for ministry and study.', 2, 10000],
		['MIS111', 'Contemporary Issues in Mission', 'Modern missions, evangelism and outreach.', 3, 15000],
		['CMT119', 'Doctrine / Liturgy (Service in CCC)', 'Doctrine and order of service in the Celestial Church of Christ.', 3, 15000],
	]);
}

module.exports = db;
