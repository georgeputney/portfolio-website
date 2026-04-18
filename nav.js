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

document.getElementById('nav-placeholder').innerHTML = `
<nav>
  <a href="/" class="nav-name">George Putney</a>
  <div class="nav-right">
    <div class="nav-icons">
      <a href="https://www.linkedin.com/in/georgeputney/" title="LinkedIn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/>
          <circle cx="4" cy="4" r="2"/>
        </svg>
      </a>
      <a href="https://github.com/georgeputney?tab=repositories" title="GitHub">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/>
        </svg>
      </a>
    </div>
    <div class="nav-links">
      <a href="/" class="nav-link">Home</a>
      <a href="/experience" class="nav-link">Experience</a>
      <a href="/projects" class="nav-link">Projects</a>
    </div>
    <button class="nav-burger" id="nav-burger" aria-label="Open menu">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>

<div class="nav-drawer" id="nav-drawer">
  <div class="nav-drawer-backdrop" id="nav-backdrop"></div>
  <div class="nav-drawer-panel">
    <div class="nav-drawer-links">
      <a href="/" class="nav-drawer-link">Home</a>
      <a href="/experience" class="nav-drawer-link">Experience</a>
      <a href="/projects" class="nav-drawer-link">Projects</a>
    </div>
    <div class="nav-drawer-icons">
      <a href="https://www.linkedin.com/in/georgeputney/" title="LinkedIn">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z"/>
          <circle cx="4" cy="4" r="2"/>
        </svg>
      </a>
      <a href="https://github.com/georgeputney" title="GitHub">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
          <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/>
        </svg>
      </a>
    </div>
  </div>
</div>
`;

// Active link highlight
const path = window.location.pathname.replace(/\/$/, '').replace(/\.html$/, '') || '/';
[...document.querySelectorAll('.nav-link'), ...document.querySelectorAll('.nav-drawer-link')].forEach(link => {
  const href = link.getAttribute('href').replace(/\/$/, '').replace(/\.html$/, '') || '/';
  if (href === path) link.classList.add('active');
});

// Burger toggle
const burger   = document.getElementById('nav-burger');
const drawer   = document.getElementById('nav-drawer');
const backdrop = document.getElementById('nav-backdrop');

function openDrawer()  { burger.classList.add('open');    drawer.classList.add('open');    document.body.style.overflow = 'hidden'; }
function closeDrawer() { burger.classList.remove('open'); drawer.classList.remove('open'); document.body.style.overflow = ''; }

burger.addEventListener('click', () => burger.classList.contains('open') ? closeDrawer() : openDrawer());
backdrop.addEventListener('click', closeDrawer);
document.querySelectorAll('.nav-drawer-link').forEach(l => l.addEventListener('click', closeDrawer));