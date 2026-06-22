// Populate a details page (course / blog / event) with the item title passed
// via the `?title=` query string, so a single static template can represent
// any item linked from the listing pages.
(function () {
	var params = new URLSearchParams(window.location.search);
	var title = params.get('title');
	if (!title) return;
	title = title.trim();
	if (!title) return;

	var heading = document.querySelector('.page-banner-entry h1');
	if (heading) heading.textContent = title;

	document.title = 'CCCTSeminary : ' + title;

	var crumbItems = document.querySelectorAll('.breadcrumb-row .list-inline li');
	if (crumbItems.length) {
		var last = crumbItems[crumbItems.length - 1];
		if (!last.querySelector('a')) last.textContent = title;
	}
})();
