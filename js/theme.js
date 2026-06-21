/* theme.js — dark/light theme toggle.
 * Respects prefers-color-scheme on first visit; saves user choice to localStorage.
 */
/* ===== THEME TOGGLE ===== */
function initTheme() {
  const toggle = $('#theme-toggle');
  const html = document.documentElement;

  // Respect prefers-color-scheme on first visit (when nothing is saved)
  const saved = store.getRaw('theme', '');
  if (saved === 'dark' || saved === 'light') {
    html.classList.remove('dark', 'light');
    html.classList.add(saved);
  } else {
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
    html.classList.remove('dark', 'light');
    html.classList.add(prefersLight ? 'light' : 'dark');
  }

  if (!toggle) return;
  toggle.addEventListener('click', () => {
    const isLight = html.classList.contains('light');
    const next = isLight ? 'dark' : 'light';
    html.classList.remove('dark', 'light');
    html.classList.add(next);
    store.setRaw('theme', next);
  });

  // Respond to OS theme changes if the user hasn't explicitly chosen
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      if (!store.getRaw('theme', '')) {
        html.classList.remove('dark', 'light');
        html.classList.add(e.matches ? 'light' : 'dark');
      }
    });
  }
}

