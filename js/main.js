/* main.js — runs on DOMContentLoaded, calls every init*() in the right order,
 * plus global keyboard shortcuts (T = theme, M = menu, / = focus contact form).
 */
/* ===== KEYBOARD SHORTCUTS ===== */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger when typing in a field
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || (e.target && e.target.isContentEditable);

    if (isTyping) return;

    // 'T' → toggle theme
    if (e.key === 't' || e.key === 'T') {
      const toggle = $('#theme-toggle');
      if (toggle) toggle.click();
    }
    // 'M' → toggle mobile menu (only on small screens)
    if ((e.key === 'm' || e.key === 'M') && window.innerWidth < 1024) {
      const toggle = $('#menu-toggle');
      if (toggle) toggle.click();
    }
    // '/' → focus first input on contact form
    if (e.key === '/' && !isTyping) {
      e.preventDefault();
      const nameField = $('#name');
      if (nameField) {
        nameField.focus();
        nameField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  });
}

/* ===== INIT EVERYTHING ===== */
document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initScrollProgress();
  initMobileMenu();
  initScrollspy();
  initTheme();
  initReveal();
  initCounters();
  initContactForm();
  initDownloadCV();
  initMusic();
  initNotes();
  initNow();
  initGuestbook();
  initKeyboardShortcuts();
  updateMsgCount();

  // Year in footer
  const yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});

