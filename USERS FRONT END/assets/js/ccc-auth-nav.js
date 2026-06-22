// Shows the signed-in user's name in the site header on every page.
// When logged in, the header "Login" / "Register" links become a greeting,
// a dashboard link and a log-out action. Guests see the links unchanged.
(function () {
	'use strict';

	function firstName(name) {
		return String(name || '').trim().split(/\s+/)[0] || 'Account';
	}

	function logout(e) {
		if (e) e.preventDefault();
		fetch('/api/logout', { method: 'POST', credentials: 'same-origin' })
			.then(function () { window.location.href = 'index.html'; });
	}

	function applyLoggedIn(user) {
		var scopes = document.querySelectorAll('header');
		var roots = scopes.length ? scopes : [document.body];
		Array.prototype.forEach.call(roots, function (root) {
			var loginLinks = root.querySelectorAll('a[href^="login.html"]');
			Array.prototype.forEach.call(loginLinks, function (a) {
				a.textContent = 'Hi, ' + firstName(user.name);
				a.setAttribute('href', 'dashboard.html');
				a.title = user.roleLabel + (user.matricNumber ? ' \u2013 ' + user.matricNumber : '');
			});
			var regLinks = root.querySelectorAll('a[href^="register.html"]');
			Array.prototype.forEach.call(regLinks, function (a) {
				a.textContent = 'Log Out';
				a.setAttribute('href', '#');
				a.addEventListener('click', logout);
			});
		});
	}

	document.addEventListener('DOMContentLoaded', function () {
		fetch('/api/me', { credentials: 'same-origin' })
			.then(function (r) { return r.json(); })
			.then(function (data) {
				if (data && data.user) applyLoggedIn(data.user);
			})
			.catch(function () { /* offline / not signed in */ });
	});
})();
