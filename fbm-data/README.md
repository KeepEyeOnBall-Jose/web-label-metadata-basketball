# FBM Data — Federación de Baloncesto de Madrid

Local relational database of all Madrid basketball leagues, clubs, teams, categories, standings, and matches. Scraped from [fbm.es](https://www.fbm.es).

## Quick Start

```bash
# Install dependencies
npm install

# Install Playwright browsers (only needed for league scraping)
npx playwright install chromium

# Scrape all clubs (~200, single HTTP request)
npx tsx src/cli.ts scrape-clubs

# Scrape team details for all clubs (or a specific one)
npx tsx src/cli.ts scrape-club-details
npx tsx src/cli.ts scrape-club-details --club-id=21452

# Scrape full league hierarchy (Playwright required)
npx tsx src/cli.ts scrape-leagues

# Download available PDF reports
npx tsx src/cli.ts scrape-reports

# Run all scrapers (except leagues)
npx tsx src/cli.ts scrape-all

# Start API server
npx tsx src/cli.ts serve
```

## API Endpoints (port 3006)

| Endpoint | Description |
|---|---|
| `GET /health` | Health check with record counts |
| `GET /api/stats` | Full database statistics |
| `GET /api/clubs?q=search` | List/search clubs |
| `GET /api/clubs/:id` | Club detail (by fbm_id or internal id) |
| `GET /api/clubs/:id/teams` | Teams for a club |
| `GET /api/teams?q=search` | List/search teams |
| `GET /api/teams/:id` | Team detail |
| `GET /api/teams/:id/matches` | Matches for a team |
| `GET /api/categories?gender=F&age_group=Senior` | Filter categories |
| `GET /api/groups/:id/standings` | Group standings |
| `GET /api/groups/:id/matches` | Group matches |
| `GET /api/reports` | Downloaded PDF reports |

## Data Model

```
Season → Competition → Category → Phase → Group → Matches
Club → Team → Group (via group_teams) → Standings
Team → Players (placeholder)
Reports (downloaded PDFs)
```

## Architecture

- **Database**: SQLite via `better-sqlite3` (stored in `data/fbm.db`)
- **Scrapers**: Cheerio for HTML parsing, Playwright for ASP.NET PostBacks
- **API**: Express REST server (port 3006)
- **CLI**: `tsx`-powered TypeScript CLI

Fully isolated from the labeler app — communicates only via REST API.
