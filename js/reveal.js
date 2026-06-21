/* reveal.js — scroll-reveal animations + animated stat counters.
 */
/* ===== SCROLL REVEAL ===== */
function initReveal() {
  const els = $$('.reveal');
  if (els.length === 0) return;
  if (!('IntersectionObserver' in window)) {
    els.forEach(el => el.classList.add('visible'));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
  els.forEach(el => observer.observe(el));
}

/* ===== ANIMATED COUNTERS ===== */
function initCounters() {
  const els = $$('[data-count]');
  if (els.length === 0) return;
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.count, 10);
      const suffix = el.dataset.suffix || '';
      if (isNaN(target)) { observer.unobserve(el); return; }
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        el.textContent = String(target).padStart(2, '0') + suffix;
        observer.unobserve(el);
        return;
      }
      const duration = 1200;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        const val = Math.round(target * eased);
        el.textContent = String(val).padStart(2, '0') + suffix;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });
  els.forEach(el => observer.observe(el));
}

/* ===== ANIMATED COUNTERS ===== */
function initCounters() {
  const els = $$('[data-count]');
  if (els.length === 0) return;
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = parseInt(el.dataset.count, 10);
      const suffix = el.dataset.suffix || '';
      if (isNaN(target)) { observer.unobserve(el); return; }
      const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduced) {
        el.textContent = String(target).padStart(2, '0') + suffix;
        observer.unobserve(el);
        return;
      }
      const duration = 1200;
      const start = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
        const val = Math.round(target * eased);
        el.textContent = String(val).padStart(2, '0') + suffix;
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });
  els.forEach(el => observer.observe(el));
}

