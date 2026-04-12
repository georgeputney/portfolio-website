function scrollToTop() {
  const start = window.scrollY;
  const duration = 1200;
  const startTime = performance.now();

  function ease(t) {
    return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2;
  }

  function step(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    window.scrollTo(0, start * (1 - ease(progress)));
    if (progress < 1) requestAnimationFrame(step);
  }

  requestAnimationFrame(step);
}

document.getElementById('footer-placeholder').innerHTML = `
  <footer>
    <a href="mailto:contact@georgeputney.com" class="footer-email">contact@georgeputney.com</a>
    <a onclick="scrollToTop()" class="footer-back" style="cursor:pointer">
      ↑ Back to top
    </a>
  </footer>
`;