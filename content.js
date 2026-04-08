// CheburTube v5 — content.js

(() => {
  'use strict';

  const FREE_LIMIT_GB = 15;
  const FREE_LIMIT_BYTES = FREE_LIMIT_GB * 1024 ** 3;
  const PRICE_PER_GB = 150;

  const QUALITIES = [
    { label: '2160p', mbps: 20.0 },
    { label: '1440p', mbps: 10.0 },
    { label: '1080p', mbps: 4.50 },
    { label: '720p',  mbps: 2.50 },
    { label: '480p',  mbps: 0.80 },
    { label: '360p',  mbps: 0.50 },
    { label: '240p',  mbps: 0.25 },
    { label: '144p',  mbps: 0.10 },
  ];

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
  let perfObserver = null;

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

  // ── Byte tracking ─────────────────────────────────────────────────
  function startTracking() {
    if (perfObserver) { try { perfObserver.disconnect(); } catch (_) {} }
    if (!window.PerformanceObserver) return;
    perfObserver = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const url = e.name || '';
        if (url.includes('googlevideo.com') || url.includes('/videoplayback')) {
          const b = e.transferSize || 0;
          if (b > 0) { currentVideoBytes += b; saveBytes(b); }
        }
      }
    });
    try { perfObserver.observe({ entryTypes: ['resource'] }); } catch (_) {}
  }

  // ── Current quality label ─────────────────────────────────────────
  function getCurrentQualityLabel() {
    try {
      const player = document.getElementById('movie_player');
      if (player && typeof player.getPlaybackQuality === 'function') {
        const map = { hd2160:'2160p', hd1440:'1440p', hd1080:'1080p', hd720:'720p', large:'480p', medium:'360p', small:'240p', tiny:'144p' };
        return map[player.getPlaybackQuality()] || null;
      }
    } catch (_) {}
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

  // ── CSS ───────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('ct-styles')) return;
    const s = document.createElement('style');
    s.id = 'ct-styles';
    s.textContent = `
      #ct-board {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #FFF;
        border: 1px solid #E5E5E5;
        border-radius: 12px;
        overflow: hidden;
        margin: 0 0 12px 0;
        width: 100%;
        color: #1A1A1A;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
      }
      .ct-hdr {
        display: flex; align-items: center; justify-content: space-between;
        padding: 9px 14px 8px;
        border-bottom: 1px solid #F0F0F0;
        background: linear-gradient(180deg, #FAFAFA 0%, #F5F5F5 100%);
      }
      .ct-name { font-size: 13px; font-weight: 700; letter-spacing: -0.3px; color: #111; }
      .ct-dots { display: flex; gap: 5px; align-items: center; }
      .ct-dot {
        width: 11px; height: 11px; border-radius: 50%;
        box-shadow: inset 0 1px 1px rgba(255,255,255,0.5), 0 1px 2px rgba(0,0,0,0.2);
      }
      .ct-dot-r { background: radial-gradient(circle at 35% 35%, #FF7A6E, #E0443A); }
      .ct-dot-y { background: radial-gradient(circle at 35% 35%, #FFD062, #E0A01A); }
      .ct-dot-g { background: radial-gradient(circle at 35% 35%, #66D166, #2AA82A); }

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
        font-size: 9px; text-transform: uppercase; letter-spacing: 0.7px;
        color: #999; font-weight: 600; margin-bottom: 3px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .ct-stat-val {
        font-size: 17px; font-weight: 800; letter-spacing: -0.5px;
        color: #111; line-height: 1.1;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .ct-stat-sub {
        font-size: 9px; color: #BBB; margin-top: 2px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .ct-red { color: #D63030 !important; }

      .ct-prog-wrap { padding: 8px 14px; border-bottom: 1px solid #F0F0F0; }
      .ct-prog-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
      .ct-prog-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.7px; color: #999; font-weight: 600; }
      .ct-prog-pct { font-size: 9px; font-weight: 700; color: #555; }
      .ct-track { height: 6px; background: #F0F0F0; border-radius: 3px; overflow: hidden; }
      .ct-bar { height: 100%; border-radius: 3px; background: linear-gradient(90deg, #4CAF50, #81C784); transition: width 0.5s ease; }
      .ct-bar.over { background: linear-gradient(90deg, #D63030, #FF6B6B); }
      .ct-prog-status { font-size: 9px; color: #888; margin-top: 4px; font-weight: 500; }

      .ct-qual-wrap { padding: 9px 14px; border-bottom: 1px solid #F0F0F0; }
      .ct-qual-lbl { font-size: 9px; text-transform: uppercase; letter-spacing: 0.7px; color: #999; font-weight: 600; margin-bottom: 7px; }
      .ct-chips { display: flex; flex-wrap: wrap; gap: 5px; }
      .ct-chip {
        display: inline-flex; flex-direction: column; align-items: flex-start;
        padding: 5px 9px; border-radius: 7px; border: 1px solid;
        user-select: none;
        transition: box-shadow 0.12s;
      }
      .ct-chip.ct-chip-active {
        outline: 2px solid #1A1A1A;
        outline-offset: 1px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      }
      .ct-chip-q { font-size: 9px; font-weight: 700; letter-spacing: 0.3px; opacity: 0.65; }
      .ct-chip-p { font-size: 13px; font-weight: 800; letter-spacing: -0.3px; }

      .ct-foot {
        display: flex; align-items: center; justify-content: space-between;
        padding: 7px 12px; background: #FAFAFA; gap: 6px; flex-wrap: wrap;
      }
      .ct-btns { display: flex; gap: 5px; flex-wrap: wrap; }
      .ct-btn {
        font-family: inherit; font-size: 10px; font-weight: 600;
        padding: 4px 10px; border-radius: 6px; border: 1px solid;
        cursor: pointer; transition: all 0.12s; letter-spacing: 0.1px; line-height: 1.4;
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

  // ── Build board HTML ──────────────────────────────────────────────
  function buildBoardHTML() {
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
        <div class="ct-qual-lbl">Стоимость по качеству</div>
        <div class="ct-chips" id="ct-chips"></div>
      </div>
      <div id="ct-no-video" class="ct-no-video">Откройте видео — появится расчёт стоимости</div>
      <div class="ct-foot">
        <div class="ct-btns">
          <button class="ct-btn ct-btn-reset" id="ct-reset">Сбросить статистику</button>
          <button class="ct-btn ct-btn-toggle" id="ct-toggle">No free 15 GB</button>
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

  // ── Render ────────────────────────────────────────────────────────
  function renderBoard() {
    const board = qEl('ct-board');
    if (!board) return;

    const video = document.querySelector('video');
    const duration = video ? (video.duration || 0) : 0;

    getTotalBytes((totalBytes) => {
      // Stats
      qEl('ct-spent').textContent = ceilRub(calcCost(totalBytes, noFreeLimit));
      qEl('ct-spent-gb').textContent = bytesToGB(totalBytes).toFixed(3) + ' ГБ';
      qEl('ct-abs').textContent = ceilRub(calcRawCost(totalBytes));
      qEl('ct-live').textContent = ceilRub(calcRawCost(currentVideoBytes));
      qEl('ct-live-mb').textContent = (currentVideoBytes / 1024**2).toFixed(1) + ' МБ';

      // Toggle button
      const btn = qEl('ct-toggle');
      if (btn) {
        btn.classList.toggle('active', noFreeLimit);
        btn.textContent = noFreeLimit ? '✓ No free 15 GB' : 'No free 15 GB';
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
        const chips = qEl('ct-chips');

        // Build chips once (no re-render on every tick — only update active state)
        if (!chips.dataset.built) {
          chips.dataset.built = '1';
          chips.innerHTML = '';
          QUALITIES.forEach(({ label, mbps }, i) => {
            const bytes = estimateBytes(mbps, duration);
            const col = QUALITY_COLORS[i] || QUALITY_COLORS[QUALITY_COLORS.length - 1];
            const chip = document.createElement('div');
            chip.className = 'ct-chip';
            chip.dataset.label = label;
            chip.dataset.cost = ceilRub(calcRawCost(bytes));
            chip.style.background = col.bg;
            chip.style.color = col.text;
            chip.style.borderColor = col.border;
            chip.innerHTML = `<span class="ct-chip-q">${label}</span><span class="ct-chip-p">${ceilRub(calcRawCost(bytes))}</span>`;
            chips.appendChild(chip);
          });
        }

        // Update active chip highlight
        chips.querySelectorAll('.ct-chip').forEach(c => {
          c.classList.toggle('ct-chip-active', c.dataset.label === currentLabel);
        });

        // "Итого за ролик"
        if (currentLabel) {
          const qData = QUALITIES.find(q => q.label === currentLabel);
          if (qData) {
            qEl('ct-video-total').textContent = ceilRub(calcRawCost(estimateBytes(qData.mbps, duration)));
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

  // ── Find insertion point and insert board ─────────────────────────
  function getInsertionPoint() {
    // iron-selector#chips → walk up to ytd-item-section-renderer → insert before it
    const ironSel = document.querySelector('iron-selector#chips');
    if (ironSel) {
      let node = ironSel;
      while (node && node.tagName !== 'YTD-ITEM-SECTION-RENDERER') node = node.parentElement;
      if (node && node.parentElement) return { parent: node.parentElement, before: node };

      // fallback: before yt-related-chip-cloud-renderer
      let node2 = ironSel;
      while (node2 && node2.tagName !== 'YT-RELATED-CHIP-CLOUD-RENDERER') node2 = node2.parentElement;
      if (node2 && node2.parentElement) return { parent: node2.parentElement, before: node2 };
    }

    // Last resort: top of #secondary-inner
    const sec = document.querySelector('#secondary-inner');
    if (sec && sec.firstChild) return { parent: sec, before: sec.firstChild };

    return null;
  }

  function insertBoard() {
    // Board already exists — just make sure it's rendering
    if (qEl('ct-board')) { renderBoard(); return; }

    const pt = getInsertionPoint();
    if (!pt) return false;

    injectCSS();
    const board = buildBoardHTML();
    pt.parent.insertBefore(board, pt.before);
    return true;
  }

  function startUpdates() {
    renderBoard();
    if (boardInterval) clearInterval(boardInterval);
    boardInterval = setInterval(renderBoard, 1000);
  }

  // ── Navigation — key fix: watch for YouTube SPA transitions ───────
  // YouTube fires yt-navigate-finish when it fully loads a new page
  // We also watch for URL changes and ytd-page-manager mutations

  function onNavigate() {
    if (!location.href.includes('/watch')) return;

    currentVideoBytes = 0;

    // Remove old board if present (it may be stale from old page)
    qEl('ct-board')?.remove();

    // Restart tracker for new video
    startTracking();

    // Try to insert immediately, then retry if DOM not ready yet
    if (!insertBoard()) {
      const check = setInterval(() => {
        if (insertBoard()) { clearInterval(check); startUpdates(); }
      }, 400);
      setTimeout(() => clearInterval(check), 20000);
    } else {
      startUpdates();
    }
  }

  function watchNav() {
    // 1. YouTube's own navigation event (most reliable)
    window.addEventListener('yt-navigate-finish', () => {
      setTimeout(onNavigate, 300);
    });

    // 2. URL polling fallback (catches cases where yt-navigate-finish doesn't fire)
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        setTimeout(onNavigate, 500);
      }
    }, 500);

    // 3. popstate (back/forward)
    window.addEventListener('popstate', () => setTimeout(onNavigate, 500));
  }

  // ── Boot ──────────────────────────────────────────────────────────
  function init() {
    startTracking();
    watchNav();

    if (location.href.includes('/watch')) {
      // Initial load on a watch page
      if (!insertBoard()) {
        const check = setInterval(() => {
          if (insertBoard()) { clearInterval(check); startUpdates(); }
        }, 400);
        setTimeout(() => clearInterval(check), 20000);
      } else {
        startUpdates();
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
