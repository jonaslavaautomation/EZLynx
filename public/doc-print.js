// Print support for documents the portal generates (ID cards, certificates, invoices, proposals).
// Loaded as a file instead of inline script so it works under the portal's Content Security Policy.
document.addEventListener('click', function (e) {
  var t = e.target;
  if (t && t.closest && t.closest('[data-print]')) window.print();
});
if (document.body && document.body.hasAttribute('data-autoprint')) setTimeout(function () { window.print(); }, 300);
