# Egnyte Yoda 🌿

**Version 1.8.3**

A Chrome extension for Egnyte Sales Engineers and Customer Success Managers to fetch, compare, and track configuration data across multiple Egnyte customer domains — all from a single interface.

---

## Features

- **Multi-domain comparison** — Load any number of domains side-by-side in a scrollable comparison table
- **Sectioned data** — Configuration organized into six collapsible sections:
  - Basic Configuration, Features, Advanced / Infrastructure, Plans, Add-ons, Settings
- **Difference highlighting** — Cells that differ across domains are highlighted with per-section diff counts
- **Filter pills** — Quickly narrow the table to All, Basic, Features, Advanced, Plans, Add-ons, or Settings
- **Diffs Only toggle** — Instantly hide all matching rows and show only differences
- **Show Keys toggle** — Display backend field keys inline below human-readable labels
- **Live field search** — Instant filtering by field name, key, or value
- **Query tab** — Search across all loaded domains by key name and/or value with multiple condition operators
- **Version tracking** — Snapshots saved automatically when config changes; compare any two in the Domain Versions tab
- **Bulk import** — Paste a list of domains (newline or comma-separated) to load them all at once
- **CSV export** — Export the full comparison as `EgnyteYodaCompare-[domain1]-[domain2].csv`
- **Full-tab mode** — Pop out into a full browser tab for more screen real estate
- **Light/dark mode** — Toggle between themes; preference persists and defaults to your OS setting
- **Auto-update check** — Checks GitHub for new versions on startup and shows a banner when an update is available
- **Demo fallback** — Works with realistic randomized sample data when the internal API is unreachable

---

## Installation

Egnyte Yoda is an unpacked Chrome extension — it is not published to the Chrome Web Store.

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions`
3. Enable **Developer mode** (toggle in the top-right)
4. Click **Load unpacked**
5. Select the root folder of this repository
6. The Egnyte Yoda icon will appear in your Chrome toolbar

---

## First-Run Setup

On first launch, Yoda will show a setup screen asking for the **API Base URL**. All specific API paths are derived from this base URL automatically.

- Enter the base URL (e.g. `https://domaininfo.your-company-internal.com`) and click **Save & Continue**
- Choose **Use demo data only** to skip setup and explore with randomized sample data
- To change the URL later, click the **⚙ Config** button in the header

> **Note:** You must be on the Egnyte internal network (or VPN) for live data to load.

---

## API Endpoints

All endpoints are derived from the configured base URL:

| Path | Description |
|---|---|
| `GET /domain/detail/?domain=[domain]` | Core domain configuration |
| `GET /domain/explore_plans/[domain]` | Available subscription plans |
| `GET /domain/trial_items/[domain]` | Available add-on trial packages |
| `GET /settings_dashboard/context/domain/context_value/[domain]/key/` | Domain settings hierarchy |

Authentication is via browser cookies (`credentials: include`) — you must be logged into an Egnyte internal session in the same browser profile.

---

## File Structure

```
Yoda-Browser-Extension/
├── manifest.json      # Chrome Extension Manifest V3 config
├── background.js      # Service worker — API fetch proxy
├── popup.html         # Extension UI shell + styles
├── popup.js           # All UI logic, state, rendering
├── icon-16.png
├── icon-32.png
├── icon-48.png
├── icon-128.png
└── changelog.json     # Version history — powers in-app release notes modal
```

---

## Development

No build step required — vanilla JS, HTML, and CSS only.

To iterate: make changes → go to `chrome://extensions` → click **↻** on the Egnyte Yoda card → reopen the popup.

To add a new release: add an entry to the top of `changelog.json` and update the version string in `manifest.json` and the file header comments. No other files need changing.

Full release history: [`changelog.json`](./changelog.json)
