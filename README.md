# ATP Entry Tracker

A lightweight React-based static web app that shows ATP players and their tournament entries over the next 4 Mondays.

## Data source

- Source page: `https://live-tennis.eu/en/atp-schedule`
- Fetch script: `scripts/fetch-atp.js`
- Output file: `data/entries.json`

## Local usage

This project is static and can be served by any simple web server:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`.

## Update data

```bash
node scripts/fetch-atp.js
```

Optional (recommended for Cloudflare-protected source):

```bash
SCRAPINGBEE_API_KEY="your_key_here" node scripts/fetch-atp.js
```

## GitHub Actions

- `Fetch ATP Data`: daily scheduled data fetch + auto commit when changed.
- `Deploy to GitHub Pages`: deploys site when `main` branch updates.

## Note on source access

The source website may present Cloudflare challenges (HTTP 403) from some environments.
This project supports ScrapingBee as the primary browser-rendered fetch channel.

### Configure ScrapingBee for GitHub Actions

1. Create a ScrapingBee API key.
2. In your GitHub repository, open `Settings` -> `Secrets and variables` -> `Actions`.
3. Add a new repository secret named `SCRAPINGBEE_API_KEY`.
4. Trigger the `Fetch ATP Data` workflow manually once to verify.

If ScrapingBee is unavailable, the script still falls back to direct/fallback URLs and keeps the previous `data/entries.json` unchanged when all attempts fail.
