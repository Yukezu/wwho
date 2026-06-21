/* guestbook.js — Public guestbook.
 *
 * Primary backend: Supabase (Postgres + RLS + real-time).
 * Fallback: local Next.js API (/api/guestbook).
 *
 * - Anyone can sign (name + message, with honeypot + size limits).
 * - Owner (logged in) can delete entries.
 * - Real-time: Supabase broadcasts inserts/deletes instantly.
 *   Local mode polls every 20s.
 */

const GB_KEY = 'louie_portfolio_gb_last';
const GB_RATE_LIMIT_MS = 30 * 1000;
const GB_MAX_NAME = 50;
const GB_MAX_MSG = 300;
const GB_POLL_MS = 20000;

let gbCache = [];
let gbPollTimer = null;

function formatGbDate(timestamp) {
  try {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const opts = sameDay ? { hour: '2-digit', minute: '2-digit' } : { month: 'short', day: 'numeric', year: 'numeric' };
    return d.toLocaleString(undefined, opts);
  } catch { return ''; }
}

function renderGuestbook() {
  const list = document.getElementById('guestbook-list');
  const empty = document.getElementById('guestbook-empty');
  if (!list) return;
  const owner = isOwnerSync();

  if (gbCache.length === 0) {
    list.innerHTML = '';
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;

  list.innerHTML = gbCache.map((e) => {
    const deleteBtn = owner
      ? `<button type="button" class="gb-entry-delete" data-id="${esc(e.id)}" aria-label="Delete entry">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6"/></svg>
         </button>`
      : '';
    return `
      <article class="gb-entry" data-id="${esc(e.id)}">
        ${deleteBtn}
        <div class="gb-entry-head">
          <span class="gb-entry-name">${esc(e.name || 'Anonymous')}</span>
          <span class="gb-entry-date">${esc(formatGbDate(e.createdAt || e.created_at))}</span>
        </div>
        <p class="gb-entry-message">${esc(e.message || '')}</p>
      </article>
    `;
  }).join('');
}

function normalizeGbEntry(e) {
  return {
    id: e.id,
    name: e.name,
    message: e.message,
    createdAt: e.createdAt || e.created_at || (e.created_at ? new Date(e.created_at).toISOString() : null),
  };
}

// ===== DATA LAYER =====

async function fetchGuestbook() {
  try {
    const s = initSupabase();
    if (s) {
      const { data, error } = await s
        .from('guestbook')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data || []).map(normalizeGbEntry);
    }
    const res = await fetch('/api/guestbook');
    if (!res.ok) throw new Error('Guestbook load failed: ' + res.status);
    const data = await res.json();
    return (data.entries || []).map(normalizeGbEntry);
  } catch (e) {
    console.error('Guestbook fetch failed:', e);
    return [];
  }
}

async function signGuestbook(name, message) {
  const s = initSupabase();
  if (s) {
    const { data, error } = await s.from('guestbook')
      .insert({ name, message })
      .select().single();
    if (error) throw error;
    return normalizeGbEntry(data);
  }
  const res = await fetch('/api/guestbook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, message }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Sign failed');
  }
  const data = await res.json();
  return normalizeGbEntry(data.entry);
}

async function deleteGuestbookEntry(id) {
  const s = initSupabase();
  if (s) {
    const { error } = await s.from('guestbook').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  const res = await apiFetch('/api/guestbook/' + encodeURIComponent(id), { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
}

function startGuestbookRealtime() {
  const s = initSupabase();
  if (s) {
    s.channel('guestbook-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'guestbook' }, async () => {
        try {
          gbCache = await fetchGuestbook();
          renderGuestbook();
        } catch (e) { /* silent */ }
      })
      .subscribe();
    return;
  }
  if (gbPollTimer) clearInterval(gbPollTimer);
  gbPollTimer = setInterval(async () => {
    const fresh = await fetchGuestbook();
    if (gbCache.map(e => e.id).join('|') !== fresh.map(e => e.id).join('|')) {
      gbCache = fresh;
      renderGuestbook();
    }
  }, GB_POLL_MS);
}

function initGuestbook() {
  const form = document.getElementById('guestbook-form');
  const list = document.getElementById('guestbook-list');
  if (!form || !list) return;

  const nameInput = document.getElementById('gb-name');
  const msgInput  = document.getElementById('gb-message');
  const charCount = document.getElementById('gb-char-count');
  const submitBtn = document.getElementById('gb-submit-btn');

  // Initial load
  fetchGuestbook().then((entries) => {
    gbCache = entries;
    renderGuestbook();
    startGuestbookRealtime();
  }).catch(() => { renderGuestbook(); });

  // Re-render on auth change (so delete buttons appear/disappear)
  onAuthChange(() => renderGuestbook());

  // Char counter
  if (msgInput && charCount) {
    const updateCount = () => {
      const len = msgInput.value.length;
      charCount.textContent = `${len} / ${GB_MAX_MSG}`;
      charCount.classList.toggle('warn', len > GB_MAX_MSG * 0.9);
    };
    msgInput.addEventListener('input', updateCount);
    updateCount();
  }

  // Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const hp = document.getElementById('gb-website');
    if (hp && hp.value.trim() !== '') {
      showToast('Signed!', 'Thanks for signing the guestbook.');
      form.reset();
      if (charCount) charCount.textContent = `0 / ${GB_MAX_MSG}`;
      return;
    }
    const name = (nameInput.value || '').trim().slice(0, GB_MAX_NAME);
    const message = (msgInput.value || '').trim().slice(0, GB_MAX_MSG);
    if (!name) { showToast('Name required', 'Please enter your name.', 'error'); nameInput.focus(); return; }
    if (!message) { showToast('Message required', 'Please write a message.', 'error'); msgInput.focus(); return; }
    const last = parseInt(store.getRaw(GB_KEY, '0'), 10) || 0;
    const since = Date.now() - last;
    if (since < GB_RATE_LIMIT_MS) {
      const wait = Math.ceil((GB_RATE_LIMIT_MS - since) / 1000);
      showToast('Slow down', `Please wait ${wait}s before signing again.`, 'error');
      return;
    }
    submitBtn.classList.add('loading');
    try {
      const entry = await signGuestbook(name, message);
      gbCache.unshift(entry);
      renderGuestbook();
      store.setRaw(GB_KEY, String(Date.now()));
      form.reset();
      if (charCount) charCount.textContent = `0 / ${GB_MAX_MSG}`;
      showToast('Signed!', 'Thanks for stopping by.', 'success');
    } catch (err) {
      showToast('Sign failed', err.message, 'error');
    } finally {
      submitBtn.classList.remove('loading');
    }
  });

  // Delete (owner only, event delegation)
  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('.gb-entry-delete');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id || !isOwnerSync()) return;
    try {
      await deleteGuestbookEntry(id);
      gbCache = gbCache.filter(x => x.id !== id);
      renderGuestbook();
      showToast('Deleted', 'Entry removed.', 'success');
    } catch (err) {
      showToast('Delete failed', err.message, 'error');
    }
  });
}
