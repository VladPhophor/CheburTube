# CheburTube

A Chrome extension that calculates the cost of watching YouTube videos in Russian rubles, based on the traffic pricing model proposed by the Russian Ministry of Digital Development (Mintsifry) in March 2026: 15 GB of international traffic per month at no charge, with each additional gigabyte billed at 150 ₽.

The extension makes an abstract regulatory proposal concrete and personal — showing the real monetary cost of each video, each quality setting, and each session.

---

## Installation

CheburTube is not listed on the Chrome Web Store. Installation is manual.

**Requirements:** Google Chrome or any Chromium-based browser.

1. Download this repository:
   - Click **Code → Download ZIP** and extract, or
   - Run `git clone https://github.com/VladPhophor/CheburTube.git`

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable **Developer mode** using the toggle in the top-right corner.

4. Click **Load unpacked** and select the `CheburTube` folder (the directory containing `manifest.json`).

5. Open any video on YouTube. The panel will appear in the right sidebar, above the recommended videos.

---

## What it shows

| Field | Description |
|---|---|
| **Всего потрачено** | Cumulative cost, accounting for the 15 GB free tier |
| **Абсолютный расход** | Total cost without any free allowance |
| **Реалтайм** | Cost of bytes downloaded during the current viewing session |
| **Итого за ролик** | Estimated full cost of the current video at the active quality level |
| **Ежемесячный лимит** | Progress toward the 15 GB monthly threshold |
| **Стоимость по качеству** | Per-quality cost chips for the current video; the active quality is highlighted |

### Controls

- **Сбросить статистику** — Clears all accumulated traffic data from local storage
- **No free 15 GB** — Disables the free tier and bills from the first byte

---

## Pricing model

| Tier | Rate |
|---|---|
| First 15 GB / month | Free |
| Each additional GB | 150 ₽ |

This mirrors the proposal discussed by Mintsifry with mobile operators in late March 2026, intended to apply to international traffic on mobile networks.

---

## Technical notes

- All data is stored locally in `chrome.storage.local`. Nothing is sent to any server.
- Traffic is measured using the browser's `PerformanceObserver` API, tracking requests to `googlevideo.com` and `/videoplayback` endpoints.
- The extension responds to YouTube's single-page navigation events and automatically updates when moving between videos.
- The interface follows the active YouTube color scheme (light or dark).

---

## Author

- YouTube: [@ruwear](https://www.youtube.com/@ruwear)
- Telegram: [@ruw3ar](https://t.me/ruw3ar)
- Twitch: [ruwear](https://www.twitch.tv/ruwear)

---

## License

MIT
