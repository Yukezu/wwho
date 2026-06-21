/* now.js — "Now" widget (what I'm into this week).
 *
 * One Firestore document:  now / current
 *   {
 *     listening: { text: string, url: string|null, videoId: string|null },
 *     watching:  { text: string, url: string|null },
 *     updatedAt: timestamp
 *   }
 *
 * - The "Listening to" field is now a YouTube Music player.
 * - Owner pastes a YouTube Music link → we store { url, videoId } in Firestore.
 * - On render: if a videoId exists, we fetch the real title + artist + album
 *   art via YouTube's keyless oEmbed API and show a Now Playing card with a
 *   playable embed. No API key needed.
 * - "Watching" remains a plain inline-editable text/link field.
 * - Reading + Obsessed rows were removed per request.
 */

const NOW_DOC = 'current'; // doc id inside the `now` collection

let nowUnsub = null;
let nowCache = null;       // latest data from Firestore
let npPlaying = false;     // whether the embed is currently playing

function formatNowUpdated(timestamp) {
  try {
    if (!timestamp) return 'Never updated';
    const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(d.getTime())) return 'Never updated';
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Updated just now';
    if (diffMin < 60) return 'Updated ' + diffMin + ' min ago';
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return 'Updated ' + diffHr + ' hr ago';
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return 'Updated ' + diffDay + ' day' + (diffDay === 1 ? '' : 's') + ' ago';
    return 'Updated ' + d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return 'Never updated'; }
}

// Extract the 11-char YouTube video ID from any YouTube / YouTube Music URL.
// Handles: watch?v=, /watch/, music.youtube.com, youtu.be, /embed/, /shorts/
function extractYouTubeId(input) {
  if (!input) return null;
  const s = String(input).trim();
  // youtu.be/ID
  let m = s.match(/youtu\.be\/([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  // music.youtube.com/watch?v=ID or youtube.com/watch?v=ID
  try {
    const u = new URL(s);
    if (u.hostname.endsWith('youtube.com') || u.hostname.endsWith('youtube-nocookie.com')) {
      const v = u.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      // /embed/ID, /shorts/ID, /v/ID, /live/ID
      const p = u.pathname.split('/').filter(Boolean);
      if (p.length >= 2 && ['embed', 'shorts', 'v', 'live'].includes(p[0]) && /^[A-Za-z0-9_-]{11}$/.test(p[1])) {
        return p[1];
      }
    }
  } catch {}
  // Bare ID
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  // Fallback regex on ?v=
  m = s.match(/[?&]v=([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return null;
}

// Fetch real title + author via YouTube's keyless oEmbed endpoint.
// Returns { title, author } or null if the fetch fails (e.g. CORS / private video).
async function fetchYouTubeMeta(videoId) {
  const watchUrl = 'https://www.youtube.com/watch?v=' + videoId;
  // noembed.com is a CORS-friendly oEmbed proxy that adds Access-Control-Allow-Origin.
  // We try it first so the browser fetch doesn't get blocked. If it fails, we fall
  // back to YouTube's own oEmbed (which sometimes lacks CORS headers) and finally
  // to a graceful "unknown" state.
  const endpoints = [
    'https://noembed.com/embed?url=' + encodeURIComponent(watchUrl),
    'https://www.youtube.com/oembed?url=' + encodeURIComponent(watchUrl) + '&format=json',
  ];
  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, { method: 'GET' });
      if (!res.ok) continue;
      const data = await res.json();
      if (data && (data.title || data.author_name)) {
        return {
          title: data.title || 'Now Playing',
          author: data.author_name || '',
          thumbnail: data.thumbnail_url || ('https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg'),
        };
      }
    } catch { /* try next endpoint */ }
  }
  // Graceful fallback — at least show the thumbnail (always constructable)
  return {
    title: 'Now on YouTube Music',
    author: '',
    thumbnail: 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg',
  };
}

// Render the Now Playing card from a stored listening value
async function renderNowPlaying(listening) {
  const titleEl    = document.getElementById('np-title');
  const artistEl   = document.getElementById('np-artist');
  const linkEl     = document.getElementById('np-link');
  const artImgEl   = document.getElementById('np-art-img');
  const artPlaceEl = document.querySelector('.np-art-placeholder');
  const playBtn    = document.getElementById('np-play');
  const embedWrap  = document.getElementById('np-embed');
  const iframe     = document.getElementById('np-iframe');
  if (!titleEl) return;

  const url = (listening && listening.url) || null;
  const videoId = (listening && listening.videoId) || (url ? extractYouTubeId(url) : null);

  if (!videoId) {
    // No track set — show the empty state
    titleEl.textContent = 'Nothing playing yet';
    artistEl.textContent = 'Paste a YouTube Music link to share what you\'re listening to';
    linkEl.hidden = true;
    if (artImgEl) artImgEl.hidden = true;
    if (artPlaceEl) artPlaceEl.style.display = '';
    if (playBtn) playBtn.hidden = true;
    if (embedWrap) embedWrap.hidden = true;
    if (iframe) iframe.src = '';
    npPlaying = false;
    return;
  }

  // We have a video — show album art immediately from the constructable thumbnail,
  // then enrich with the real title/author from oEmbed.
  const thumb = 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg';
  if (artImgEl) {
    artImgEl.src = thumb;
    artImgEl.hidden = false;
  }
  if (artPlaceEl) artPlaceEl.style.display = 'none';
  if (playBtn) playBtn.hidden = false;

  // Open-in-YouTube-Music link
  const ytmUrl = 'https://music.youtube.com/watch?v=' + videoId;
  if (linkEl) {
    linkEl.href = url && /music\.youtube\.com/.test(url) ? url : ytmUrl;
    linkEl.hidden = false;
  }

  // Optimistic title from any saved text
  if (listening && listening.text) {
    const parts = String(listening.text).split(' — ');
    titleEl.textContent = parts[0] || 'Now Playing';
    artistEl.textContent = parts.slice(1).join(' — ') || '';
  } else {
    titleEl.textContent = 'Loading…';
    artistEl.textContent = '';
  }

  // Enrich with real metadata
  try {
    const meta = await fetchYouTubeMeta(videoId);
    if (meta) {
      titleEl.textContent = meta.title;
      artistEl.textContent = meta.author || '';
      if (meta.thumbnail && artImgEl) artImgEl.src = meta.thumbnail;
    }
  } catch { /* keep optimistic state */ }

  // Wire the play button to load + autoplay the embed
  if (playBtn) {
    playBtn.onclick = () => {
      if (!iframe || !embedWrap) return;
      // Load the embed with autoplay. Using youtube-nocookie for privacy.
      const src = 'https://www.youtube-nocookie.com/embed/' + videoId +
                  '?autoplay=1&rel=0&modestbranding=1';
      iframe.src = src;
      embedWrap.hidden = false;
      npPlaying = true;
      showToast('Playing', 'Streaming from YouTube — turn up your volume.', 'success');
    };
  }
}

/* ==================== TMDB (Watching card) ==================== */

const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';

function tmdbConfigured() {
  return !!(TMDB_API_KEY && !TMDB_API_KEY.startsWith('PASTE_'));
}

// Parse a TMDB URL like https://www.themoviedb.org/movie/389-12-angry-men-1957
// or /tv/1396-breaking-bad. Returns { type, id } or null.
function parseTmdbUrl(input) {
  if (!input) return null;
  try {
    const u = new URL(input);
    if (!u.hostname.endsWith('themoviedb.org')) return null;
    const parts = u.pathname.split('/').filter(Boolean); // ['movie', '389-12-angry-men-1957']
    if (parts.length < 2) return null;
    const type = parts[0] === 'tv' ? 'tv' : (parts[0] === 'movie' ? 'movie' : null);
    if (!type) return null;
    const idStr = String(parts[1]).split('-')[0];
    const id = parseInt(idStr, 10);
    if (isNaN(id)) return null;
    return { type, id };
  } catch { return null; }
}

// Call a TMDB endpoint. Returns parsed JSON or throws.
async function tmdbFetch(path, params) {
  if (!tmdbConfigured()) throw new Error('TMDB API key not set in js/config.js');
  const url = new URL(TMDB_BASE + path);
  url.searchParams.set('api_key', TMDB_API_KEY);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error('TMDB ' + res.status);
  return res.json();
}

// Look up a movie or TV show by type + id
async function tmdbById(type, id) {
  const data = await tmdbFetch('/' + type + '/' + id);
  return normalizeTmdb(data, type);
}

// Search movies + TV by title (uses /search/multi). Returns the first result or null.
async function tmdbSearch(query) {
  const data = await tmdbFetch('/search/multi', { query, include_adult: 'false' });
  const results = (data.results || []).filter(
    (r) => (r.media_type === 'movie' || r.media_type === 'tv') && (r.poster_path || r.title || r.name)
  );
  if (results.length === 0) return null;
  return normalizeTmdb(results[0], results[0].media_type);
}

// Normalize a TMDB result into a flat shape the UI can render
function normalizeTmdb(item, type) {
  type = type || item.media_type;
  const title = item.title || item.name || 'Untitled';
  const date = item.release_date || item.first_air_date || '';
  const year = date ? date.slice(0, 4) : '';
  return {
    type: type,
    id: item.id,
    title: title,
    year: year,
    rating: (typeof item.vote_average === 'number' && item.vote_average > 0)
      ? item.vote_average.toFixed(1) : '',
    overview: item.overview || '',
    poster: item.poster_path ? (TMDB_IMG + item.poster_path) : '',
    url: 'https://www.themoviedb.org/' + type + '/' + item.id,
  };
}

// Render the Watching card from a stored watching value.
// Stored shape: { type, id, title?, url? }
async function renderWatching(value, owner) {
  const titleEl    = document.getElementById('wp-title');
  const metaEl     = document.getElementById('wp-meta');
  const overviewEl = document.getElementById('wp-overview');
  const linkEl     = document.getElementById('wp-link');
  const posterImg  = document.getElementById('wp-poster-img');
  const posterPh   = document.querySelector('.wp-poster-placeholder');
  if (!titleEl) return;

  const type = (value && value.type) || null;
  const id   = (value && value.id)   || null;

  if (!type || !id) {
    // Nothing set — empty state
    titleEl.textContent = 'Nothing watching yet';
    metaEl.hidden = true;
    overviewEl.hidden = true;
    linkEl.hidden = true;
    if (posterImg) posterImg.hidden = true;
    if (posterPh) posterPh.style.display = '';
    return;
  }

  // Optimistic: show any saved title immediately
  const savedTitle = (value && value.title) || 'Loading…';
  titleEl.textContent = savedTitle;
  metaEl.hidden = true;
  overviewEl.hidden = true;
  if (posterPh) posterPh.style.display = '';
  if (posterImg) posterImg.hidden = true;

  // Show the TMDB link right away (we can construct it from type+id)
  const tmdbUrl = (value && value.url) || ('https://www.themoviedb.org/' + type + '/' + id);
  linkEl.href = tmdbUrl;
  linkEl.hidden = false;

  // Enrich with real metadata from TMDB (if configured)
  if (!tmdbConfigured()) {
    titleEl.textContent = savedTitle === 'Loading…' ? (savedTitle || 'TMDB not configured') : savedTitle;
    overviewEl.hidden = true;
    return;
  }
  try {
    const meta = await tmdbById(type, id);
    if (!meta) return;
    titleEl.textContent = meta.title;
    // Meta row: year • type • ★ rating
    const parts = [];
    if (meta.year) parts.push('<span>' + esc(meta.year) + '</span>');
    parts.push('<span>' + esc(meta.type === 'tv' ? 'TV' : 'Film') + '</span>');
    if (meta.rating) {
      parts.push('<span class="wp-rating"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>' + esc(meta.rating) + '</span>');
    }
    metaEl.innerHTML = parts.join('<span class="wp-meta-dot" aria-hidden="true">•</span>');
    metaEl.hidden = false;
    // Overview
    if (meta.overview) {
      overviewEl.textContent = meta.overview;
      overviewEl.hidden = false;
    } else {
      overviewEl.hidden = true;
    }
    // Poster
    if (meta.poster && posterImg) {
      posterImg.src = meta.poster;
      posterImg.hidden = false;
      if (posterPh) posterPh.style.display = 'none';
    }
  } catch (e) {
    // Keep the optimistic title + link; just hide the meta/overview
    console.warn('TMDB fetch failed:', e);
  }
}

// Parse the API's flat string formats into the object shapes the renderers expect.
// listening: "videoId|url"  →  { videoId, url }
// watching:  "type|id|title|url"  →  { type, id, title, url }
function parseNowFromApi(apiData) {
  if (!apiData) return { listening: null, watching: null, updatedAt: null };
  let listening = null;
  if (apiData.listening) {
    const idx = apiData.listening.indexOf('|');
    if (idx !== -1) {
      listening = {
        videoId: apiData.listening.slice(0, idx),
        url: apiData.listening.slice(idx + 1) || null,
      };
    }
  }
  let watching = null;
  if (apiData.watching) {
    const parts = apiData.watching.split('|');
    if (parts.length >= 2) {
      watching = {
        type: parts[0],
        id: parts[1],
        title: parts[2] || '',
        url: parts[3] || '',
      };
    }
  }
  return { listening, watching, updatedAt: apiData.updatedAt };
}

function renderNow(data) {
  // data can be either the API shape (flat strings) or already-parsed.
  // Normalize to parsed form.
  const parsed = (data && typeof data.listening === 'string')
    ? parseNowFromApi(data)
    : (data || { listening: null, watching: null, updatedAt: null });
  nowCache = parsed;
  const owner = isOwnerSync();

  // Now Playing (async — fetches oEmbed)
  renderNowPlaying(nowCache.listening || null);

  // Watching (async — fetches TMDB)
  renderWatching(nowCache.watching || null, owner);

  // Owner input visibility — Listening
  const npOwnerBox = document.getElementById('np-owner');
  if (npOwnerBox) npOwnerBox.hidden = !owner;
  const npInput = document.getElementById('np-input');
  if (npInput && owner) {
    const cur = nowCache.listening && nowCache.listening.url;
    if (cur && npInput.value === '') npInput.value = cur;
  }

  // Owner input visibility — Watching
  const wpOwnerBox = document.getElementById('wp-owner');
  if (wpOwnerBox) wpOwnerBox.hidden = !owner;
  const wpInput = document.getElementById('wp-input');
  if (wpInput && owner) {
    const w = nowCache.watching;
    if (w && wpInput.value === '') {
      wpInput.value = w.url || w.title || '';
    }
  }

  // Updated timestamp
  const upd = document.getElementById('now-updated');
  if (upd) upd.textContent = formatNowUpdated(nowCache.updatedAt);
}

// Parse "Some text | https://example.com" into { text, url }
function parseTextUrl(input) {
  if (!input) return { text: '', url: null };
  const idx = input.lastIndexOf(' | ');
  if (idx === -1) return { text: input.trim(), url: null };
  const text = input.slice(0, idx).trim();
  const url = input.slice(idx + 3).trim();
  if (!/^https?:\/\//.test(url)) return { text: input.trim(), url: null };
  return { text, url };
}

// Fetch the Now state and render it.
// Supabase: reads the single row with id='current' from now_state.
// Local: GET /api/now.
async function fetchNow() {
  try {
    const s = initSupabase();
    let raw;
    if (s) {
      const { data, error } = await s.from('now_state').select('*').eq('id', 'current').maybeSingle();
      if (error) throw error;
      raw = data || { id: 'current', listening: '', watching: '', updated_at: null };
      // Normalize keys: Supabase uses snake_case, local uses camelCase
      raw = {
        listening: raw.listening || raw.listening || '',
        watching: raw.watching || raw.watching || '',
        updatedAt: raw.updated_at || raw.updatedAt || null,
      };
    } else {
      const res = await fetch('/api/now');
      if (!res.ok) throw new Error('Now load failed: ' + res.status);
      raw = await res.json();
    }
    renderNow(raw);
  } catch (e) {
    console.error('Now fetch failed:', e);
    renderNow(null);
  }
}

// Save a partial update. body shape:
//   { listening: { videoId, url } | null }  or  { watching: { type, id, title, url } | null }
async function putNow(body) {
  const s = initSupabase();
  if (s) {
    // Build the row fields to upsert
    const row = { id: 'current', updated_at: new Date().toISOString() };
    if (Object.prototype.hasOwnProperty.call(body, 'listening')) {
      const l = body.listening;
      row.listening = (l && l.videoId) ? (l.videoId + '|' + (l.url || '')) : '';
    }
    if (Object.prototype.hasOwnProperty.call(body, 'watching')) {
      const w = body.watching;
      row.watching = (w && w.type && w.id) ? ([w.type, w.id, w.title || '', w.url || ''].join('|')) : '';
    }
    const { data, error } = await s.from('now_state').upsert(row, { onConflict: 'id' }).select().single();
    if (error) throw error;
    renderNow({
      listening: data.listening || '',
      watching: data.watching || '',
      updatedAt: data.updated_at || data.updatedAt,
    });
    return;
  }
  // Local fallback
  const res = await apiFetch('/api/now', { method: 'PUT', body });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Save failed');
  }
  const data = await res.json();
  renderNow(data);
}

function initNow() {
  const card = document.getElementById('now-card');
  if (!card) return;

  // Initial load
  fetchNow();

  // Re-render when auth state changes (Supabase)
  onAuthChange(() => { if (nowCache) renderNow(nowCache); });

  // ===== Owner: save a YouTube Music link =====
  const saveBtn = document.getElementById('np-save');
  const npInput = document.getElementById('np-input');
  const saveTrack = async () => {
    if (!isOwnerSync()) {
      showToast('Owner only', 'Log in first (click the lock icon in Notes).', 'error');
      return;
    }
    const raw = (npInput && npInput.value || '').trim();
    if (!raw) {
      // Clear the track
      try {
        await putNow({ listening: null });
        showToast('Cleared', 'Now Playing track removed.', 'success');
        if (npInput) npInput.value = '';
      } catch (err) {
        showToast('Save failed', err.message, 'error');
      }
      return;
    }
    const videoId = extractYouTubeId(raw);
    if (!videoId) {
      showToast('Not a YouTube link', 'Paste a link from YouTube or YouTube Music.', 'error');
      return;
    }
    const normalizedUrl = 'https://music.youtube.com/watch?v=' + videoId;
    try {
      await putNow({ listening: { videoId, url: normalizedUrl } });
      showToast('Saved!', 'Your track is live for everyone.', 'success');
      if (npInput) npInput.value = normalizedUrl;
    } catch (err) {
      showToast('Save failed', err.message, 'error');
    }
  };
  if (saveBtn) saveBtn.addEventListener('click', saveTrack);
  if (npInput) {
    npInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveTrack(); }
    });
  }

  // ===== Owner: save "Watching" (TMDB link or title search) =====
  const wpSaveBtn = document.getElementById('wp-save');
  const wpInput = document.getElementById('wp-input');
  const saveWatch = async () => {
    if (!isOwnerSync()) {
      showToast('Owner only', 'Log in first (click the lock icon in Notes).', 'error');
      return;
    }
    const raw = (wpInput && wpInput.value || '').trim();
    if (!raw) {
      try {
        await putNow({ watching: null });
        showToast('Cleared', 'Watching card removed.', 'success');
        if (wpInput) wpInput.value = '';
      } catch (err) {
        showToast('Save failed', err.message, 'error');
      }
      return;
    }
    if (!tmdbConfigured()) {
      showToast('TMDB not configured', 'Add your TMDB API key to js/config.js first.', 'error');
      return;
    }
    try {
      let meta = null;
      const parsed = parseTmdbUrl(raw);
      if (parsed) {
        meta = await tmdbById(parsed.type, parsed.id);
      } else {
        meta = await tmdbSearch(raw);
      }
      if (!meta) {
        showToast('Not found', 'No movie or TV show matched "' + raw + '".', 'error');
        return;
      }
      await putNow({ watching: { type: meta.type, id: meta.id, title: meta.title, url: meta.url } });
      showToast('Saved!', '"' + meta.title + '" is live for everyone.', 'success');
      if (wpInput) wpInput.value = meta.url;
    } catch (err) {
      showToast('Save failed', err.message, 'error');
    }
  };
  if (wpSaveBtn) wpSaveBtn.addEventListener('click', saveWatch);
  if (wpInput) {
    wpInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveWatch(); }
    });
  }
}
