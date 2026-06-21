/* notes.js — Notes board.
 *
 * Primary backend: Supabase (Postgres + RLS + real-time). Works on GitHub Pages.
 * Fallback: local Next.js API (/api/notes). Used in dev when Supabase isn't configured.
 *
 * - Anyone can read notes.
 * - Owner (logged in) can post / delete.
 * - Likes + views are open to everyone.
 * - Real-time: Supabase broadcasts inserts/deletes/updates instantly.
 *   Local mode polls every 15s.
 */

const NOTES_MAX_TEXT = 500;
const NOTES_MAX_IMG_DIM = 1200;
const NOTES_IMG_QUALITY = 0.82;
const NOTES_TILTS = [-1.6, 2.2, -2.6, 1.1, -0.6, 2.7, -2.0, 1.4];
const NOTES_POLL_MS = 15000;

const NOTES_VIEWED_KEY = 'louie_portfolio_notes_viewed';
const NOTES_LIKED_KEY  = 'louie_portfolio_notes_liked';

function getViewedArr() { const a = store.get(NOTES_VIEWED_KEY, []); return Array.isArray(a) ? a : []; }
function markViewed(id) {
  const ids = getViewedArr();
  if (!ids.includes(id)) { ids.push(id); store.set(NOTES_VIEWED_KEY, ids); }
}
function getLikedIds() { const a = store.get(NOTES_LIKED_KEY, []); return Array.isArray(a) ? a : []; }
function isLiked(id) { return getLikedIds().includes(id); }
function setLiked(id, liked) {
  let ids = getLikedIds();
  if (liked && !ids.includes(id)) ids.push(id);
  if (!liked) ids = ids.filter(x => x !== id);
  store.set(NOTES_LIKED_KEY, ids);
}

function downscaleImage(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith('image/')) { reject(new Error('Not an image')); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Could not decode image'));
      img.onload = () => {
        let { width, height } = img;
        const maxDim = NOTES_MAX_IMG_DIM;
        if (width > maxDim || height > maxDim) {
          if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (file.type === 'image/png') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, width, height); }
        ctx.drawImage(img, 0, 0, width, height);
        try { resolve(canvas.toDataURL('image/jpeg', NOTES_IMG_QUALITY)); }
        catch (e) { reject(e); }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function formatCount(n) {
  n = Number(n) || 0;
  if (n < 1000) return String(n);
  if (n < 1_000_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}

function formatNoteDate(timestamp) {
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

function formatNoteDateLong(timestamp) {
  try {
    if (!timestamp) return '';
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return '';
    const datePart = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    const timePart = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${datePart} · ${timePart}`;
  } catch { return ''; }
}

let notesCache = [];
let notesPollTimer = null;
let notesRealtimeChannel = null;

function renderNotes() {
  const grid = $('#notes-grid');
  const empty = $('#notes-empty');
  if (!grid) return;
  const owner = isOwnerSync();

  if (notesCache.length === 0) {
    grid.innerHTML = '';
    if (empty) {
      empty.hidden = false;
      const p = $('p', empty);
      if (p) {
        p.textContent = owner
          ? 'No notes yet — write your first one above.'
          : 'No notes have been posted yet. Check back soon.';
      }
    }
    return;
  }
  if (empty) empty.hidden = true;

  grid.innerHTML = notesCache.map((n, i) => {
    const tilt = NOTES_TILTS[i % NOTES_TILTS.length];
    const imgHtml = n.image
      ? `<img class="note-img" src="${esc(n.image)}" alt="Note attachment" loading="lazy" decoding="async" />`
      : '';
    const deleteBtn = owner
      ? `<button type="button" class="note-delete" data-id="${esc(n.id)}" aria-label="Delete note">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6"/></svg>
         </button>`
      : '';
    const likes = Number(n.likes) || 0;
    const liked = isLiked(n.id);
    const likeBtn = `
      <button type="button" class="note-like ${liked ? 'liked' : ''}" data-id="${esc(n.id)}" aria-label="${liked ? 'Unlike' : 'Like'} note" aria-pressed="${liked ? 'true' : 'false'}">
        <svg viewBox="0 0 24 24" fill="${liked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        <span class="note-like-count">${formatCount(likes)}</span>
      </button>`;
    const views = Number(n.views) || 0;
    const viewsHtml = views > 0
      ? `<span class="note-views" title="${views} views">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
           <span>${formatCount(views)}</span>
         </span>`
      : '';
    const noteNum = String(i + 1).padStart(2, '0');
    return `
      <article class="note-card" data-id="${esc(n.id)}" style="--tilt:${tilt}deg"
               tabindex="0" role="button" aria-pressed="false"
               aria-label="Note ${noteNum} — click to flip">
        <div class="note-inner">
          <div class="note-front">
            <div class="note-bar" aria-hidden="true">
              <span class="note-dot red"></span>
              <span class="note-dot yellow"></span>
              <span class="note-dot green"></span>
            </div>
            <div class="note-body">
              <p class="note-text">${esc(n.text)}</p>
              ${imgHtml}
            </div>
            <div class="note-foot">
              <span class="note-date">${esc(formatNoteDate(n.createdAt || n.created_at))}</span>
              <div class="note-actions">
                ${viewsHtml}
                ${likeBtn}
                ${deleteBtn}
              </div>
            </div>
          </div>
          <div class="note-back" aria-hidden="true">
            <div class="note-back-inner">
              <div class="note-back-num">NOTE ${esc(noteNum)}</div>
              <div class="note-back-signature">Louie Tan</div>
              <div class="note-back-divider" aria-hidden="true"></div>
              <div class="note-back-date">${esc(formatNoteDateLong(n.createdAt || n.created_at))}</div>
              <div class="note-back-foot">— from my notes board</div>
              <div class="note-back-hint" aria-hidden="true">↻ click to flip back</div>
            </div>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function updateOwnerUI() {
  const owner = isOwnerSync();
  const composer = $('#notes-form');
  const lockBtn = $('#notes-lock');
  if (composer) composer.classList.toggle('owner-visible', owner);
  if (lockBtn) {
    lockBtn.classList.toggle('unlocked', owner);
    lockBtn.setAttribute('aria-label', owner ? 'Log out (exit owner mode)' : 'Owner login');
    lockBtn.title = owner ? 'Log out' : 'Owner login';
  }
  renderNotes();
}

let notesPendingImage = null;

// Normalize a note row from either backend into a common shape.
function normalizeNote(n) {
  return {
    id: n.id,
    text: n.text,
    image: n.image || null,
    signature: n.signature || 'Louie',
    likes: Number(n.likes) || 0,
    views: Number(n.views) || 0,
    tilt: Number(n.tilt) || 0,
    createdAt: n.createdAt || n.created_at || (n.created_at ? new Date(n.created_at).toISOString() : null),
  };
}

// ===== DATA LAYER (Supabase or local API) =====

async function fetchNotes() {
  const s = initSupabase();
  if (s) {
    const { data, error } = await s
      .from('notes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    return (data || []).map(normalizeNote);
  }
  // Local fallback
  const res = await fetch('/api/notes');
  if (!res.ok) throw new Error('Failed to load notes: ' + res.status);
  const data = await res.json();
  return (data.notes || []).map(normalizeNote);
}

async function createNote(payload) {
  const s = initSupabase();
  if (s) {
    const { data, error } = await s.from('notes').insert({
      text: payload.text,
      image: payload.image || null,
      signature: payload.signature || 'Louie',
      tilt: payload.tilt || 0,
      likes: 0,
      views: 0,
    }).select().single();
    if (error) throw error;
    return normalizeNote(data);
  }
  const res = await apiFetch('/api/notes', { method: 'POST', body: payload });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Post failed'); }
  const data = await res.json();
  return normalizeNote(data.note);
}

async function deleteNote(id) {
  const s = initSupabase();
  if (s) {
    const { error } = await s.from('notes').delete().eq('id', id);
    if (error) throw error;
    return;
  }
  const res = await apiFetch('/api/notes/' + encodeURIComponent(id), { method: 'DELETE' });
  if (!res.ok) throw new Error('Delete failed');
}

async function adjustLike(id, delta) {
  const s = initSupabase();
  if (s) {
    // Fetch current likes, then update (RLS allows authenticated reads; anon can read too).
    const { data: row, error: fe } = await s.from('notes').select('likes').eq('id', id).single();
    if (fe || !row) throw new Error('Not found');
    const newLikes = Math.max(0, (Number(row.likes) || 0) + delta);
    const { error } = await s.from('notes').update({ likes: newLikes }).eq('id', id);
    if (error) throw error;
    return newLikes;
  }
  const res = await fetch('/api/notes/' + encodeURIComponent(id) + '/like', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta }),
  });
  if (!res.ok) throw new Error('Like failed');
  const data = await res.json();
  return data.likes;
}

async function incrementView(id) {
  const s = initSupabase();
  if (s) {
    const { data: row } = await s.from('notes').select('views').eq('id', id).single();
    if (!row) return;
    await s.from('notes').update({ views: (Number(row.views) || 0) + 1 }).eq('id', id);
    return;
  }
  await fetch('/api/notes/' + encodeURIComponent(id) + '/view', { method: 'POST' }).catch(() => {});
}

// Real-time: subscribe to notes changes (Supabase only). Falls back to polling.
function startNotesRealtime() {
  const s = initSupabase();
  if (s) {
    notesRealtimeChannel = s
      .channel('notes-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, async () => {
        // Refetch on any change (simple + always correct).
        try {
          notesCache = await fetchNotes();
          renderNotes();
        } catch (e) { /* silent */ }
      })
      .subscribe();
    return;
  }
  // Local fallback — poll every 15s
  if (notesPollTimer) clearInterval(notesPollTimer);
  notesPollTimer = setInterval(async () => {
    try {
      const fresh = await fetchNotes();
      const sig = (n) => n.id + ':' + n.likes + ':' + n.views + ':' + (n.createdAt || '');
      if (notesCache.map(sig).join('|') !== fresh.map(sig).join('|')) {
        notesCache = fresh;
        renderNotes();
      }
    } catch (e) { /* silent */ }
  }, NOTES_POLL_MS);
}

function initNotes() {
  const form = $('#notes-form');
  const grid = $('#notes-grid');
  if (!form || !grid) return;

  const textarea = $('#notes-text');
  const fileInput = $('#notes-image');
  const uploadLabel = $('#notes-upload-label');
  const preview = $('#notes-preview');
  const previewImg = $('#notes-preview-img');
  const removeImgBtn = $('#notes-remove-img');
  const postBtn = $('#notes-post-btn');
  const lockBtn = $('#notes-lock');

  updateOwnerUI();

  // Initial load
  fetchNotes().then((notes) => {
    notesCache = notes;
    renderNotes();
    startNotesRealtime();
  }).catch((err) => {
    console.error('Notes load failed:', err);
    showToast('Notes error', 'Could not load notes.', 'error');
    renderNotes();
  });

  // Auth state changes (Supabase fires this on login/logout)
  onAuthChange(() => updateOwnerUI());

  // Lock button → login or logout
  if (lockBtn) {
    lockBtn.addEventListener('click', async () => {
      if (isOwnerSync()) {
        await ownerLogoutAny();
        updateOwnerUI();
        showToast('Logged out', 'Composer hidden. Visitors still see your notes.', 'success');
        return;
      }
      // Login flow — different prompts for Supabase vs local
      const s = initSupabase();
      if (s) {
        const email = prompt('Owner email:');
        if (!email) return;
        const password = prompt('Owner password:');
        if (!password) return;
        const res = await ownerLoginAny({ email, password });
        if (!res.ok) { showToast('Login failed', res.error, 'error'); return; }
      } else {
        const passcode = prompt('Owner passcode:');
        if (!passcode) return;
        const res = await ownerLoginAny({ passcode });
        if (!res.ok) { showToast('Login failed', res.error, 'error'); return; }
      }
      updateOwnerUI();
      showToast('Logged in', 'You can now post notes.', 'success');
    });
  }

  // Image picker
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Not an image', 'Please choose an image file.', 'error');
      fileInput.value = '';
      return;
    }
    postBtn.classList.add('loading');
    try {
      const dataUrl = await downscaleImage(file);
      notesPendingImage = dataUrl;
      previewImg.src = dataUrl;
      preview.hidden = false;
      if (uploadLabel) uploadLabel.textContent = 'Change';
    } catch (e) {
      showToast('Image failed', 'Could not process that image. Try another one.', 'error');
      notesPendingImage = null;
      preview.hidden = true;
      if (uploadLabel) uploadLabel.textContent = 'Image';
    } finally {
      postBtn.classList.remove('loading');
      fileInput.value = '';
    }
  });

  removeImgBtn.addEventListener('click', () => {
    notesPendingImage = null;
    preview.hidden = true;
    previewImg.src = '';
    if (uploadLabel) uploadLabel.textContent = 'Image';
  });

  // Submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!isOwnerSync()) {
      showToast('Locked', 'Click the lock icon to log in first.', 'error');
      return;
    }
    const text = textarea.value.trim();
    if (!text) { showToast('Empty note', 'Write something first.', 'error'); textarea.focus(); return; }
    if (text.length > NOTES_MAX_TEXT) { showToast('Too long', `Keep it under ${NOTES_MAX_TEXT} characters.`, 'error'); return; }
    postBtn.classList.add('loading');
    try {
      const note = await createNote({
        text,
        image: notesPendingImage || null,
        signature: 'Louie',
        tilt: NOTES_TILTS[notesCache.length % NOTES_TILTS.length],
      });
      // Optimistic: add to top (real-time will confirm)
      notesCache.unshift(note);
      renderNotes();
      textarea.value = '';
      notesPendingImage = null;
      preview.hidden = true;
      previewImg.src = '';
      if (uploadLabel) uploadLabel.textContent = 'Image';
      showToast('Posted', 'Your note is now live for everyone.', 'success');
    } catch (e) {
      showToast('Post failed', e.message, 'error');
    } finally {
      postBtn.classList.remove('loading');
    }
  });

  // Click handler: delete / like / flip
  grid.addEventListener('click', async (e) => {
    const delBtn = e.target.closest('.note-delete');
    if (delBtn) {
      e.stopPropagation();
      const id = delBtn.dataset.id;
      if (!id || !isOwnerSync()) return;
      try {
        await deleteNote(id);
        notesCache = notesCache.filter(n => n.id !== id);
        renderNotes();
        showToast('Deleted', 'Note removed.', 'success');
      } catch (err) {
        showToast('Delete failed', err.message, 'error');
      }
      return;
    }
    const likeBtn = e.target.closest('.note-like');
    if (likeBtn) { e.stopPropagation(); handleLike(likeBtn); return; }
    const card = e.target.closest('.note-card');
    if (!card) return;
    toggleFlip(card);
  });

  grid.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const card = e.target.closest('.note-card');
    if (!card) return;
    if (e.target.closest('.note-like')) return;
    e.preventDefault();
    toggleFlip(card);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    grid.querySelectorAll('.note-card.flipped').forEach(c => toggleFlip(c, false));
  });

  // View counter
  if ('IntersectionObserver' in window) {
    const viewObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        if (entry.intersectionRatio < 0.5) return;
        const card = entry.target;
        const id = card.dataset.id;
        if (!id) return;
        if (getViewedArr().includes(id)) return;
        setTimeout(() => {
          const stillVisible = viewObserver.takeRecords().some(
            (r) => r.target === card && r.isIntersecting && r.intersectionRatio >= 0.5
          );
          if (!stillVisible) return;
          markViewed(id);
          incrementView(id).catch(() => {});
        }, 500);
      });
    }, { threshold: [0, 0.5, 1.0] });

    const observeCards = () => {
      grid.querySelectorAll('.note-card').forEach((card) => {
        if (!card.dataset.observed) { viewObserver.observe(card); card.dataset.observed = '1'; }
      });
    };
    observeCards();
    const _origRender = renderNotes;
    renderNotes = function () { _origRender.apply(this, arguments); observeCards(); };
  }
}

async function handleLike(btn) {
  const id = btn.dataset.id;
  if (!id) return;
  const wasLiked = isLiked(id);
  setLiked(id, !wasLiked);
  btn.classList.toggle('liked', !wasLiked);
  btn.setAttribute('aria-pressed', !wasLiked ? 'true' : 'false');
  const svg = btn.querySelector('svg');
  if (svg) svg.setAttribute('fill', !wasLiked ? 'currentColor' : 'none');
  const countEl = btn.querySelector('.note-like-count');
  const note = notesCache.find((n) => n.id === id);
  const currentCount = Number(note && note.likes) || 0;
  const newCount = wasLiked ? Math.max(0, currentCount - 1) : currentCount + 1;
  if (countEl) countEl.textContent = formatCount(newCount);
  if (note) note.likes = newCount;
  try {
    const real = await adjustLike(id, wasLiked ? -1 : 1);
    if (note) note.likes = real;
    if (countEl) countEl.textContent = formatCount(real);
  } catch (err) {
    setLiked(id, wasLiked);
    btn.classList.toggle('liked', wasLiked);
    btn.setAttribute('aria-pressed', wasLiked ? 'true' : 'false');
    if (svg) svg.setAttribute('fill', wasLiked ? 'currentColor' : 'none');
    if (countEl) countEl.textContent = formatCount(currentCount);
    if (note) note.likes = currentCount;
    showToast('Like failed', err.message, 'error');
  }
}

function toggleFlip(card, forceState) {
  if (!card) return;
  const willFlip = forceState !== undefined ? forceState : !card.classList.contains('flipped');
  card.classList.toggle('flipped', willFlip);
  card.setAttribute('aria-pressed', willFlip ? 'true' : 'false');
  const front = card.querySelector('.note-front');
  const back = card.querySelector('.note-back');
  if (front) front.setAttribute('aria-hidden', willFlip ? 'true' : 'false');
  if (back) back.setAttribute('aria-hidden', willFlip ? 'false' : 'true');
}
