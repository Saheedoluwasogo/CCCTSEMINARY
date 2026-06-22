// Role-aware portal dashboard for CCCTSeminary.
(function () {
	'use strict';

	var root = document.getElementById('dashboardRoot');
	if (!root) return;

	function api(method, url, body) {
		var opts = {
			method: method,
			headers: { 'Content-Type': 'application/json' },
			credentials: 'same-origin',
		};
		if (body) opts.body = JSON.stringify(body);
		return fetch(url, opts).then(function (res) {
			return res.json().then(function (data) { return { status: res.status, data: data }; });
		});
	}

	function esc(s) {
		return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
			return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
		});
	}

	function naira(n) {
		return '\u20A6' + Number(n || 0).toLocaleString('en-NG');
	}

	function toast(msg, ok) {
		var bar = document.getElementById('dashToast');
		if (!bar) {
			bar = document.createElement('div');
			bar.id = 'dashToast';
			bar.style.position = 'fixed';
			bar.style.top = '20px';
			bar.style.right = '20px';
			bar.style.zIndex = '9999';
			bar.style.padding = '12px 18px';
			bar.style.borderRadius = '4px';
			bar.style.fontWeight = '600';
			bar.style.boxShadow = '0 4px 18px rgba(0,0,0,0.2)';
			document.body.appendChild(bar);
		}
		bar.textContent = msg;
		bar.style.background = ok ? '#1e7e34' : '#b02a37';
		bar.style.color = '#fff';
		bar.style.display = 'block';
		clearTimeout(bar._t);
		bar._t = setTimeout(function () { bar.style.display = 'none'; }, 3500);
	}

	function logout() {
		api('POST', '/api/logout').then(function () { window.location.href = 'index.html'; });
	}

	function headerHtml(user) {
		return '' +
			'<div class="row align-items-center m-b30">' +
			'  <div class="col-md-8">' +
			'    <h3 class="m-b5">Welcome, ' + esc(user.name) + '</h3>' +
			'    <span class="badge badge-primary" style="font-size:14px;padding:6px 12px;">' + esc(user.roleLabel) + '</span> ' +
			(user.matricNumber ? '<span class="text-muted"> &nbsp;Matric No: <strong>' + esc(user.matricNumber) + '</strong></span>' : '') +
			(user.email ? '<span class="text-muted"> &nbsp;' + esc(user.email) + '</span>' : '') +
			'  </div>' +
			'  <div class="col-md-4 text-md-right">' +
			'    <button id="logoutBtn" class="btn radius-xl">Log Out</button>' +
			'  </div>' +
			'</div>';
	}

	function card(title, inner) {
		return '' +
			'<div class="col-lg-6 col-md-12 m-b30">' +
			'  <div class="widget" style="border:1px solid #eee;border-radius:8px;padding:24px;height:100%;">' +
			'    <h4 class="m-b15">' + esc(title) + '</h4>' + inner +
			'  </div>' +
			'</div>';
	}

	// --------- Student dashboard ---------
	function renderStudent(user) {
		root.innerHTML = headerHtml(user) +
			'<div class="row">' +
			card('Course Registration', '<div id="courseReg">Loading courses…</div>') +
			card('My Lectures &amp; Materials', '<div id="materials">Loading…</div>') +
			'</div>' +
			'<div class="row">' +
			card('Fees &amp; Payments', '<div id="payments">Loading…</div>') +
			card('Profile', '<ul class="list-unstyled">' +
				'<li><strong>Name:</strong> ' + esc(user.name) + '</li>' +
				'<li><strong>Matric No:</strong> ' + esc(user.matricNumber || '—') + '</li>' +
				'<li><strong>Programme:</strong> Diploma in Theology</li>' +
				'</ul>') +
			'</div>';
		bindLogout();
		loadCourses();
		loadMaterials();
		loadPayments();
	}

	function loadCourses() {
		Promise.all([api('GET', '/api/courses'), api('GET', '/api/my/courses')]).then(function (res) {
			var all = res[0].data.courses || [];
			var mine = res[1].data.courses || [];
			var mineIds = {};
			mine.forEach(function (c) { mineIds[c.id] = true; });
			var rows = all.map(function (c) {
				var enrolled = mineIds[c.id];
				var btn = enrolled
					? '<button class="btn btn-sm radius-xl outline drop-btn" data-id="' + c.id + '">Drop</button>'
					: '<button class="btn btn-sm radius-xl enroll-btn" data-id="' + c.id + '">Register</button>';
				return '<tr><td><strong>' + esc(c.code) + '</strong><br><small>' + esc(c.title) + '</small></td>' +
					'<td>' + c.units + '</td><td>' + naira(c.fee) + '</td><td>' + btn + '</td></tr>';
			}).join('');
			document.getElementById('courseReg').innerHTML =
				'<table class="table table-sm"><thead><tr><th>Course</th><th>Units</th><th>Fee</th><th></th></tr></thead><tbody>' +
				rows + '</tbody></table>';
			bindCourseButtons();
		});
	}

	function bindCourseButtons() {
		Array.prototype.forEach.call(document.querySelectorAll('.enroll-btn'), function (b) {
			b.addEventListener('click', function () {
				api('POST', '/api/enroll', { courseId: parseInt(b.dataset.id, 10) }).then(function (r) {
					toast(r.data.message || r.data.error, r.data.ok);
					if (r.data.ok) { loadCourses(); loadMaterials(); loadPayments(); }
				});
			});
		});
		Array.prototype.forEach.call(document.querySelectorAll('.drop-btn'), function (b) {
			b.addEventListener('click', function () {
				api('DELETE', '/api/enroll/' + parseInt(b.dataset.id, 10)).then(function (r) {
					toast(r.data.message || r.data.error, r.data.ok);
					if (r.data.ok) { loadCourses(); loadMaterials(); loadPayments(); }
				});
			});
		});
	}

	function loadMaterials() {
		api('GET', '/api/my/materials').then(function (r) {
			var mats = r.data.materials || [];
			if (!mats.length) {
				document.getElementById('materials').innerHTML =
					'<p class="text-muted">No lecture materials yet. Register for a course to receive its lectures and notes here.</p>';
				return;
			}
			document.getElementById('materials').innerHTML = '<ul class="list-unstyled">' + mats.map(function (m) {
				var link = m.url ? '<a href="' + esc(m.url) + '" target="_blank">' + esc(m.title) + '</a>' : esc(m.title);
				return '<li class="m-b10"><i class="fa fa-' + (m.kind === 'video' ? 'play-circle' : 'file-text-o') + ' text-primary"></i> ' +
					link + ' <small class="text-muted">(' + esc(m.course_code) + ')</small></li>';
			}).join('') + '</ul>';
		});
	}

	function loadPayments() {
		Promise.all([api('GET', '/api/my/courses'), api('GET', '/api/my/payments')]).then(function (res) {
			var mine = res[0].data.courses || [];
			var pays = res[1].data.payments || [];
			var due = mine.reduce(function (s, c) { return s + (c.fee || 0); }, 0);
			var paid = pays.filter(function (p) { return p.status === 'paid'; })
				.reduce(function (s, p) { return s + (p.amount || 0); }, 0);
			var outstanding = Math.max(due - paid, 0);
			var history = pays.length
				? '<table class="table table-sm m-t15"><thead><tr><th>Reference</th><th>Amount</th><th>Status</th></tr></thead><tbody>' +
					pays.map(function (p) {
						return '<tr><td><small>' + esc(p.reference) + '</small></td><td>' + naira(p.amount) +
							'</td><td><span class="badge badge-' + (p.status === 'paid' ? 'success' : 'warning') + '">' + esc(p.status) + '</span></td></tr>';
					}).join('') + '</tbody></table>'
				: '';
			document.getElementById('payments').innerHTML =
				'<ul class="list-unstyled">' +
				'<li><strong>Total fees:</strong> ' + naira(due) + '</li>' +
				'<li><strong>Paid:</strong> ' + naira(paid) + '</li>' +
				'<li><strong>Outstanding:</strong> ' + naira(outstanding) + '</li>' +
				'</ul>' +
				(outstanding > 0
					? '<button id="payBtn" class="btn radius-xl" data-amount="' + outstanding + '">Pay ' + naira(outstanding) + '</button>'
					: '<p class="text-success">All fees settled.</p>') +
				history;
			var payBtn = document.getElementById('payBtn');
			if (payBtn) payBtn.addEventListener('click', function () { startPayment(parseInt(payBtn.dataset.amount, 10)); });
		});
	}

	function startPayment(amount) {
		api('POST', '/api/payments/initialize', { amount: amount, purpose: 'Tuition fees' }).then(function (r) {
			if (!r.data.ok) { toast(r.data.error || 'Could not start payment.', false); return; }
			// In production this is where the Paystack/Flutterwave checkout opens.
			// For now we confirm the reference to mark it paid.
			api('POST', '/api/payments/verify', { reference: r.data.reference }).then(function (v) {
				toast(v.data.message || v.data.error, v.data.ok);
				loadPayments();
			});
		});
	}

	// --------- Simple role dashboards ---------
	function renderSimple(user, intro, items) {
		var list = items.map(function (it) {
			return card(it.title, '<p>' + esc(it.text) + '</p>' +
				(it.link ? '<a href="' + esc(it.link) + '" class="btn btn-sm radius-xl">' + esc(it.cta || 'Open') + '</a>' : ''));
		}).join('');
		root.innerHTML = headerHtml(user) +
			'<div class="alert" style="background:#f4f6ff;border-radius:8px;padding:18px;margin-bottom:25px;">' + esc(intro) + '</div>' +
			'<div class="row">' + list + '</div>';
		bindLogout();
	}

	function renderAlumni(user) {
		renderSimple(user, 'Welcome back to the CCCTS alumni family. Stay connected and keep growing in faith and fellowship.', [
			{ title: 'Alumni News', text: 'Read the latest updates and testimonies from fellow graduates.', link: 'blog-classic-sidebar.html', cta: 'Read News' },
			{ title: 'Upcoming Events', text: 'Reunions, conventions and special services for alumni.', link: 'event.html', cta: 'View Events' },
			{ title: 'Give Back', text: 'Support the seminary through donations and mentorship.', link: 'contact-Campus Learning.html', cta: 'Contact Us' },
			{ title: 'Update Records', text: 'Keep your contact and ministry details current.', link: 'contact-Campus Learning.html', cta: 'Update' },
		]);
	}

	function renderStaff(user) {
		renderSimple(user, 'Welcome, staff member. Manage your teaching resources and seminary notices here.', [
			{ title: 'Course Materials', text: 'Browse the courses offered and their outlines.', link: 'courses.html', cta: 'View Courses' },
			{ title: 'Academic Calendar', text: 'Key dates, lectures and examination schedules.', link: 'events-details.html', cta: 'View Calendar' },
			{ title: 'Notices', text: 'Internal announcements for academic staff.', link: 'blog-classic-sidebar.html', cta: 'Read Notices' },
			{ title: 'Support', text: 'Reach the administration for any assistance.', link: 'contact-Campus Learning.html', cta: 'Contact' },
		]);
	}

	function renderNonStaff(user) {
		renderSimple(user, 'Welcome. Access support services and internal notices for non-academic personnel.', [
			{ title: 'Service Requests', text: 'Submit administrative or facility requests.', link: 'contact-Campus Learning.html', cta: 'Make a Request' },
			{ title: 'Notices', text: 'General staff announcements and circulars.', link: 'blog-classic-sidebar.html', cta: 'Read Notices' },
			{ title: 'Events', text: 'Seminary events and gatherings.', link: 'event.html', cta: 'View Events' },
		]);
	}

	function renderGeneral(user) {
		renderSimple(user, 'Welcome to the Celestial Church of Christ Theological Seminary community portal.', [
			{ title: 'Announcements', text: 'Latest news from the seminary and CCC worldwide.', link: 'blog-classic-sidebar.html', cta: 'Read More' },
			{ title: 'Courses', text: 'Explore the programmes offered on campus and online.', link: 'courses.html', cta: 'View Courses' },
			{ title: 'Events', text: 'Upcoming services, conventions and ceremonies.', link: 'event.html', cta: 'View Events' },
			{ title: 'Become a Student', text: 'Ready to enrol? Register on the students portal.', link: 'register.html?portal=student', cta: 'Apply' },
		]);
	}

	function bindLogout() {
		var b = document.getElementById('logoutBtn');
		if (b) b.addEventListener('click', logout);
	}

	// --------- Boot ---------
	api('GET', '/api/me').then(function (r) {
		var user = r.data && r.data.user;
		if (!user) { window.location.href = 'login.html'; return; }
		switch (user.role) {
			case 'student': renderStudent(user); break;
			case 'alumni': renderAlumni(user); break;
			case 'staff': renderStaff(user); break;
			case 'non_staff': renderNonStaff(user); break;
			default: renderGeneral(user);
		}
	}).catch(function () {
		root.innerHTML = '<p class="text-center text-danger">Could not load your dashboard. Please <a href="login.html">sign in</a> again.</p>';
	});
})();
