// CheburTube v3 — content.js
// Notion × Y2K × Frutiger Aero design system
// White/black/grey + red accents

(() => {
  'use strict';

  const FREE_LIMIT_GB = 15;
  const FREE_LIMIT_BYTES = FREE_LIMIT_GB * 1024 ** 3;
  const PRICE_PER_GB = 150;

  // Qualities ordered high → low
  const QUALITIES = [
    { label: '2160p', mbps: 20.0 },
    { label: '1440p60', mbps: 14.0 },
    { label: '1440p', mbps: 10.0 },
    { label: '1080p60', mbps: 6.00 },
    { label: '1080p', mbps: 4.50 },
    { label: '720p60', mbps: 3.50 },
    { label: '720p', mbps: 2.50 },
    { label: '480p', mbps: 0.80 },
    { label: '360p', mbps: 0.50 },
    { label: '240p', mbps: 0.25 },
    { label: '144p', mbps: 0.10 },
  ];

  // Notion-style color palette for quality tags (high→low gradient)
  const QUALITY_COLORS = [
    { bg: '#FFDDD2', text: '#C9321F', border: '#F5B8AC' }, // 2160p   — red
    { bg: '#FFE7D0', text: '#C96B1F', border: '#F5CFB0' }, // 1440p60 — orange
    { bg: '#FFF0C0', text: '#B58B00', border: '#EDD980' }, // 1440p   — yellow
    { bg: '#E8F5E0', text: '#2D7A2D', border: '#B8DDA0' }, // 1080p60 — green
    { bg: '#E0F0E8', text: '#1E6E52', border: '#A0D4BA' }, // 1080p   — teal
    { bg: '#E0EEF8', text: '#2058A0', border: '#A0C8E8' }, // 720p60  — blue
    { bg: '#EAE8F8', text: '#4A3A9A', border: '#C0B8E8' }, // 720p    — purple
    { bg: '#F5E8F8', text: '#7A3A8A', border: '#DAAAE0' }, // 480p    — violet
    { bg: '#F8E8F0', text: '#8A3A60', border: '#E0A8C0' }, // 360p    — pink
    { bg: '#F0F0F0', text: '#606060', border: '#D0D0D0' }, // 240p    — grey
    { bg: '#E8E8E8', text: '#808080', border: '#C8C8C8' }, // 144p    — light grey
  ];

  let currentVideoBytes = 0;
  let boardInterval = null;
  let noFreeLimit = false; // toggle: ignore free 15GB

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
    const paidGB = Math.max(0, gb - FREE_LIMIT_GB);
    return paidGB * PRICE_PER_GB;
  }

  // Стоимость ролика — абсолютная (без учёта лимита, просто сколько стоит)
  function calcRawCost(bytes) {
    return bytesToGB(bytes) * PRICE_PER_GB;
  }

  function ceilRub(cost) {
    if (cost <= 0) return '0 ₽';
    return Math.ceil(cost) + ' ₽';
  }

  function estimateBytes(mbps, durationSec) {
    return (mbps * 1_000_000 / 8) * durationSec;
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

  // ── DOM helpers ───────────────────────────────────────────────────
  function q(id) { return document.getElementById(id); }
  function qs(sel) { return document.querySelector(sel); }

  // ── Inject CSS ────────────────────────────────────────────────────
  function injectCSS() {
    if (q('ct-styles')) return;
    const s = document.createElement('style');
    s.id = 'ct-styles';
    s.textContent = `
      /* ══ CheburTube v3 — Notion × Y2K × Frutiger Aero ══ */
      #ct-board {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #FFFFFF;
        border: 1px solid #E5E5E5;
        border-radius: 12px;
        overflow: hidden;
        margin: 0 0 12px 0;
        width: 100%;
        color: #1A1A1A;
        box-shadow:
          0 1px 3px rgba(0,0,0,0.06),
          0 4px 16px rgba(0,0,0,0.04),
          inset 0 0 0 1px rgba(255,255,255,0.8);
      }

      /* Header */
      .ct-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 10px 14px 9px;
        border-bottom: 1px solid #F0F0F0;
        background: linear-gradient(180deg, #FAFAFA 0%, #F5F5F5 100%);
      }
      .ct-name {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: -0.3px;
        color: #111;
      }
      .ct-dots {
        display: flex;
        gap: 5px;
        align-items: center;
      }
      .ct-dot {
        width: 11px; height: 11px;
        border-radius: 50%;
        box-shadow: inset 0 1px 1px rgba(255,255,255,0.5), 0 1px 2px rgba(0,0,0,0.2);
      }
      .ct-dot-r { background: radial-gradient(circle at 35% 35%, #FF7A6E, #E0443A); }
      .ct-dot-y { background: radial-gradient(circle at 35% 35%, #FFD062, #E0A01A); }
      .ct-dot-g { background: radial-gradient(circle at 35% 35%, #66D166, #2AA82A); }

      /* Stats row */
      .ct-stats {
        display: grid;
        grid-template-columns: 1fr 1fr 1fr 1fr;
        border-bottom: 1px solid #F0F0F0;
      }
      .ct-stat {
        padding: 10px 12px;
        border-right: 1px solid #F0F0F0;
        min-width: 0;
      }
      .ct-stat:last-child { border-right: none; }
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
        font-size: 16px;
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
      .ct-val-red { color: #D63030 !important; }
      .ct-val-green { color: #1E7E34 !important; }

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
      .ct-prog-pct {
        font-size: 9px;
        font-weight: 700;
        color: #555;
        font-variant-numeric: tabular-nums;
      }
      .ct-track {
        height: 6px;
        background: #F0F0F0;
        border-radius: 3px;
        overflow: hidden;
        position: relative;
      }
      .ct-bar {
        height: 100%;
        border-radius: 3px;
        background: linear-gradient(90deg, #4CAF50, #81C784);
        transition: width 0.5s ease;
      }
      .ct-bar.over { background: linear-gradient(90deg, #D63030, #FF6B6B); }
      .ct-prog-status {
        font-size: 9px;
        color: #888;
        margin-top: 4px;
        font-weight: 500;
      }

      /* Quality chips */
      .ct-qual-wrap {
        padding: 10px 14px;
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
      .ct-chips {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
      }
      .ct-chip {
        display: inline-flex;
        flex-direction: column;
        align-items: flex-start;
        padding: 4px 8px;
        border-radius: 6px;
        border: 1px solid;
        font-size: 10px;
        font-weight: 600;
        line-height: 1.3;
        white-space: nowrap;
      }
      .ct-chip-q {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.3px;
        opacity: 0.7;
      }
      .ct-chip-p {
        font-size: 12px;
        font-weight: 800;
        letter-spacing: -0.3px;
      }

      /* Footer */
      .ct-foot {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        background: #FAFAFA;
        border-top: 1px solid #F0F0F0;
        gap: 6px;
        flex-wrap: wrap;
      }
      .ct-btns {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
      }
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
      .ct-btn-reset {
        background: #fff;
        color: #555;
        border-color: #DDD;
      }
      .ct-btn-reset:hover { background: #F5F5F5; border-color: #CCC; }
      .ct-btn-toggle {
        background: #fff;
        color: #D63030;
        border-color: #FFCCCC;
      }
      .ct-btn-toggle:hover { background: #FFF0F0; }
      .ct-btn-toggle.active {
        background: #D63030;
        color: #fff;
        border-color: #D63030;
      }
      .ct-socials {
        display: flex;
        gap: 4px;
      }
      .ct-soc {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px; height: 22px;
        border-radius: 5px;
        background: #fff;
        border: 1px solid #E5E5E5;
        font-size: 9px;
        font-weight: 800;
        text-decoration: none;
        color: #555;
        letter-spacing: 0.3px;
        transition: all 0.12s;
      }
      .ct-soc:hover { border-color: #D63030; color: #D63030; background: #FFF5F5; }

      /* No-video placeholder */
      .ct-no-video {
        padding: 12px 14px;
        font-size: 11px;
        color: #BBB;
        text-align: center;
        border-bottom: 1px solid #F0F0F0;
      }
    `;
    document.head.appendChild(s);
  }

  // ── Build board HTML ──────────────────────────────────────────────
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
          <div class="ct-stat-val ct-val-red" id="ct-abs">0 ₽</div>
          <div class="ct-stat-sub">без учёта лимита</div>
        </div>
        <div class="ct-stat">
          <div class="ct-stat-lbl">Реалтайм · сейчас</div>
          <div class="ct-stat-val" id="ct-live">0 ₽</div>
          <div class="ct-stat-sub" id="ct-live-mb">0 МБ</div>
        </div>
        <div class="ct-stat">
          <div class="ct-stat-lbl">Итого за ролик</div>
          <div class="ct-stat-val ct-val-red" id="ct-video-total">—</div>
          <div class="ct-stat-sub" id="ct-video-q">выбор качества</div>
        </div>
      </div>

      <div class="ct-prog-wrap">
        <div class="ct-prog-row">
          <span class="ct-prog-lbl">Ежемесячный лимит · 15 ГБ</span>
          <span class="ct-prog-pct" id="ct-pct">0%</span>
        </div>
        <div class="ct-track">
          <div class="ct-bar" id="ct-bar" style="width:0%"></div>
        </div>
        <div class="ct-prog-status" id="ct-status">Бесплатно ещё 15,00 ГБ</div>
      </div>

      <div id="ct-qual-section" class="ct-qual-wrap" style="display:none">
        <div class="ct-qual-lbl">Стоимость по качеству</div>
        <div class="ct-chips" id="ct-chips"></div>
      </div>

      <div id="ct-no-video" class="ct-no-video">Откройте видео для расчёта стоимости</div>

      <div class="ct-foot">
        <div class="ct-btns">
          <button class="ct-btn ct-btn-reset" id="ct-reset">Сбросить статистику</button>
          <button class="ct-btn ct-btn-toggle" id="ct-toggle-limit">Без лимита</button>
        </div>
        <div class="ct-socials">
          <a class="ct-soc" href="https://www.youtube.com/@ruwear" target="_blank">Yt</a>
          <a class="ct-soc" href="https://t.me/ruw3ar" target="_blank">Tg</a>
          <a class="ct-soc" href="https://www.twitch.tv/ruwear" target="_blank">Tw</a>
        </div>
      </div>
    `;

    // Reset button
    div.querySelector('#ct-reset').addEventListener('click', () => {
      if (confirm('Сбросить всю статистику трафика?')) {
        chrome.storage.local.set({ totalBytes: 0 }, () => {
          currentVideoBytes = 0;
          renderBoard();
        });
      }
    });

    // Toggle free limit
    div.querySelector('#ct-toggle-limit').addEventListener('click', () => {
      noFreeLimit = !noFreeLimit;
      chrome.storage.local.set({ noFreeLimit });
      div.querySelector('#ct-toggle-limit').classList.toggle('active', noFreeLimit);
      div.querySelector('#ct-toggle-limit').textContent = noFreeLimit ? '✓ Без лимита' : 'Без лимита';
      renderBoard();
    });

    return div;
  }

  // ── Render ────────────────────────────────────────────────────────
  function renderBoard() {
    const board = q('ct-board');
    if (!board) return;

    const video = qs('video');
    const duration = video ? (video.duration || 0) : 0;

    getTotalBytes((totalBytes) => {
      // ── Stats ──
      const spent = calcCost(totalBytes, noFreeLimit);
      const absSpent = calcRawCost(totalBytes);
      const liveRaw = calcRawCost(currentVideoBytes);

      q('ct-spent').textContent = ceilRub(spent);
      q('ct-spent-gb').textContent = bytesToGB(totalBytes).toFixed(3) + ' ГБ';
      q('ct-abs').textContent = ceilRub(absSpent);
      q('ct-live').textContent = ceilRub(liveRaw);
      q('ct-live-mb').textContent = (currentVideoBytes / 1024**2).toFixed(1) + ' МБ';

      // ── Toggle button state ──
      const toggleBtn = q('ct-toggle-limit');
      if (toggleBtn) {
        toggleBtn.classList.toggle('active', noFreeLimit);
        toggleBtn.textContent = noFreeLimit ? '✓ Без лимита' : 'Без лимита';
      }

      // ── Progress ──
      const usedGB = bytesToGB(totalBytes);
      const pct = Math.min(100, (usedGB / FREE_LIMIT_GB) * 100);
      const isOver = usedGB >= FREE_LIMIT_GB;
      const bar = q('ct-bar');
      bar.style.width = pct.toFixed(1) + '%';
      bar.className = 'ct-bar' + (isOver ? ' over' : '');
      q('ct-pct').textContent = pct.toFixed(1) + '%';
      const freeLeft = Math.max(0, FREE_LIMIT_GB - usedGB);
      if (isOver) {
        const over = (usedGB - FREE_LIMIT_GB).toFixed(2);
        q('ct-status').textContent = `Перерасход: ${over} ГБ → платная зона`;
        q('ct-status').style.color = '#D63030';
      } else {
        q('ct-status').textContent = `Бесплатно ещё ${freeLeft.toFixed(2)} ГБ`;
        q('ct-status').style.color = '#1E7E34';
      }

      // ── Quality chips ──
      if (duration > 0) {
        q('ct-qual-section').style.display = '';
        q('ct-no-video').style.display = 'none';

        const chips = q('ct-chips');
        chips.innerHTML = '';

        QUALITIES.forEach(({ label, mbps }, i) => {
          const bytes = estimateBytes(mbps, duration);
          const rawCost = calcRawCost(bytes);
          const col = QUALITY_COLORS[i] || QUALITY_COLORS[QUALITY_COLORS.length - 1];

          const chip = document.createElement('div');
          chip.className = 'ct-chip';
          chip.style.background = col.bg;
          chip.style.color = col.text;
          chip.style.borderColor = col.border;
          chip.innerHTML = `
            <span class="ct-chip-q">${label}</span>
            <span class="ct-chip-p">${ceilRub(rawCost)}</span>
          `;
          chips.appendChild(chip);
        });

        // "Итого за ролик" — берём текущее выбранное качество из плеера
        // Смотрим на <video> высоту как прокси для качества
        const videoEl = qs('video');
        let currentQ = null;
        if (videoEl) {
          const h = videoEl.videoHeight;
          if (h >= 2160) currentQ = '2160p';
          else if (h >= 1440) currentQ = '1440p';
          else if (h >= 1080) currentQ = '1080p';
          else if (h >= 720) currentQ = '720p';
          else if (h >= 480) currentQ = '480p';
          else if (h >= 360) currentQ = '360p';
          else if (h >= 240) currentQ = '240p';
          else if (h > 0) currentQ = '144p';
        }

        if (currentQ) {
          const q_data = QUALITIES.find(q => q.label === currentQ || q.label === currentQ + '60');
          if (q_data) {
            const videoBytes = estimateBytes(q_data.mbps, duration);
            q('ct-video-total').textContent = ceilRub(calcRawCost(videoBytes));
            q('ct-video-q').textContent = 'при ' + currentQ;
          }
        } else {
          q('ct-video-total').textContent = '—';
          q('ct-video-q').textContent = 'ожидание...';
        }
      } else {
        q('ct-qual-section').style.display = 'none';
        q('ct-no-video').style.display = '';
        q('ct-video-total').textContent = '—';
        q('ct-video-q').textContent = 'нет видео';
      }
    });
  }

  // ── Insert board ABOVE iron-selector#chips ────────────────────────
  function insertBoard() {
    if (q('ct-board')) {
      renderBoard();
      return;
    }

    // Target: iron-selector#chips inside yt-chip-cloud-renderer
    // We need to insert BEFORE the ytd-item-section-renderer that contains it
    // OR directly before the yt-chip-cloud-renderer wrapper

    function tryInsert() {
      // Strategy 1: find iron-selector#chips → go up to ytd-item-section-renderer → insert before it
      const ironSel = qs('iron-selector#chips');
      if (ironSel) {
        // Walk up to find ytd-item-section-renderer (the whole chips block)
        let target = ironSel;
        while (target && target.tagName !== 'YTD-ITEM-SECTION-RENDERER') {
          target = target.parentElement;
        }
        if (target && target.parentElement) {
          injectCSS();
          const board = createBoard();
          target.parentElement.insertBefore(board, target);
          return true;
        }

        // Strategy 2: insert before yt-related-chip-cloud-renderer
        let target2 = ironSel;
        while (target2 && target2.tagName !== 'YT-RELATED-CHIP-CLOUD-RENDERER') {
          target2 = target2.parentElement;
        }
        if (target2 && target2.parentElement) {
          injectCSS();
          const board = createBoard();
          target2.parentElement.insertBefore(board, target2);
          return true;
        }
      }

      // Strategy 3: insert before #scroll-container inside yt-chip-cloud-renderer
      const scrollContainer = qs('yt-chip-cloud-renderer #scroll-container');
      if (scrollContainer) {
        const cloudRenderer = scrollContainer.closest('yt-chip-cloud-renderer');
        if (cloudRenderer) {
          const outerSection = cloudRenderer.closest('ytd-item-section-renderer');
          if (outerSection && outerSection.parentElement) {
            injectCSS();
            const board = createBoard();
            outerSection.parentElement.insertBefore(board, outerSection);
            return true;
          }
          // fallback: insert before cloudRenderer itself
          if (cloudRenderer.parentElement) {
            injectCSS();
            const board = createBoard();
            cloudRenderer.parentElement.insertBefore(board, cloudRenderer);
            return true;
          }
        }
      }

      // Strategy 4: #secondary-inner first child
      const secondary = qs('#secondary-inner');
      if (secondary && secondary.firstChild) {
        injectCSS();
        const board = createBoard();
        secondary.insertBefore(board, secondary.firstChild);
        return true;
      }

      return false;
    }

    if (!tryInsert()) {
      // Wait and retry
      const check = setInterval(() => {
        if (tryInsert()) {
          clearInterval(check);
          startBoardUpdates();
        }
      }, 500);
      setTimeout(() => clearInterval(check), 20000);
      return;
    }

    startBoardUpdates();
  }

  function startBoardUpdates() {
    renderBoard();
    if (boardInterval) clearInterval(boardInterval);
    boardInterval = setInterval(renderBoard, 1000);
  }

  // ── Navigation watcher ────────────────────────────────────────────
  function watchNav() {
    let lastUrl = location.href;
    new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        currentVideoBytes = 0;
        if (boardInterval) clearInterval(boardInterval);
        q('ct-board')?.remove();
        setTimeout(init, 1500);
      }
    }).observe(document.body, { subtree: true, childList: true });
  }

  // ── Init ──────────────────────────────────────────────────────────
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
