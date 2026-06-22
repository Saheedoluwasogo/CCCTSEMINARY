// Front-end wiring for the CCCTSeminary backend (contact form, register, login).
// Talks to the Express server on the same origin via JSON + cookies.
(function () {
	'use strict';

	function postJSON(url, data) {
		return fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'same-origin',
			body: JSON.stringify(data),
		}).then(function (res) {
			return res.json().then(function (body) {
				return { status: res.status, body: body };
			});
		});
	}

	function ensureMessageBox(form) {
		var box = form.querySelector('.ccc-form-message');
		if (!box) {
			box = document.createElement('div');
			box.className = 'ccc-form-message';
			box.style.margin = '10px 0';
			box.style.display = 'none';
			form.insertBefore(box, form.firstChild);
		}
		return box;
	}

	function showMessage(form, text, type) {
		var box = ensureMessageBox(form);
		box.textContent = text;
		box.style.display = 'block';
		box.style.padding = '10px 15px';
		box.style.borderRadius = '4px';
		box.style.fontWeight = '500';
		if (type === 'success') {
			box.style.background = '#e6f4ea';
			box.style.color = '#1e7e34';
			box.style.border = '1px solid #c3e6cb';
		} else {
			box.style.background = '#fdecea';
			box.style.color = '#b02a37';
			box.style.border = '1px solid #f5c6cb';
		}
	}

	function val(form, name) {
		var el = form.elements[name];
		return el ? String(el.value || '').trim() : '';
	}

	function getParam(name) {
		var m = new RegExp('[?&]' + name + '=([^&]*)').exec(window.location.search);
		return m ? decodeURIComponent(m[1]) : '';
	}

	var PORTAL_LABELS = {
		student: 'Students Portal',
		alumni: 'Alumni Portal',
		staff: 'Staff Portal',
		non_staff: 'Non-Staff Portal',
		all_users: 'All Users Portal',
	};

	function withButton(form, fn) {
		var btn = form.querySelector('button[type="submit"], button');
		var original = btn ? btn.innerHTML : null;
		if (btn) {
			btn.disabled = true;
			btn.dataset.original = original;
		}
		return fn().finally(function () {
			if (btn) {
				btn.disabled = false;
				btn.innerHTML = btn.dataset.original;
			}
		});
	}

	function wireContact() {
		var form = document.getElementById('cccContactForm');
		if (!form) return;
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var payload = {
				name: val(form, 'name'),
				email: val(form, 'email'),
				phone: val(form, 'phone'),
				subject: val(form, 'subject'),
				message: val(form, 'message'),
			};
			withButton(form, function () {
				return postJSON('/api/contact', payload).then(function (r) {
					if (r.body.ok) {
						showMessage(form, r.body.message || 'Message sent.', 'success');
						form.reset();
					} else {
						showMessage(form, r.body.error || 'Something went wrong.', 'error');
					}
				}).catch(function () {
					showMessage(form, 'Network error. Please try again.', 'error');
				});
			});
		});
	}

	function applyRoleFields(role) {
		var matricGroup = document.getElementById('matricGroup');
		var emailGroup = document.getElementById('emailGroup');
		var isStudent = role === 'student';
		if (matricGroup) matricGroup.style.display = isStudent ? '' : 'none';
		if (emailGroup) {
			var emailInput = emailGroup.querySelector('input[name="email"]');
			if (emailInput) emailInput.required = !isStudent;
		}
	}

	function wireRegister() {
		var form = document.getElementById('cccRegisterForm');
		if (!form) return;

		var roleSelect = document.getElementById('roleSelect');
		var portal = getParam('portal');
		if (portal && roleSelect && PORTAL_LABELS[portal]) {
			roleSelect.value = portal;
			var heading = document.getElementById('registerHeading');
			if (heading) heading.innerHTML = 'Create your <span>' + PORTAL_LABELS[portal].replace(' Portal', '') + ' account</span>';
			var loginLink = document.getElementById('loginLink');
			if (loginLink) loginLink.href = 'login.html?portal=' + portal;
		}
		if (roleSelect) {
			applyRoleFields(roleSelect.value);
			roleSelect.addEventListener('change', function () { applyRoleFields(roleSelect.value); });
		}

		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var payload = {
				name: val(form, 'name'),
				role: roleSelect ? roleSelect.value : 'all_users',
				email: val(form, 'email'),
				matricNumber: val(form, 'matricNumber'),
				password: val(form, 'password'),
			};
			withButton(form, function () {
				return postJSON('/api/register', payload).then(function (r) {
					if (r.body.ok) {
						showMessage(form, 'Account created! Redirecting to your dashboard…', 'success');
						setTimeout(function () { window.location.href = 'dashboard.html'; }, 1200);
					} else {
						showMessage(form, r.body.error || 'Registration failed.', 'error');
					}
				}).catch(function () {
					showMessage(form, 'Network error. Please try again.', 'error');
				});
			});
		});
	}

	function wireLogin() {
		var form = document.getElementById('cccLoginForm');
		if (!form) return;

		var portal = getParam('portal');
		if (portal && PORTAL_LABELS[portal]) {
			var heading = document.getElementById('loginHeading');
			if (heading) heading.innerHTML = PORTAL_LABELS[portal].replace(' Portal', '') + ' <span>Sign In</span>';
			var registerLink = document.getElementById('registerLink');
			if (registerLink) registerLink.href = 'register.html?portal=' + portal;
			if (portal === 'student') {
				var label = document.getElementById('identifierLabel');
				if (label) label.textContent = 'Matriculation Number';
			}
		}

		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var payload = {
				identifier: val(form, 'identifier'),
				password: val(form, 'password'),
			};
			withButton(form, function () {
				return postJSON('/api/login', payload).then(function (r) {
					if (r.body.ok) {
						showMessage(form, 'Logged in! Redirecting…', 'success');
						setTimeout(function () { window.location.href = 'dashboard.html'; }, 1000);
					} else {
						showMessage(form, r.body.error || 'Login failed.', 'error');
					}
				}).catch(function () {
					showMessage(form, 'Network error. Please try again.', 'error');
				});
			});
		});
	}

	function wireSubscribe() {
		var forms = document.querySelectorAll('form.subscription-form');
		Array.prototype.forEach.call(forms, function (form) {
			form.addEventListener('submit', function (e) {
				e.preventDefault();
				var payload = { email: val(form, 'email') };
				withButton(form, function () {
					return postJSON('/api/subscribe', payload).then(function (r) {
						if (r.body.ok) {
							showMessage(form, r.body.message || 'Subscribed.', 'success');
							form.reset();
						} else {
							showMessage(form, r.body.error || 'Subscription failed.', 'error');
						}
					}).catch(function () {
						showMessage(form, 'Network error. Please try again.', 'error');
					});
				});
			});
		});
	}

	document.addEventListener('DOMContentLoaded', function () {
		wireContact();
		wireRegister();
		wireLogin();
		wireSubscribe();
	});
})();
