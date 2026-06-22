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

	function card(title, inner, widthClass) {
		return '' +
			'<div class="' + (widthClass || 'col-lg-6 col-md-12') + ' m-b30">' +
			'  <div class="widget" style="border:1px solid #eee;border-radius:8px;padding:24px;height:100%;">' +
			'    <h4 class="m-b15">' + esc(title) + '</h4>' + inner +
			'  </div>' +
			'</div>';
	}

	// --------- Student dashboard ---------
	var STUDENT = null;

	function renderStudent(user) {
		STUDENT = user;
		var matriculated = user.applicationStatus === 'matriculated' && user.matricNumber;
		var statusBanner = matriculated
			? '<div class="alert" style="background:#e6f4ea;color:#1e7e34;border-radius:8px;padding:16px;margin-bottom:25px;">' +
				'You are matriculated. Matriculation No: <strong>' + esc(user.matricNumber) + '</strong></div>'
			: '<div class="alert" style="background:#fff4e5;color:#9a6700;border-radius:8px;padding:16px;margin-bottom:25px;">' +
				'Your application is <strong>pending</strong>. Upload all required documents below to be issued a matriculation number.</div>';

		root.innerHTML = headerHtml(user) +
			statusBanner +
			'<div class="row">' +
			card('Profile', '<ul class="list-unstyled">' +
				'<li><strong>Name:</strong> ' + esc(user.name) + '</li>' +
				'<li><strong>Matric No:</strong> ' + esc(user.matricNumber || 'Not yet issued') + '</li>' +
				'<li><strong>Programme:</strong> ' + esc(user.programmeLabel || '—') + (user.programmeYear ? ' (' + esc(user.programmeYear) + ')' : '') + '</li>' +
				'<li><strong>Student type:</strong> ' + esc(user.studentTypeLabel || '—') + '</li>' +
				'<li><strong>Status:</strong> ' + esc(user.applicationStatus) + '</li>' +
				'</ul>') +
			card('Study Mode', '<div id="studyMode">Loading…</div>') +
			'</div>' +
			(matriculated ? '' :
				'<div class="row">' +
				card('Registration Documents', '<div id="documents">Loading documents…</div>', 'col-lg-12') +
				'</div>') +
			'<div class="row">' +
			card('Course Registration', '<div id="courseReg">Loading courses…</div>') +
			card('My Lectures & Materials', '<div id="materials">Loading…</div>') +
			'</div>' +
			'<div class="row">' +
			card('Course Registration Fee', '<div id="payments">Loading…</div>', 'col-lg-12') +
			'</div>';
		bindLogout();
		loadStudyMode();
		if (!matriculated) loadDocuments();
		loadCourses();
		loadMaterials();
		loadRegistration();
	}

	// ----- Documents & matriculation -----
	function loadDocuments() {
		api('GET', '/api/my/documents').then(function (r) {
			var data = r.data;
			var rows = (data.required || []).map(function (d) {
				var status = d.uploaded
					? '<span class="badge badge-success">Uploaded</span>'
					: '<span class="badge badge-warning">Pending</span>';
				var view = d.uploaded && d.doc
					? ' <a href="/api/documents/' + d.doc.id + '/file" target="_blank">View</a>'
					: '';
				return '<tr><td>' + esc(d.label) + '</td><td>' + status + view + '</td>' +
					'<td><input type="file" class="doc-file" data-type="' + d.type + '" style="max-width:170px;display:inline-block;"> ' +
					'<button class="btn btn-sm radius-xl doc-upload" data-type="' + d.type + '">Upload</button></td></tr>';
			}).join('');
			var ready = data.complete;
			document.getElementById('documents').innerHTML =
				'<p class="text-muted">Accepted files: images (JPG/PNG) or PDF, up to 5MB each. A matriculation number is issued once every required document is uploaded.</p>' +
				'<div class="table-responsive"><table class="table table-sm"><thead><tr><th>Document</th><th>Status</th><th>Upload</th></tr></thead><tbody>' +
				rows + '</tbody></table></div>' +
				'<button id="matricBtn" class="btn radius-xl" ' + (ready ? '' : 'disabled style="opacity:.6;cursor:not-allowed;"') + '>' +
				(ready ? 'Request Matriculation Number' : 'Upload all documents to continue') + '</button>';
			bindDocButtons();
		});
	}

	function bindDocButtons() {
		Array.prototype.forEach.call(document.querySelectorAll('.doc-upload'), function (b) {
			b.addEventListener('click', function () {
				var type = b.dataset.type;
				var input = document.querySelector('.doc-file[data-type="' + type + '"]');
				if (!input || !input.files || !input.files[0]) { toast('Please choose a file first.', false); return; }
				var fd = new FormData();
				fd.append('docType', type);
				fd.append('document', input.files[0]);
				b.disabled = true;
				fetch('/api/my/documents', { method: 'POST', credentials: 'same-origin', body: fd })
					.then(function (res) { return res.json(); })
					.then(function (data) {
						toast(data.message || data.error, data.ok);
						loadDocuments();
					})
					.catch(function () { toast('Upload failed. Please try again.', false); b.disabled = false; });
			});
		});
		var mb = document.getElementById('matricBtn');
		if (mb && !mb.disabled) {
			mb.addEventListener('click', function () {
				api('POST', '/api/my/matriculate').then(function (r) {
					toast(r.data.message || r.data.error, r.data.ok);
					if (r.data.ok) { setTimeout(function () { window.location.reload(); }, 1200); }
				});
			});
		}
	}

	// ----- Study mode switch -----
	function loadStudyMode() {
		api('GET', '/api/my/registration').then(function (r) {
			var d = r.data;
			var current = d.studyMode || 'campus';
			var target = current === 'online' ? 'campus' : 'online';
			var targetLabel = target === 'online' ? 'Online' : 'Campus';
			document.getElementById('studyMode').innerHTML =
				'<ul class="list-unstyled">' +
				'<li><strong>Current mode:</strong> ' + esc(d.studyModeLabel || '—') + '</li>' +
				'<li class="text-muted">Switching between Online and Campus attracts a fee of ' + naira(d.modeSwitchFee) + '.</li>' +
				'</ul>' +
				'<button id="switchModeBtn" class="btn btn-sm radius-xl" data-target="' + target + '">Switch to ' + targetLabel + ' (' + naira(d.modeSwitchFee) + ')</button>';
			var btn = document.getElementById('switchModeBtn');
			if (btn) btn.addEventListener('click', function () {
				if (!window.confirm('Switch to ' + targetLabel + ' study? A fee of ' + naira(d.modeSwitchFee) + ' applies.')) return;
				api('POST', '/api/my/switch-mode', { mode: btn.dataset.target }).then(function (rr) {
					toast(rr.data.message || rr.data.error, rr.data.ok);
					if (rr.data.ok) { loadStudyMode(); loadRegistration(); }
				});
			});
		});
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
					'<td>' + c.units + '</td><td>' + btn + '</td></tr>';
			}).join('');
			document.getElementById('courseReg').innerHTML =
				'<p class="text-muted">Select your courses, then pay the single course-registration fee below.</p>' +
				'<table class="table table-sm"><thead><tr><th>Course</th><th>Units</th><th></th></tr></thead><tbody>' +
				rows + '</tbody></table>';
			bindCourseButtons();
		});
	}

	function bindCourseButtons() {
		Array.prototype.forEach.call(document.querySelectorAll('.enroll-btn'), function (b) {
			b.addEventListener('click', function () {
				api('POST', '/api/enroll', { courseId: parseInt(b.dataset.id, 10) }).then(function (r) {
					toast(r.data.message || r.data.error, r.data.ok);
					if (r.data.ok) { loadCourses(); loadMaterials(); loadRegistration(); }
				});
			});
		});
		Array.prototype.forEach.call(document.querySelectorAll('.drop-btn'), function (b) {
			b.addEventListener('click', function () {
				api('DELETE', '/api/enroll/' + parseInt(b.dataset.id, 10)).then(function (r) {
					toast(r.data.message || r.data.error, r.data.ok);
					if (r.data.ok) { loadCourses(); loadMaterials(); loadRegistration(); }
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

	function loadRegistration() {
		Promise.all([api('GET', '/api/my/registration'), api('GET', '/api/my/payments')]).then(function (res) {
			var d = res[0].data;
			var pays = res[1].data.payments || [];
			var fee = d.registrationFee || 0;
			var outstanding = d.outstanding || 0;
			var history = pays.length
				? '<table class="table table-sm m-t15"><thead><tr><th>Reference</th><th>Purpose</th><th>Amount</th><th>Status</th></tr></thead><tbody>' +
					pays.map(function (p) {
						return '<tr><td><small>' + esc(p.reference) + '</small></td><td><small>' + esc(p.purpose || '') + '</small></td><td>' + naira(p.amount) +
							'</td><td><span class="badge badge-' + (p.status === 'paid' ? 'success' : 'warning') + '">' + esc(p.status) + '</span></td></tr>';
					}).join('') + '</tbody></table>'
				: '';
			var action;
			if (outstanding <= 0 && fee > 0) {
				action = '<p class="text-success">Course registration fee settled.</p>';
			} else if ((d.courseCount || 0) === 0) {
				action = '<p class="text-muted">Register at least one course above before paying the registration fee.</p>';
			} else {
				action = '<button id="payBtn" class="btn radius-xl" data-amount="' + outstanding + '">Pay registration fee ' + naira(outstanding) + '</button>';
			}
			document.getElementById('payments').innerHTML =
				'<ul class="list-unstyled">' +
				'<li><strong>Programme:</strong> ' + esc(d.programmeLabel || '—') + '</li>' +
				'<li><strong>Study mode:</strong> ' + esc(d.studyModeLabel || '—') + '</li>' +
				'<li><strong>Courses registered:</strong> ' + (d.courseCount || 0) + '</li>' +
				'<li><strong>Registration fee:</strong> ' + naira(fee) + '</li>' +
				'<li><strong>Paid:</strong> ' + naira(d.paid || 0) + '</li>' +
				'<li><strong>Outstanding:</strong> ' + naira(outstanding) + '</li>' +
				'</ul>' + action + history;
			var payBtn = document.getElementById('payBtn');
			if (payBtn) payBtn.addEventListener('click', function () { startPayment(parseInt(payBtn.dataset.amount, 10)); });
		});
	}

	function startPayment(amount) {
		api('POST', '/api/payments/initialize', { amount: amount, purpose: 'Course registration' }).then(function (r) {
			if (!r.data.ok) { toast(r.data.error || 'Could not start payment.', false); return; }
			// In production this is where the Paystack/Flutterwave checkout opens.
			// For now we confirm the reference to mark it paid.
			api('POST', '/api/payments/verify', { reference: r.data.reference }).then(function (v) {
				toast(v.data.message || v.data.error, v.data.ok);
				loadRegistration();
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
		root.innerHTML = headerHtml(user) +
			'<div class="alert" style="background:#f4f6ff;border-radius:8px;padding:18px;margin-bottom:25px;">' +
			'Welcome, staff member. Publish lecture materials to a course so enrolled students receive them online.</div>' +
			'<div class="row">' +
			card('Publish Lecture Material',
				'<div class="form-group"><label>Course</label>' +
				'<select id="staffCourse" class="form-control"></select></div>' +
				'<div class="form-group"><label>Title</label>' +
				'<input id="matTitle" type="text" class="form-control" placeholder="e.g. Week 1 \u2013 Introduction"></div>' +
				'<div class="form-group"><label>Type</label>' +
				'<select id="matKind" class="form-control">' +
				'<option value="note">Note</option><option value="video">Video</option>' +
				'<option value="slide">Slides</option><option value="link">Link</option></select></div>' +
				'<div class="form-group"><label>Link / URL (optional)</label>' +
				'<input id="matUrl" type="url" class="form-control" placeholder="https://\u2026"></div>' +
				'<button id="addMatBtn" class="btn radius-xl">Publish</button>') +
			card('Materials in this Course', '<div id="staffMaterials">Select a course…</div>') +
			'</div>' +
			'<div class="row">' +
			card('Notices', '<p>Internal announcements for academic staff.</p><a href="blog-classic-sidebar.html" class="btn btn-sm radius-xl">Read Notices</a>') +
			card('Support', '<p>Reach the administration for any assistance.</p><a href="contact-Campus Learning.html" class="btn btn-sm radius-xl">Contact</a>') +
			'</div>';
		bindLogout();
		setupStaffMaterials();
	}

	function setupStaffMaterials() {
		var sel = document.getElementById('staffCourse');
		api('GET', '/api/courses').then(function (r) {
			var courses = r.data.courses || [];
			sel.innerHTML = courses.map(function (c) {
				return '<option value="' + c.id + '">' + esc(c.code) + ' \u2013 ' + esc(c.title) + '</option>';
			}).join('');
			loadStaffMaterials();
		});
		sel.addEventListener('change', loadStaffMaterials);
		document.getElementById('addMatBtn').addEventListener('click', function () {
			var courseId = sel.value;
			var body = {
				title: document.getElementById('matTitle').value.trim(),
				kind: document.getElementById('matKind').value,
				url: document.getElementById('matUrl').value.trim(),
			};
			if (!body.title) { toast('Please enter a title.', false); return; }
			api('POST', '/api/courses/' + courseId + '/materials', body).then(function (r) {
				toast(r.data.message || r.data.error, r.data.ok);
				if (r.data.ok) {
					document.getElementById('matTitle').value = '';
					document.getElementById('matUrl').value = '';
					loadStaffMaterials();
				}
			});
		});
	}

	function loadStaffMaterials() {
		var courseId = document.getElementById('staffCourse').value;
		api('GET', '/api/courses/' + courseId + '/materials').then(function (r) {
			var mats = r.data.materials || [];
			var box = document.getElementById('staffMaterials');
			if (!mats.length) { box.innerHTML = '<p class="text-muted">No materials yet for this course.</p>'; return; }
			box.innerHTML = '<ul class="list-unstyled">' + mats.map(function (m) {
				var link = m.url ? '<a href="' + esc(m.url) + '" target="_blank">' + esc(m.title) + '</a>' : esc(m.title);
				return '<li class="m-b10"><i class="fa fa-' + (m.kind === 'video' ? 'play-circle' : 'file-text-o') + ' text-primary"></i> ' +
					link + ' <small class="text-muted">(' + esc(m.kind) + ')</small> ' +
					'<button class="btn btn-sm radius-xl outline del-mat" data-id="' + m.id + '" style="padding:2px 10px;">Remove</button></li>';
			}).join('') + '</ul>';
			Array.prototype.forEach.call(box.querySelectorAll('.del-mat'), function (b) {
				b.addEventListener('click', function () {
					api('DELETE', '/api/materials/' + b.dataset.id).then(function (r) {
						toast(r.data.message || r.data.error, r.data.ok);
						loadStaffMaterials();
					});
				});
			});
		});
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
