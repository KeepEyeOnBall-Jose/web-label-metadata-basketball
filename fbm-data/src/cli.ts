#!/usr/bin/env node

import { closeDb } from './db/connection.js';

const command = process.argv[2];
const args = process.argv.slice(3);

function parseArg(name: string): string | undefined {
    const arg = args.find(a => a.startsWith(`--${name}=`));
    return arg?.split('=')[1];
}

async function main(): Promise<void> {
    switch (command) {
        case 'scrape-clubs': {
            const { runClubsScraper } = await import('./scrapers/clubsScraper.js');
            await runClubsScraper();
            break;
        }

        case 'scrape-club-details': {
            const { runClubDetailScraper } = await import('./scrapers/clubDetailScraper.js');
            const clubId = parseArg('club-id');
            await runClubDetailScraper(clubId ? parseInt(clubId) : undefined);
            break;
        }

        case 'scrape-leagues': {
            const { scrapeLeagues } = await import('./scrapers/leagueScraper.js');
            await scrapeLeagues();
            break;
        }

        case 'scrape-reports': {
            const { runReportsScraper } = await import('./scrapers/reportsScraper.js');
            await runReportsScraper();
            break;
        }

        case 'serve': {
            const { startServer } = await import('./api/index.js');
            startServer();
            return; // Don't close DB — server keeps running
        }

        case 'scrape-all': {
            console.log('🏀 Running all scrapers...\n');

            const { runClubsScraper } = await import('./scrapers/clubsScraper.js');
            await runClubsScraper();
            console.log('');

            const { runClubDetailScraper } = await import('./scrapers/clubDetailScraper.js');
            await runClubDetailScraper();
            console.log('');

            const { runReportsScraper } = await import('./scrapers/reportsScraper.js');
            await runReportsScraper();
            console.log('');

            console.log('⚠️  League hierarchy scraping (scrape-leagues) requires Playwright.');
            console.log('   Run separately: npx tsx src/cli.ts scrape-leagues');
            break;
        }

        default:
            console.log(`
🏀 FBM Data CLI

Usage: npx tsx src/cli.ts <command> [options]

Commands:
  scrape-clubs          Scrape all clubs from FBM (~200 clubs)
  scrape-club-details   Scrape teams/matches for each club
                        --club-id=21452  (optional: scrape single club)
  scrape-leagues        Scrape full league hierarchy (requires Playwright)
  scrape-reports        Download available PDF reports
  scrape-all            Run clubs + club-details + reports
  serve                 Start API server on port 3006
      `);
            process.exit(command ? 1 : 0);
    }

    closeDb();
}

main().catch(err => {
    console.error('❌ Fatal error:', err);
    closeDb();
    process.exit(1);
});
