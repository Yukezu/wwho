/* music.js — Spotify embed player.
 * Click a song row → loads it in the Spotify iframe below.
 * To add your own song IDs, edit the `songs` array's `spotifyId` fields.
 */
/* ===== MUSIC: SONG DATA + SPOTIFY EMBED PLAYER =====
 *
 * Visitors play the actual songs through Spotify's embed iframe.
 * Fully legal — Spotify pays the artists; you just embed.
 *
 * HOW TO ADD SPOTIFY TRACK IDs:
 *   1. Open https://open.spotify.com/ and search for the song
 *   2. Click the song → look at the URL: https://open.spotify.com/track/ABC123xyz...
 *   3. The part after "/track/" is the ID (e.g. "ABC123xyz...")
 *   4. Paste that ID into the `spotifyId` field for that song below
 *
 * If `spotifyId` is empty, clicking the song opens Spotify search in a new tab
 * (so the visitor can find it manually).
 */
const songs = [
  { number: "01", title: "Jorja Flores",         artist: "XXXTENTACION",                    duration: "2:48", spotifyId: "" },
  { number: "02", title: "Fuck Love",            artist: "XXXTENTACION, Trippie Redd",      duration: "2:30", spotifyId: "" },
  { number: "03", title: "My Kind of Woman",     artist: "Mac DeMarco",                     duration: "3:18", spotifyId: "" },
  { number: "04", title: "214",                  artist: "Rico Blanco",                     duration: "4:24", spotifyId: "" },
  { number: "05", title: "Last Night on Earth", artist: "Green Day",                       duration: "3:57", spotifyId: "" },
  { number: "06", title: "i fell on my face",    artist: "thank u, next",                   duration: "2:41", spotifyId: "" },
  { number: "07", title: "3:15 (Breathe)",       artist: "Russ",                            duration: "3:15", spotifyId: "" },
  { number: "08", title: "Asan Ka Na Ba",        artist: "Zack Tabudlo",                    duration: "3:42", spotifyId: "" },
  { number: "09", title: "Out Getting Ribs",     artist: "King Krule",                      duration: "3:23", spotifyId: "" },
  { number: "10", title: "Agapita",              artist: "KOLARIS",                         duration: "4:02", spotifyId: "" },
  { number: "11", title: "Alas Dose",            artist: "Cup of Joe",                      duration: "3:31", spotifyId: "" },
  { number: "12", title: "All I Ever Asked",     artist: "Rachel Chinouriri, sombr",        duration: "3:08", spotifyId: "" },
  { number: "13", title: "Sure Thing",           artist: "Miguel",                          duration: "3:18", spotifyId: "" },
  { number: "14", title: "No. 1 Party Anthem",   artist: "Arctic Monkeys",                  duration: "3:03", spotifyId: "" },
  { number: "15", title: "I Wanna Be Yours",     artist: "Arctic Monkeys",                  duration: "3:04", spotifyId: "" },
];

let currentSong = -1;

function renderSongs() {
  const grid = $('#songs-grid');
  if (!grid) return;
  grid.innerHTML = songs.map((s, i) => `
    <div class="song-row" data-index="${i}" role="listitem" tabindex="0"
         aria-label="Play ${esc(s.title)} by ${esc(s.artist)} on Spotify">
      <span class="song-number">${esc(s.number)}</span>
      <span class="song-play-icon" aria-hidden="true">
        <svg class="icon-arrow" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        <span class="icon-equalizer"><span></span><span></span><span></span></span>
      </span>
      <div class="song-info">
        <div class="song-title">${esc(s.title)}</div>
        <div class="song-artist">${esc(s.artist)}</div>
      </div>
      <span class="song-duration">${esc(s.duration)}</span>
    </div>
  `).join('');
}

function updateSongRows() {
  $$('.song-row').forEach((row, i) => {
    row.classList.toggle('active', i === currentSong);
    row.setAttribute('aria-current', i === currentSong ? 'true' : 'false');
  });
}

function updateNowPlayingLabel() {
  const el = $('#now-playing-label');
  if (!el) return;
  if (currentSong < 0) {
    el.textContent = 'Pick a track to start';
    return;
  }
  const s = songs[currentSong];
  el.innerHTML = 'Now playing: <strong>' + esc(s.title) + '</strong> &middot; ' + esc(s.artist);
}

// Load a song into the Spotify embed iframe
function playSong(index) {
  if (index < 0 || index >= songs.length) return;
  const s = songs[index];
  const iframe = $('#spotify-embed');
  const placeholder = $('#spotify-placeholder');

  if (!s.spotifyId) {
    // No ID configured → open Spotify search in a new tab so the visitor can find it
    const q = encodeURIComponent(s.title + ' ' + s.artist);
    window.open('https://open.spotify.com/search/' + q, '_blank', 'noopener,noreferrer');
    showToast('Open in Spotify', 'No track ID set yet — opened Spotify search for "' + s.title + '".', 'success');
    return;
  }

  // Load this track in the embed iframe
  if (iframe) {
    iframe.src = 'https://open.spotify.com/embed/track/' + encodeURIComponent(s.spotifyId) +
                 '?utm_source=generator&theme=0';
    iframe.style.display = 'block';
  }
  if (placeholder) placeholder.style.display = 'none';

  currentSong = index;
  updateSongRows();
  updateNowPlayingLabel();

  // Smooth-scroll the embed into view so the visitor sees the player
  const card = $('#spotify-embed');
  if (card && card.scrollIntoView) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function initMusic() {
  renderSongs();

  // Song row clicks (event delegation)
  document.addEventListener('click', (e) => {
    const row = e.target.closest('.song-row');
    if (row && row.dataset.index != null) {
      playSong(parseInt(row.dataset.index, 10));
      return;
    }
  });
  // Keyboard support for song rows
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const row = document.activeElement && document.activeElement.closest && document.activeElement.closest('.song-row');
    if (row && row.dataset.index != null) {
      e.preventDefault();
      playSong(parseInt(row.dataset.index, 10));
    }
  });
}

