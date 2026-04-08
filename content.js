// CheburTube v4 — content.js
// Notion × Y2K × Frutiger Aero — white/grey/black + red accents

(() => {
  'use strict';

  const FREE_LIMIT_GB = 15;
  const FREE_LIMIT_BYTES = FREE_LIMIT_GB * 1024 ** 3;
  const PRICE_PER_GB = 150;

  // All qualities high → low
  const QUALITIES = [
    { label: '2160p', mbps: 20.0, height: 2160 },
    { label: '1440p', mbps: 10.0, height: 1440 },
    { label: '1080p', mbps: 4.50, height: 1080 },
    { label: '720p',  mbps: 2.50, height: 720  },
    { label: '480p',  mbps: 0.80, height: 480  },
    { label: '360p',  mbps: 0.50, height: 360  },
    { label: '240p',  mbps: 0.25, height: 240  },
    { label: '144p',  mbps: 0.10, height: 144  },
  ];

  // Notion-style palette high→low
  const QUALITY_COLORS = [
    { bg: '#FFDDD2', text: '#C9321F', border: '#F5B8AC' },
    { bg: '#FFE7D0', text: '#C96B1F', border: '#F5CFB0' },
    { bg: '#FFF0C0', text: '#B58B00', border: '#EDD980' },
    { bg: '#E8F5E0', text: '#2D7A2D', border: '#B8DDA0' },
    { bg: '#E0EEF8', text: '#2058A0', border: '#A0C8E8' },
    { bg: '#EAE8F8', text: '#4A3A9A', border: '#C0B8E8' },
    { bg: '#F0F0F0', text: '#606060', border: '#D0D0D0' },
    { bg: '#E8E8E8', text: '#808080', border: '#C8C8C8' },
  ];

  let currentVideoBytes = 0;
  let boardInterval = null;
  let noFreeLimit = false;
  let maxVideoHeight = 0; // detected max quality of current video

  // ── Storage ───────────────────────────────────────────────────────
  function saveBytes(bytes) {
    chrome.storage.local.get(['totalBytes'], (d) => {
      chrome.storage.local.set({ totalBytes: (d.totalBytes || 0) + bytes });
    });
  }
  function getTotalBytes(cb) {
    chrome.storage.local.get(['totalBytes', 'noFreeLimit'], (d) => {
      noFreeLimit = !!d.noFreeLimit;
      cb(d.totalBytes || 0);
    });
  }

  // ── Math ──────────────────────────────────────────────────────────
  function bytesToGB(b) { return b / (1024 ** 3); }
  function calcCost(bytes, ignoreLimit) {
    const gb = bytesToGB(bytes);
    if (ignoreLimit) return gb * PRICE_PER_GB;
    return Math.max(0, gb - FREE_LIMIT_GB) * PRICE_PER_GB;
  }
  function calcRawCost(bytes) { return bytesToGB(bytes) * PRICE_PER_GB; }
  function ceilRub(cost) {
    if (cost <= 0) return '0 ₽';
    return Math.ceil(cost) + ' ₽';
  }
  function estimateBytes(mbps, durationSec) {
    return (mbps * 1_000_000 / 8) * durationSec;
  }

  // ── Detect available qualities from YouTube player ────────────────
  function detectMaxQuality() {
    try {
      // YouTube player API
      const player = document.getElementById('movie_player');
      if (player && typeof player.getAvailableQualityLevels === 'function') {
        const levels = player.getAvailableQualityLevels(); // e.g. ['hd2160','hd1080','hd720','large','medium','small','tiny']
        const map = { hd2160: 2160, hd1440: 1440, hd1080: 1080, hd720: 720, large: 480, medium: 360, small: 240, tiny: 144 };
        let max = 0;
        for (const l of levels) { if (map[l] && map[l] > max) max = map[l]; }
        if (max > 0) { maxVideoHeight = max; return; }
      }
    } catch (_) {}

    // Fallback: use current video element resolution as minimum proxy
    const v = document.querySelector('video');
    if (v && v.videoHeight > 0) {
      // videoHeight is the currently playing quality, not the max
      // but we keep updating: if we see a higher value later, update
      if (v.videoHeight > maxVideoHeight) maxVideoHeight = v.videoHeight;
    }
  }

  // Filter qualities to show (only those ≤ maxVideoHeight)
  function availableQualities() {
    if (maxVideoHeight === 0) return QUALITIES; // not detected yet, show all
    return QUALITIES.filter(q => q.height <= maxVideoHeight);
  }

  // ── Change quality via YouTube player API ─────────────────────────
  function setQuality(label) {
    try {
      const player = document.getElementById('movie_player');
      if (!player) return;

      // Map label → YouTube quality string
      const map = { '2160p': 'hd2160', '1440p': 'hd1440', '1080p': 'hd1080', '720p': 'hd720', '480p': 'large', '360p': 'medium', '240p': 'small', '144p': 'tiny' };
      const ytQ = map[label];
      if (!ytQ) return;

      if (typeof player.setPlaybackQuality === 'function') {
        player.setPlaybackQuality(ytQ);
      }
      if (typeof player.setPlaybackQualityRange === 'function') {
        player.setPlaybackQualityRange(ytQ, ytQ);
      }
    } catch (e) { console.warn('CheburTube: setQuality failed', e); }
  }

  // ── Byte tracking ─────────────────────────────────────────────────
  function startTracking() {
    if (!window.PerformanceObserver) return;
    const obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const url = e.name || '';
        if (url.includes('googlevideo.com') || url.includes('/videoplayback')) {
          const b = e.transferSize || 0;
          if (b > 0) { currentVideoBytes += b; saveBytes(b); }
        }
      }
    });
    try { obs.observe({ entryTypes: ['resource'] }); } catch (_) {}
  }

  // ── CSS ───────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('ct-styles')) return;
    const s = document.createElement('style');
    s.id = 'ct-styles';
    s.textContent = `
      #ct-board {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #FFFFFF;
        border: 1px solid #E5E5E5;
        border-radius: 12px;
        overflow: hidden;
        margin: 0 0 12px 0;
        width: 100%;
        color: #1A1A1A;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
      }

      /* Header */
      .ct-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 9px 14px 8px;
        border-bottom: 1px solid #F0F0F0;
        background: linear-gradient(180deg, #FAFAFA 0%, #F5F5F5 100%);
      }
      .ct-name {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: -0.3px;
        color: #111;
      }
      .ct-dots { display: flex; gap: 5px; align-items: center; }
      .ct-dot {
        width: 11px; height: 11px; border-radius: 50%;
        box-shadow: inset 0 1px 1px rgba(255,255,255,0.5), 0 1px 2px rgba(0,0,0,0.2);
      }
      .ct-dot-r { background: radial-gradient(circle at 35% 35%, #FF7A6E, #E0443A); }
      .ct-dot-y { background: radial-gradient(circle at 35% 35%, #FFD062, #E0A01A); }
      .ct-dot-g { background: radial-gradient(circle at 35% 35%, #66D166, #2AA82A); }

      /* Stats — 2×2 grid */
      .ct-stats {
        display: grid;
        grid-template-columns: 1fr 1fr;
        grid-template-rows: auto auto;
      }
      .ct-stat {
        padding: 9px 12px;
        border-right: 1px solid #F0F0F0;
        border-bottom: 1px solid #F0F0F0;
        min-width: 0;
      }
      .ct-stat:nth-child(2) { border-right: none; }
      .ct-stat:nth-child(3) { border-bottom: none; }
      .ct-stat:nth-child(4) { border-right: none; border-bottom: none; }
      .ct-stat-lbl {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.7px;
        color: #999;
        font-weight: 600;
        margin-bottom: 3px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ct-stat-val {
        font-size: 17px;
        font-weight: 800;
        letter-spacing: -0.5px;
        color: #111;
        line-height: 1.1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ct-stat-sub {
        font-size: 9px;
        color: #BBB;
        margin-top: 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .ct-red { color: #D63030 !important; }
      .ct-green { color: #1E7E34 !important; }

      /* Progress */
      .ct-prog-wrap {
        padding: 8px 14px;
        border-bottom: 1px solid #F0F0F0;
      }
      .ct-prog-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 5px;
      }
      .ct-prog-lbl {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.7px;
        color: #999;
        font-weight: 600;
      }
      .ct-prog-pct { font-size: 9px; font-weight: 700; color: #555; }
      .ct-track {
        height: 6px; background: #F0F0F0;
        border-radius: 3px; overflow: hidden;
      }
      .ct-bar {
        height: 100%; border-radius: 3px;
        background: linear-gradient(90deg, #4CAF50, #81C784);
        transition: width 0.5s ease;
      }
      .ct-bar.over { background: linear-gradient(90deg, #D63030, #FF6B6B); }
      .ct-prog-status { font-size: 9px; color: #888; margin-top: 4px; font-weight: 500; }

      /* Quality chips */
      .ct-qual-wrap {
        padding: 9px 14px;
        border-bottom: 1px solid #F0F0F0;
      }
      .ct-qual-lbl {
        font-size: 9px;
        text-transform: uppercase;
        letter-spacing: 0.7px;
        color: #999;
        font-weight: 600;
        margin-bottom: 7px;
      }
      .ct-chips { display: flex; flex-wrap: wrap; gap: 5px; }
      .ct-chip {
        display: inline-flex;
        flex-direction: column;
        align-items: flex-start;
        padding: 5px 9px;
        border-radius: 7px;
        border: 1px solid;
        cursor: pointer;
        transition: all 0.12s;
        user-select: none;
      }
      .ct-chip:hover { transform: translateY(-1px); filter: brightness(0.96); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
      .ct-chip:active { transform: translateY(0); }
      .ct-chip.ct-chip-active {
        outline: 2px solid #1A1A1A;
        outline-offset: 1px;
      }
      .ct-chip-q {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.3px;
        opacity: 0.65;
      }
      .ct-chip-p {
        font-size: 13px;
        font-weight: 800;
        letter-spacing: -0.3px;
      }

      /* Footer */
      .ct-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 7px 12px;
        background: #FAFAFA;
        gap: 6px;
        flex-wrap: wrap;
      }
      .ct-btns { display: flex; gap: 5px; flex-wrap: wrap; }
      .ct-btn {
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 6px;
        border: 1px solid;
        cursor: pointer;
        transition: all 0.12s;
        letter-spacing: 0.1px;
        line-height: 1.4;
      }
      .ct-btn-reset { background: #fff; color: #555; border-color: #DDD; }
      .ct-btn-reset:hover { background: #F5F5F5; }
      .ct-btn-toggle { background: #fff; color: #D63030; border-color: #FFCCCC; }
      .ct-btn-toggle:hover { background: #FFF0F0; }
      .ct-btn-toggle.active { background: #D63030; color: #fff; border-color: #D63030; }
      .ct-socials { display: flex; gap: 4px; }
      .ct-soc {
        display: flex; align-items: center; justify-content: center;
        width: 26px; height: 22px; border-radius: 5px;
        background: #fff; border: 1px solid #E5E5E5;
        font-size: 9px; font-weight: 800; text-decoration: none; color: #555;
        transition: all 0.12s;
      }
      .ct-soc:hover { border-color: #D63030; color: #D63030; background: #FFF5F5; }

      .ct-no-video {
        padding: 12px 14px; font-size: 11px; color: #BBB;
        text-align: center; border-bottom: 1px solid #F0F0F0;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Build board ───────────────────────────────────────────────────
  function createBoard() {
    const div = document.createElement('div');
    div.id = 'ct-board';
    div.innerHTML = `
      <div class="ct-hdr">
        <span class="ct-name">CheburTube</span>
        <div class="ct-dots">
          <div class="ct-dot ct-dot-r"></div>
          <div class="ct-dot ct-dot-y"></div>
          <div class="ct-dot ct-dot-g"></div>
        </div>
      </div>

      <div class="ct-stats">
        <div class="ct-stat">
          <div class="ct-stat-lbl">Всего потрачено</div>
          <div class="ct-stat-val" id="ct-spent">0 ₽</div>
          <div class="ct-stat-sub" id="ct-spent-gb">0 ГБ</div>
        </div>
        <div class="ct-stat">
          <div class="ct-stat-lbl">Абсолютный расход</div>
          <div class="ct-stat-val ct-red" id="ct-abs">0 ₽</div>
          <div class="ct-stat-sub">без учёта лимита</div>
        </div>
        <div class="ct-stat">
          <div class="ct-stat-lbl">Реалтайм · сейчас</div>
          <div class="ct-stat-val" id="ct-live">0 ₽</div>
          <div class="ct-stat-sub" id="ct-live-mb">0 МБ</div>
        </div>
        <div class="ct-stat">
          <div class="ct-stat-lbl">Итого за ролик</div>
          <div class="ct-stat-val ct-red" id="ct-video-total">—</div>
          <div class="ct-stat-sub" id="ct-video-q">ожидание...</div>
        </div>
      </div>

      <div class="ct-prog-wrap">
        <div class="ct-prog-row">
          <span class="ct-prog-lbl">Ежемесячный лимит · 15 ГБ</span>
          <span class="ct-prog-pct" id="ct-pct">0%</span>
        </div>
        <div class="ct-track"><div class="ct-bar" id="ct-bar" style="width:0%"></div></div>
        <div class="ct-prog-status" id="ct-status">Бесплатно ещё 15,00 ГБ</div>
      </div>

      <div id="ct-qual-section" class="ct-qual-wrap" style="display:none">
        <div class="ct-qual-lbl">Стоимость по качеству — нажми чтобы переключить</div>
        <div class="ct-chips" id="ct-chips"></div>
      </div>
      <div id="ct-no-video" class="ct-no-video">Откройте видео — появится расчёт стоимости</div>

      <div class="ct-foot">
        <div class="ct-btns">
          <button class="ct-btn ct-btn-reset" id="ct-reset">Сбросить статистику</button>
          <button class="ct-btn ct-btn-toggle" id="ct-toggle">Без лимита</button>
        </div>
        <div class="ct-socials">
          <a class="ct-soc" href="https://www.youtube.com/@ruwear" target="_blank">Yt</a>
          <a class="ct-soc" href="https://t.me/ruw3ar" target="_blank">Tg</a>
          <a class="ct-soc" href="https://www.twitch.tv/ruwear" target="_blank">Tw</a>
        </div>
      </div>
    `;

    div.querySelector('#ct-reset').addEventListener('click', () => {
      if (confirm('Сбросить всю статистику трафика?')) {
        chrome.storage.local.set({ totalBytes: 0 }, () => {
          currentVideoBytes = 0;
          renderBoard();
        });
      }
    });

    div.querySelector('#ct-toggle').addEventListener('click', () => {
      noFreeLimit = !noFreeLimit;
      chrome.storage.local.set({ noFreeLimit });
      renderBoard();
    });

    return div;
  }

  // ── Helpers ───────────────────────────────────────────────────────
  function qEl(id) { return document.getElementById(id); }

  function getCurrentQualityLabel() {
    try {
      const player = document.getElementById('movie_player');
      if (player && typeof player.getPlaybackQuality === 'function') {
        const ytQ = player.getPlaybackQuality();
        const map = { hd2160: '2160p', hd1440: '1440p', hd1080: '1080p', hd720: '720p', large: '480p', medium: '360p', small: '240p', tiny: '144p' };
        return map[ytQ] || null;
      }
    } catch (_) {}
    // fallback by videoHeight
    const v = document.querySelector('video');
    if (!v || !v.videoHeight) return null;
    const h = v.videoHeight;
    if (h >= 2160) return '2160p';
    if (h >= 1440) return '1440p';
    if (h >= 1080) return '1080p';
    if (h >= 720)  return '720p';
    if (h >= 480)  return '480p';
    if (h >= 360)  return '360p';
    if (h >= 240)  return '240p';
    return '144p';
  }

  // ── Render ────────────────────────────────────────────────────────
  function renderBoard() {
    const board = qEl('ct-board');
    if (!board) return;

    detectMaxQuality();

    const video = document.querySelector('video');
    const duration = video ? (video.duration || 0) : 0;

    getTotalBytes((totalBytes) => {
      // Stats
      const spent = calcCost(totalBytes, noFreeLimit);
      const absSpent = calcRawCost(totalBytes);
      const liveRaw = calcRawCost(currentVideoBytes);

      qEl('ct-spent').textContent = ceilRub(spent);
      qEl('ct-spent-gb').textContent = bytesToGB(totalBytes).toFixed(3) + ' ГБ';
      qEl('ct-abs').textContent = ceilRub(absSpent);
      qEl('ct-live').textContent = ceilRub(liveRaw);
      qEl('ct-live-mb').textContent = (currentVideoBytes / 1024**2).toFixed(1) + ' МБ';

      // Toggle button
      const toggleBtn = qEl('ct-toggle');
      if (toggleBtn) {
        toggleBtn.classList.toggle('active', noFreeLimit);
        toggleBtn.textContent = noFreeLimit ? '✓ Без лимита' : 'Без лимита';
      }

      // Progress
      const usedGB = bytesToGB(totalBytes);
      const pct = Math.min(100, (usedGB / FREE_LIMIT_GB) * 100);
      const isOver = usedGB >= FREE_LIMIT_GB;
      const bar = qEl('ct-bar');
      bar.style.width = pct.toFixed(1) + '%';
      bar.className = 'ct-bar' + (isOver ? ' over' : '');
      qEl('ct-pct').textContent = pct.toFixed(1) + '%';
      const statusEl = qEl('ct-status');
      if (isOver) {
        statusEl.textContent = `Перерасход: ${(usedGB - FREE_LIMIT_GB).toFixed(2)} ГБ → платная зона`;
        statusEl.style.color = '#D63030';
      } else {
        statusEl.textContent = `Бесплатно ещё ${(FREE_LIMIT_GB - usedGB).toFixed(2)} ГБ`;
        statusEl.style.color = '#1E7E34';
      }

      // Quality chips
      if (duration > 0) {
        qEl('ct-qual-section').style.display = '';
        qEl('ct-no-video').style.display = 'none';

        const currentLabel = getCurrentQualityLabel();
        const avail = availableQualities();
        const chips = qEl('ct-chips');

        // Only rebuild chips if qualities changed (avoid flicker)
        const existingLabels = [...chips.querySelectorAll('.ct-chip')].map(c => c.dataset.label).join(',');
        const newLabels = avail.map(q => q.label).join(',');
        if (existingLabels !== newLabels) {
          chips.innerHTML = '';
          avail.forEach(({ label, mbps }, i) => {
            const bytes = estimateBytes(mbps, duration);
            const rawCost = calcRawCost(bytes);
            const col = QUALITY_COLORS[i] || QUALITY_COLORS[QUALITY_COLORS.length - 1];

            const chip = document.createElement('div');
            chip.className = 'ct-chip' + (label === currentLabel ? ' ct-chip-active' : '');
            chip.dataset.label = label;
            chip.style.background = col.bg;
            chip.style.color = col.text;
            chip.style.borderColor = col.border;
            chip.innerHTML = `<span class="ct-chip-q">${label}</span><span class="ct-chip-p">${ceilRub(rawCost)}</span>`;

            chip.addEventListener('click', () => {
              setQuality(label);
              // Update active state immediately
              chips.querySelectorAll('.ct-chip').forEach(c => c.classList.remove('ct-chip-active'));
              chip.classList.add('ct-chip-active');
              // Update "итого" block
              qEl('ct-video-total').textContent = ceilRub(rawCost);
              qEl('ct-video-q').textContent = 'при ' + label;
            });

            chips.appendChild(chip);
          });
        } else {
          // Just update active state
          chips.querySelectorAll('.ct-chip').forEach(c => {
            c.classList.toggle('ct-chip-active', c.dataset.label === currentLabel);
          });
        }

        // "Итого за ролик"
        if (currentLabel) {
          const qData = QUALITIES.find(q => q.label === currentLabel);
          if (qData) {
            const videoBytes = estimateBytes(qData.mbps, duration);
            qEl('ct-video-total').textContent = ceilRub(calcRawCost(videoBytes));
            qEl('ct-video-q').textContent = 'при ' + currentLabel;
          }
        } else {
          qEl('ct-video-total').textContent = '—';
          qEl('ct-video-q').textContent = 'ожидание...';
        }
      } else {
        qEl('ct-qual-section').style.display = 'none';
        qEl('ct-no-video').style.display = '';
        qEl('ct-video-total').textContent = '—';
        qEl('ct-video-q').textContent = 'нет видео';
      }
    });
  }

  // ── Insert BEFORE iron-selector#chips ────────────────────────────
  function insertBoard() {
    if (qEl('ct-board')) { renderBoard(); return; }

    function tryInsert() {
      // Primary target: the ytd-item-section-renderer containing iron-selector#chips
      const ironSel = document.querySelector('iron-selector#chips');
      if (ironSel) {
        let node = ironSel;
        while (node && node.tagName !== 'YTD-ITEM-SECTION-RENDERER') node = node.parentElement;
        if (node && node.parentElement) {
          injectCSS();
          node.parentElement.insertBefore(createBoard(), node);
          return true;
        }
        // fallback: before yt-related-chip-cloud-renderer
        let node2 = ironSel;
        while (node2 && node2.tagName !== 'YT-RELATED-CHIP-CLOUD-RENDERER') node2 = node2.parentElement;
        if (node2 && node2.parentElement) {
          injectCSS();
          node2.parentElement.insertBefore(createBoard(), node2);
          return true;
        }
      }
      // Last resort: top of #secondary-inner
      const sec = document.querySelector('#secondary-inner');
      if (sec && sec.firstChild) {
        injectCSS();
        sec.insertBefore(createBoard(), sec.firstChild);
        return true;
      }
      return false;
    }

    if (!tryInsert()) {
      const check = setInterval(() => {
        if (tryInsert()) { clearInterval(check); startUpdates(); }
      }, 500);
      setTimeout(() => clearInterval(check), 20000);
      return;
    }
    startUpdates();
  }

  function startUpdates() {
    renderBoard();
    if (boardInterval) clearInterval(boardInterval);
    boardInterval = setInterval(renderBoard, 1000);
  }

  // ── Navigation ────────────────────────────────────────────────────
  function watchNav() {
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        currentVideoBytes = 0;
        maxVideoHeight = 0;
        if (boardInterval) clearInterval(boardInterval);
        qEl('ct-board')?.remove();
        setTimeout(init, 1500);
      }
    }).observe(document.body, { subtree: true, childList: true });
  }

  function init() {
    if (!location.href.includes('/watch')) return;
    startTracking();
    insertBoard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => { init(); watchNav(); });
  } else {
    init();
    watchNav();
  }
})();
