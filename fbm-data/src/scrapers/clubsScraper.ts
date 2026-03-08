import { getDb } from '../db/connection.js';
import { fetchPage, parseHtml, extractClubId, extractClubSlug, fullUrl } from './utils.js';

const CLUBS_URL = 'https://www.fbm.es/es/resultados-clubes';

interface ClubEntry {
    fbm_id: number;
    name: string;
    slug: string;
}

/**
 * Scrape the full list of clubs from /es/resultados-clubes
 */
export async function scrapeClubs(): Promise<ClubEntry[]> {
    console.log('🏀 Scraping clubs list from FBM...');

    const html = await fetchPage(CLUBS_URL);
    const $ = parseHtml(html);

    const clubs: ClubEntry[] = [];
    const seen = new Set<number>();

    // All club links follow the pattern /resultados-club-{id}/{slug}
    $('a[href*="resultados-club-"]').each((_i, el) => {
        const href = $(el).attr('href');
        if (!href) return;

        const fbmId = extractClubId(href);
        const slug = extractClubSlug(href);
        const name = $(el).text().trim();

        if (fbmId && slug && name && !seen.has(fbmId)) {
            seen.add(fbmId);
            clubs.push({ fbm_id: fbmId, name, slug });
        }
    });

    console.log(`  Found ${clubs.length} clubs`);
    return clubs;
}

/**
 * Save scraped clubs to the database
 */
export function saveClubs(clubs: ClubEntry[]): number {
    const db = getDb();

    const insert = db.prepare(`
    INSERT INTO clubs (fbm_id, name, slug)
    VALUES (@fbm_id, @name, @slug)
    ON CONFLICT(fbm_id) DO UPDATE SET
      name = excluded.name,
      slug = excluded.slug,
      updated_at = datetime('now')
  `);

    const insertMany = db.transaction((entries: ClubEntry[]) => {
        let count = 0;
        for (const entry of entries) {
            insert.run(entry);
            count++;
        }
        return count;
    });

    const count = insertMany(clubs);
    console.log(`  💾 Saved ${count} clubs to database`);
    return count;
}

/**
 * Main entry: scrape + save
 */
export async function runClubsScraper(): Promise<void> {
    const clubs = await scrapeClubs();
    saveClubs(clubs);
}
