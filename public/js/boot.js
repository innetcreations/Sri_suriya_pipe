/* Tiny blocking script: marks JS as available and shows the intro loader once per browser session. */
(function () {
  var d = document.documentElement;
  d.className = d.className.replace('no-js', 'js');
  try {
    if (d.getAttribute('data-fx-loader') === '1' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches && !sessionStorage.getItem('ssp:intro')) {
      sessionStorage.setItem('ssp:intro', '1');
      d.classList.add('fx-loading');
      setTimeout(function () { d.classList.remove('fx-loading'); }, 5000);
    }
  } catch (e) { /* storage blocked: skip intro */ }
})();
