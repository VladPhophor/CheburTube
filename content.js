// CheburTube v7 — content.js

(() => {
  'use strict';

  const FREE_LIMIT_GB = 15;
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

  // Light theme chip colors (Notion-style)
  const CHIP_LIGHT = [
    { bg: '#FFDDD2', text: '#C9321F', border: '#F5B8AC' },
    { bg: '#FFE7D0', text: '#C96B1F', border: '#F5CFB0' },
    { bg: '#FFF0C0', text: '#B58B00', border: '#EDD980' },
    { bg: '#E8F5E0', text: '#2D7A2D', border: '#B8DDA0' },
    { bg: '#E0EEF8', text: '#2058A0', border: '#A0C8E8' },
    { bg: '#EAE8F8', text: '#4A3A9A', border: '#C0B8E8' },
    { bg: '#F0F0F0', text: '#606060', border: '#D0D0D0' },
    { bg: '#E8E8E8', text: '#808080', border: '#C8C8C8' },
  ];

  // Dark theme chip colors (Notion dark palette equivalents)
  const CHIP_DARK = [
    { bg: '#522018', text: '#FF8A7A', border: '#7A3028' },
    { bg: '#4A2D14', text: '#FFA060', border: '#6A4020' },
    { bg: '#3D3010', text: '#E8C840', border: '#5A4818' },
    { bg: '#1A3020', text: '#60C880', border: '#284838' },
    { bg: '#162840', text: '#60A8E8', border: '#203858' },
    { bg: '#201840', text: '#9080E8', border: '#302858' },
    { bg: '#282828', text: '#A0A0A0', border: '#383838' },
    { bg: '#202020', text: '#808080', border: '#303030' },
  ];

  let currentVideoBytes = 0;
  let boardInterval = null;
  let noFreeLimit = false;
  let perfObserver = null;
  let isDark = false;
  let sidebarObserver = null; // watches for board removal
  let lastUrl = '';
  let navCooldown = false;

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
  function calcRaw(bytes) { return bytesToGB(bytes) * PRICE_PER_GB; }
  function ceilRub(c) { return c <= 0 ? '0 ₽' : Math.ceil(c) + ' ₽'; }
  function estBytes(mbps, dur) { return (mbps * 1e6 / 8) * dur; }

  // ── Theme ─────────────────────────────────────────────────────────
  function detectDark() {
    isDark = document.documentElement.hasAttribute('dark') ||
             document.documentElement.getAttribute('data-youtube-color-scheme') === 'dark';
    return isDark;
  }

  function applyTheme() {
    const b = document.getElementById('ct-board');
    if (b) b.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  function watchTheme() {
    new MutationObserver(() => { const was = isDark; detectDark(); if (was !== isDark) { applyTheme(); rebuildChips(); } })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['dark', 'data-youtube-color-scheme'] });
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

  // ── Current quality ───────────────────────────────────────────────
  function getCurrentQ() {
    try {
      const p = document.getElementById('movie_player');
      if (p && typeof p.getPlaybackQuality === 'function') {
        const m = { hd2160:'2160p', hd1440:'1440p', hd1080:'1080p', hd720:'720p', large:'480p', medium:'360p', small:'240p', tiny:'144p' };
        const q = m[p.getPlaybackQuality()];
        if (q) return q;
      }
    } catch (_) {}
    const v = document.querySelector('video');
    if (!v || !v.videoHeight) return null;
    const h = v.videoHeight;
    if (h >= 2160) return '2160p'; if (h >= 1440) return '1440p';
    if (h >= 1080) return '1080p'; if (h >= 720)  return '720p';
    if (h >= 480)  return '480p';  if (h >= 360)  return '360p';
    if (h >= 240)  return '240p';  return '144p';
  }

  // ── CSS ───────────────────────────────────────────────────────────
  function injectCSS() {
    if (document.getElementById('ct-styles')) return;
    const s = document.createElement('style');
    s.id = 'ct-styles';
    s.textContent = `
      #ct-board {
        --bg:#FFF; --bg2:#FAFAFA; --border:#E5E5E5; --border2:#F0F0F0;
        --text:#1A1A1A; --text2:#999; --text3:#BBB;
        --shadow:rgba(0,0,0,0.06); --shadow2:rgba(0,0,0,0.04);
        --red:#D63030; --green:#1E7E34;
        --bar-ok:linear-gradient(90deg,#4CAF50,#81C784);
        --bar-over:linear-gradient(90deg,#D63030,#FF6B6B);
        --btn-bg:#FFF; --btn-text:#555; --btn-border:#DDD;
      }
      #ct-board[data-theme="dark"] {
        --bg:#0F0F0F; --bg2:#1A1A1A; --border:#2E2E2E; --border2:#242424;
        --text:#F1F1F1; --text2:#717171; --text3:#505050;
        --shadow:rgba(0,0,0,0.3); --shadow2:rgba(0,0,0,0.2);
        --red:#FF5555; --green:#4CAF50;
        --btn-bg:#2E2E2E; --btn-text:#AAA; --btn-border:#3E3E3E;
      }
      #ct-board {
        font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
        background:var(--bg); border:1px solid var(--border); border-radius:12px;
        overflow:hidden; margin:0 0 12px 0; width:100%; color:var(--text);
        box-shadow:0 1px 3px var(--shadow),0 4px 16px var(--shadow2);
        transition:background .2s,border-color .2s;
      }
      .ct-hdr {
        display:flex; align-items:center; justify-content:space-between;
        padding:9px 14px 8px; border-bottom:1px solid var(--border2); background:var(--bg2);
      }
      .ct-name { font-size:13px; font-weight:700; letter-spacing:-.3px; color:var(--text); }
      .ct-dots { display:flex; gap:5px; align-items:center; }
      .ct-dot { width:11px; height:11px; border-radius:50%; box-shadow:inset 0 1px 1px rgba(255,255,255,.4),0 1px 2px rgba(0,0,0,.25); }
      .ct-dot-r { background:radial-gradient(circle at 35% 35%,#FF7A6E,#E0443A); }
      .ct-dot-y { background:radial-gradient(circle at 35% 35%,#FFD062,#E0A01A); }
      .ct-dot-g { background:radial-gradient(circle at 35% 35%,#66D166,#2AA82A); }
      .ct-stats { display:grid; grid-template-columns:1fr 1fr; }
      .ct-stat { padding:9px 12px; border-right:1px solid var(--border2); border-bottom:1px solid var(--border2); min-width:0; }
      .ct-stat:nth-child(2) { border-right:none; }
      .ct-stat:nth-child(3) { border-bottom:none; }
      .ct-stat:nth-child(4) { border-right:none; border-bottom:none; }
      .ct-stat-lbl { font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:var(--text2); font-weight:600; margin-bottom:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .ct-stat-val { font-size:17px; font-weight:800; letter-spacing:-.5px; color:var(--text); line-height:1.1; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .ct-stat-sub { font-size:9px; color:var(--text3); margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .ct-red { color:var(--red) !important; }
      .ct-prog-wrap { padding:8px 14px; border-bottom:1px solid var(--border2); }
      .ct-prog-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; }
      .ct-prog-lbl { font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:var(--text2); font-weight:600; }
      .ct-prog-pct { font-size:9px; font-weight:700; color:var(--text2); }
      .ct-track { height:6px; background:var(--border); border-radius:3px; overflow:hidden; }
      .ct-bar { height:100%; border-radius:3px; background:var(--bar-ok); transition:width .5s ease; }
      .ct-bar.over { background:var(--bar-over); }
      .ct-prog-status { font-size:9px; margin-top:4px; font-weight:500; }
      .ct-qual-wrap { padding:9px 14px; border-bottom:1px solid var(--border2); }
      .ct-qual-lbl { font-size:9px; text-transform:uppercase; letter-spacing:.7px; color:var(--text2); font-weight:600; margin-bottom:7px; }
      .ct-chips { display:flex; flex-wrap:wrap; gap:5px; }
      .ct-chip { display:inline-flex; flex-direction:column; align-items:flex-start; padding:5px 9px; border-radius:7px; border:1px solid; user-select:none; transition:box-shadow .12s; }
      .ct-chip.ct-active { outline:2px solid var(--text); outline-offset:1px; box-shadow:0 2px 8px rgba(0,0,0,.12); }
      .ct-chip-q { font-size:9px; font-weight:700; letter-spacing:.3px; opacity:.65; }
      .ct-chip-p { font-size:13px; font-weight:800; letter-spacing:-.3px; }
      .ct-foot { display:flex; align-items:center; justify-content:space-between; padding:7px 12px; background:var(--bg2); border-top:1px solid var(--border2); gap:6px; flex-wrap:wrap; }
      .ct-btns { display:flex; gap:5px; flex-wrap:wrap; }
      .ct-btn { font-family:inherit; font-size:10px; font-weight:600; padding:4px 10px; border-radius:6px; border:1px solid; cursor:pointer; transition:all .12s; line-height:1.4; background:var(--btn-bg); color:var(--btn-text); border-color:var(--btn-border); }
      .ct-btn:hover { opacity:.8; }
      .ct-btn-tog { color:var(--red); border-color:color-mix(in srgb,var(--red) 35%,transparent); }
      .ct-btn-tog.on { background:var(--red); color:#fff; border-color:var(--red); }
      .ct-socials { display:flex; gap:4px; }
      .ct-soc { display:flex; align-items:center; justify-content:center; width:26px; height:22px; border-radius:5px; font-size:9px; font-weight:800; text-decoration:none; transition:all .15s; border:1px solid; }
      .ct-soc-yt  { color:#FF0000; border-color:rgba(255,0,0,.3); background:var(--btn-bg); }
      .ct-soc-tg  { color:#2AABEE; border-color:rgba(42,171,238,.3); background:var(--btn-bg); }
      .ct-soc-tw  { color:#9146FF; border-color:rgba(145,70,255,.3); background:var(--btn-bg); }
      .ct-soc-yt:hover  { background:#FF0000; color:#fff; border-color:#FF0000; }
      .ct-soc-tg:hover  { background:#2AABEE; color:#fff; border-color:#2AABEE; }
      .ct-soc-tw:hover  { background:#9146FF; color:#fff; border-color:#9146FF; }
      .ct-no-video { padding:12px 14px; font-size:11px; color:var(--text3); text-align:center; border-bottom:1px solid var(--border2); }
    `;
    document.head.appendChild(s);
  }

  // ── Build board DOM ───────────────────────────────────────────────
  function buildBoard() {
    const d = document.createElement('div');
    d.id = 'ct-board';
    d.innerHTML = `
      <div class="ct-hdr">
        <span class="ct-name">CheburTube</span>
        <div class="ct-dots">
          <div class="ct-dot ct-dot-r"></div>
          <div class="ct-dot ct-dot-y"></div>
          <div class="ct-dot ct-dot-g"></div>
        </div>
      </div>
      <div class="ct-stats">
        <div class="ct-stat"><div class="ct-stat-lbl">Всего потрачено</div><div class="ct-stat-val" id="ct-spent">0 ₽</div><div class="ct-stat-sub" id="ct-spent-gb">0 ГБ</div></div>
        <div class="ct-stat"><div class="ct-stat-lbl">Абсолютный расход</div><div class="ct-stat-val ct-red" id="ct-abs">0 ₽</div><div class="ct-stat-sub">без учёта лимита</div></div>
        <div class="ct-stat"><div class="ct-stat-lbl">Реалтайм · сейчас</div><div class="ct-stat-val" id="ct-live">0 ₽</div><div class="ct-stat-sub" id="ct-live-mb">0 МБ</div></div>
        <div class="ct-stat"><div class="ct-stat-lbl">Итого за ролик</div><div class="ct-stat-val ct-red" id="ct-vtot">—</div><div class="ct-stat-sub" id="ct-vq">ожидание...</div></div>
      </div>
      <div class="ct-prog-wrap">
        <div class="ct-prog-row"><span class="ct-prog-lbl">Ежемесячный лимит · 15 ГБ</span><span class="ct-prog-pct" id="ct-pct">0%</span></div>
        <div class="ct-track"><div class="ct-bar" id="ct-bar" style="width:0%"></div></div>
        <div class="ct-prog-status" id="ct-status">Бесплатно ещё 15,00 ГБ</div>
      </div>
      <div id="ct-qs" class="ct-qual-wrap" style="display:none">
        <div class="ct-qual-lbl">Стоимость по качеству</div>
        <div class="ct-chips" id="ct-chips"></div>
      </div>
      <div id="ct-novid" class="ct-no-video">Откройте видео — появится расчёт стоимости</div>
      <div class="ct-foot">
        <div class="ct-btns">
          <button class="ct-btn" id="ct-reset">Сбросить статистику</button>
          <button class="ct-btn ct-btn-tog" id="ct-tog">No free 15 GB</button>
        </div>
        <div class="ct-socials">
          <a class="ct-soc ct-soc-yt" href="https://www.youtube.com/@ruwear" target="_blank">Yt</a>
          <a class="ct-soc ct-soc-tg" href="https://t.me/ruw3ar" target="_blank">Tg</a>
          <a class="ct-soc ct-soc-tw" href="https://www.twitch.tv/ruwear" target="_blank">Tw</a>
        </div>
      </div>`;
    d.querySelector('#ct-reset').addEventListener('click', () => {
      if (confirm('Сбросить всю статистику трафика?')) {
        chrome.storage.local.set({ totalBytes: 0 }, () => { currentVideoBytes = 0; render(); });
      }
    });
    d.querySelector('#ct-tog').addEventListener('click', () => {
      noFreeLimit = !noFreeLimit;
      chrome.storage.local.set({ noFreeLimit });
      render();
    });
    return d;
  }

  // ── Rebuild chips (called on theme change) ────────────────────────
  function rebuildChips() {
    const chips = document.getElementById('ct-chips');
    if (!chips || !chips.dataset.built) return;
    chips.dataset.built = ''; // force rebuild on next render
    render();
  }

  // ── Render ────────────────────────────────────────────────────────
  function qel(id) { return document.getElementById(id); }

  function render() {
    if (!qel('ct-board')) return;
    applyTheme();
    const vid = document.querySelector('video');
    const dur = vid ? (vid.duration || 0) : 0;
    getTotalBytes((total) => {
      qel('ct-spent').textContent = ceilRub(calcCost(total, noFreeLimit));
      qel('ct-spent-gb').textContent = bytesToGB(total).toFixed(3) + ' ГБ';
      qel('ct-abs').textContent = ceilRub(calcRaw(total));
      qel('ct-live').textContent = ceilRub(calcRaw(currentVideoBytes));
      qel('ct-live-mb').textContent = (currentVideoBytes / 1024**2).toFixed(1) + ' МБ';

      const tog = qel('ct-tog');
      if (tog) { tog.classList.toggle('on', noFreeLimit); tog.textContent = noFreeLimit ? '✓ No free 15 GB' : 'No free 15 GB'; }

      const usedGB = bytesToGB(total);
      const pct = Math.min(100, (usedGB / FREE_LIMIT_GB) * 100);
      const over = usedGB >= FREE_LIMIT_GB;
      const bar = qel('ct-bar'); bar.style.width = pct.toFixed(1) + '%'; bar.className = 'ct-bar' + (over ? ' over' : '');
      qel('ct-pct').textContent = pct.toFixed(1) + '%';
      const st = qel('ct-status');
      if (over) { st.textContent = `Перерасход: ${(usedGB - FREE_LIMIT_GB).toFixed(2)} ГБ → платная зона`; st.style.color = 'var(--red)'; }
      else { st.textContent = `Бесплатно ещё ${(FREE_LIMIT_GB - usedGB).toFixed(2)} ГБ`; st.style.color = 'var(--green)'; }

      if (dur > 0) {
        qel('ct-qs').style.display = ''; qel('ct-novid').style.display = 'none';
        const curQ = getCurrentQ();
        const chips = qel('ct-chips');
        const palette = isDark ? CHIP_DARK : CHIP_LIGHT;
        if (!chips.dataset.built || chips.dataset.dur !== String(Math.round(dur))) {
          chips.dataset.built = '1'; chips.dataset.dur = String(Math.round(dur));
          chips.innerHTML = '';
          QUALITIES.forEach(({ label, mbps }, i) => {
            const col = palette[i] || palette[palette.length - 1];
            const bytes = estBytes(mbps, dur);
            const chip = document.createElement('div');
            chip.className = 'ct-chip' + (label === curQ ? ' ct-active' : '');
            chip.dataset.label = label;
            chip.style.cssText = `background:${col.bg};color:${col.text};border-color:${col.border}`;
            chip.innerHTML = `<span class="ct-chip-q">${label}</span><span class="ct-chip-p">${ceilRub(calcRaw(bytes))}</span>`;
            chips.appendChild(chip);
          });
        } else {
          chips.querySelectorAll('.ct-chip').forEach(c => c.classList.toggle('ct-active', c.dataset.label === curQ));
        }
        if (curQ) {
          const qd = QUALITIES.find(x => x.label === curQ);
          if (qd) { qel('ct-vtot').textContent = ceilRub(calcRaw(estBytes(qd.mbps, dur))); qel('ct-vq').textContent = 'при ' + curQ; }
        } else { qel('ct-vtot').textContent = '—'; qel('ct-vq').textContent = 'ожидание...'; }
      } else {
        qel('ct-qs').style.display = 'none'; qel('ct-novid').style.display = '';
        qel('ct-vtot').textContent = '—'; qel('ct-vq').textContent = 'нет видео';
      }
    });
  }

  // ── Find insertion point ──────────────────────────────────────────
  function getInsertPoint() {
    const iron = document.querySelector('iron-selector#chips');
    if (iron) {
      let n = iron;
      while (n && n.tagName !== 'YTD-ITEM-SECTION-RENDERER') n = n.parentElement;
      if (n && n.parentElement) return { parent: n.parentElement, before: n };
      let n2 = iron;
      while (n2 && n2.tagName !== 'YT-RELATED-CHIP-CLOUD-RENDERER') n2 = n2.parentElement;
      if (n2 && n2.parentElement) return { parent: n2.parentElement, before: n2 };
    }
    const sec = document.querySelector('#secondary-inner');
    if (sec && sec.firstChild) return { parent: sec, before: sec.firstChild };
    return null;
  }

  // ── Insert board ──────────────────────────────────────────────────
  function insertBoard() {
    if (qel('ct-board')) return true;
    const pt = getInsertPoint();
    if (!pt) return false;
    injectCSS(); detectDark();
    const board = buildBoard();
    pt.parent.insertBefore(board, pt.before);
    applyTheme();
    // Watch this container: if our board gets removed, re-insert it
    watchContainer(pt.parent);
    return true;
  }

  // ── KEY FIX: watch the sidebar container for board removal ────────
  // YouTube replaces children of #secondary-inner when navigating.
  // When ct-board disappears, we re-insert it immediately.
  function watchContainer(container) {
    if (sidebarObserver) sidebarObserver.disconnect();
    sidebarObserver = new MutationObserver(() => {
      if (!qel('ct-board') && location.href.includes('/watch')) {
        // Board was removed by YouTube — re-insert
        const pt = getInsertPoint();
        if (pt) {
          const board = buildBoard();
          pt.parent.insertBefore(board, pt.before);
          applyTheme();
          watchContainer(pt.parent);
          render();
        }
      }
    });
    sidebarObserver.observe(container, { childList: true });
  }

  // ── Start render loop ─────────────────────────────────────────────
  function startUpdates() {
    render();
    if (boardInterval) clearInterval(boardInterval);
    boardInterval = setInterval(render, 1000);
  }

  // ── Navigation ────────────────────────────────────────────────────
  function onNavigate() {
    if (navCooldown) return;
    navCooldown = true;
    setTimeout(() => { navCooldown = false; }, 800);

    const url = location.href;
    if (url === lastUrl) return;
    lastUrl = url;

    currentVideoBytes = 0;
    if (boardInterval) clearInterval(boardInterval);
    // Don't manually remove board — let the container observer handle it
    // and also try immediate re-insert for the new page

    if (!url.includes('/watch')) {
      qel('ct-board')?.remove();
      return;
    }

    startTracking();
    // Retry inserting until sidebar is ready
    let attempts = 0;
    const tryInsert = () => {
      attempts++;
      if (insertBoard()) { startUpdates(); }
      else if (attempts < 50) { setTimeout(tryInsert, 250); }
    };
    setTimeout(tryInsert, 300);
  }

  function watchNav() {
    // Title change — most reliable SPA signal
    const watchTitle = () => {
      const t = document.querySelector('title');
      if (t && !t._ctObs) {
        t._ctObs = true;
        new MutationObserver(() => onNavigate()).observe(t, { childList: true });
      }
    };
    watchTitle();
    new MutationObserver(watchTitle).observe(document.head || document.documentElement, { childList: true });

    // YouTube-specific events
    document.addEventListener('yt-navigate-finish', () => setTimeout(onNavigate, 200));
    document.addEventListener('yt-page-data-updated', () => setTimeout(onNavigate, 200));

    // popstate
    window.addEventListener('popstate', () => setTimeout(onNavigate, 300));

    // URL polling
    setInterval(() => { if (location.href !== lastUrl) onNavigate(); }, 500);
  }

  // ── Init ──────────────────────────────────────────────────────────
  function init() {
    lastUrl = location.href;
    startTracking();
    watchNav();
    watchTheme();

    if (location.href.includes('/watch')) {
      let attempts = 0;
      const tryInsert = () => {
        attempts++;
        if (insertBoard()) { startUpdates(); }
        else if (attempts < 50) { setTimeout(tryInsert, 250); }
      };
      tryInsert();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
