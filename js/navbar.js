/* navbar.js — top nav scroll effect, scroll progress bar, mobile menu, scrollspy.
 */
/* ===== NAVBAR SCROLL EFFECT ===== */
function initNavbar() {
  const navbar = $('#navbar');
  if (!navbar) return;
  const onScroll = () => {
    if (window.scrollY > 24) navbar.classList.add('scrolled');
    else navbar.classList.remove('scrolled');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });
}

/* ===== SCROLL PROGRESS BAR ===== */
function initScrollProgress() {
  const progress = $('#scroll-progress');
  if (!progress) return;
  const span = $('span', progress);
  if (!span) return;
  const update = () => {
    const h = document.documentElement;
    const scrolled = h.scrollTop;
    const total = h.scrollHeight - h.clientHeight;
    const pct = total > 0 ? (scrolled / total) * 100 : 0;
    span.style.width = pct + '%';
  };
  update();
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
}

/* ===== MOBILE MENU ===== */
function initMobileMenu() {
  const toggle = $('#menu-toggle');
  const menu = $('#mobile-menu');
  if (!toggle || !menu) return;

  const setOpen = (open) => {
    toggle.classList.toggle('open', open);
    menu.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    menu.setAttribute('aria-hidden', open ? 'false' : 'true');
  };

  toggle.addEventListener('click', () => setOpen(!toggle.classList.contains('open')));

  $$('a', menu).forEach(link => {
    link.addEventListener('click', () => setOpen(false));
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && toggle.classList.contains('open')) {
      setOpen(false);
      toggle.focus();
    }
  });

  // Close when resizing to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 1024) setOpen(false);
  }, { passive: true });
}

/* ===== SCROLLSPY ===== */
function initScrollspy() {
  const links = $$('.nav-link');
  if (links.length === 0) return;
  const sections = links
    .map(l => {
      const id = l.getAttribute('href');
      return id && id.startsWith('#') ? document.querySelector(id) : null;
    })
    .filter(Boolean);

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = '#' + entry.target.id;
        links.forEach(l => {
          const isActive = l.getAttribute('href') === id;
          l.classList.toggle('active', isActive);
          if (isActive) l.setAttribute('aria-current', 'page');
          else l.removeAttribute('aria-current');
        });
      }
    });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });

  sections.forEach(s => observer.observe(s));
}

