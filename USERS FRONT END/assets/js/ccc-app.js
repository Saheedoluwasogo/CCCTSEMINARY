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

	function wireRegister() {
		var form = document.getElementById('cccRegisterForm');
		if (!form) return;
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var payload = {
				name: val(form, 'name'),
				email: val(form, 'email'),
				password: val(form, 'password'),
			};
			withButton(form, function () {
				return postJSON('/api/register', payload).then(function (r) {
					if (r.body.ok) {
						showMessage(form, 'Account created! Redirecting…', 'success');
						setTimeout(function () { window.location.href = 'index.html'; }, 1200);
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
		form.addEventListener('submit', function (e) {
			e.preventDefault();
			var payload = {
				email: val(form, 'email'),
				password: val(form, 'password'),
			};
			withButton(form, function () {
				return postJSON('/api/login', payload).then(function (r) {
					if (r.body.ok) {
						showMessage(form, 'Logged in! Redirecting…', 'success');
						setTimeout(function () { window.location.href = 'index.html'; }, 1000);
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
