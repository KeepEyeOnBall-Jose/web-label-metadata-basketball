import { getDb } from '../db/connection.js';
import {
    fetchPage, parseHtml, extractTeamIds, extractTeamSlug,
    parseSpanishDate, parseGender, parseAgeGroup, parseTier,
    delay, fullUrl, progress
} from './utils.js';

interface TeamEntry {
    fbm_team_id: number;
    group_fbm_id: number;
    name: string;
    slug: string | null;
}

interface MatchEntry {
    home_team_name: string;
    away_team_name: string;
    home_fbm_team_id: number | null;
    away_fbm_team_id: number | null;
    jornada: number | null;
    match_date: string | null;
    home_score: number | null;
    away_score: number | null;
    venue: string | null;
}

interface CategoryBlock {
    category_name: string;
    phase_name: string;
    group_name: string;
    teams: TeamEntry[];
    matches: MatchEntry[];
}

/**
 * Scrape a single club detail page to extract teams and matches
 */
export async function scrapeClubDetail(fbmId: number, slug: string): Promise<CategoryBlock[]> {
    const url = fullUrl(`/resultados-club-${fbmId}/${slug}`);
    const html = await fetchPage(url);
    const $ = parseHtml(html);

    const blocks: CategoryBlock[] = [];
    const teamsSeen = new Set<number>();

    // Find all team links to discover teams and their group assignments
    $('a[href*="equipo-"]').each((_i, el) => {
        const href = $(el).attr('href') || '';
        const ids = extractTeamIds(href);
        const teamSlug = extractTeamSlug(href);
        const name = $(el).text().trim();

        if (ids && name && !teamsSeen.has(ids.teamId)) {
            teamsSeen.add(ids.teamId);
            // We'll associate these with categories below
        }
    });

    // Parse category blocks from the results/classifications section
    // Categories appear as h4 headings like "2ª Div Aut Fem ORO - PRIMERA FASE - GRUPO 4"
    const categoryHeaders: string[] = [];

    // Look for headers that match the pattern "Category - Phase - Group"
    $('h4, .titulo-categoria, [class*="categoria"]').each((_i, el) => {
        const text = $(el).text().trim();
        if (text.includes(' - ') && (text.includes('FASE') || text.includes('GRUPO') || text.includes('Div') || text.includes('Sub'))) {
            categoryHeaders.push(text);
        }
    });

    // Also grab from plain text parsing
    const fullText = $('body').text();
    const categoryRegex = /([A-ZÁÉÍÓÚÑa-záéíóúñ\s\dª\.]+?)\s*-\s*((?:PRIMERA|SEGUNDA|TERCERA)\s+FASE|PLAYOFFS?|FASE\s+\w+)\s*-\s*(GRUPO\s+\d+)/gi;
    let match;
    const catParseSet = new Set<string>();

    while ((match = categoryRegex.exec(fullText)) !== null) {
        const catName = match[1].trim();
        const phaseName = match[2].trim();
        const groupName = match[3].trim();
        const key = `${catName}|${phaseName}|${groupName}`;

        if (!catParseSet.has(key)) {
            catParseSet.add(key);

            // Find teams linked in this section
            const teamEntries: TeamEntry[] = [];

            $('a[href*="equipo-"]').each((_j, teamEl) => {
                const href = $(teamEl).attr('href') || '';
                const ids = extractTeamIds(href);
                const tSlug = extractTeamSlug(href);
                const tName = $(teamEl).text().trim();

                if (ids && tName) {
                    const existing = teamEntries.find(t => t.fbm_team_id === ids.teamId);
                    if (!existing) {
                        teamEntries.push({
                            fbm_team_id: ids.teamId,
                            group_fbm_id: ids.groupId,
                            name: tName,
                            slug: tSlug,
                        });
                    }
                }
            });

            blocks.push({
                category_name: catName,
                phase_name: phaseName,
                group_name: groupName,
                teams: teamEntries,
                matches: [],
            });
        }
    }

    // If no structured blocks found, at least collect all teams
    if (blocks.length === 0) {
        const allTeams: TeamEntry[] = [];
        $('a[href*="equipo-"]').each((_i, el) => {
            const href = $(el).attr('href') || '';
            const ids = extractTeamIds(href);
            const tSlug = extractTeamSlug(href);
            const name = $(el).text().trim();

            if (ids && name) {
                const exists = allTeams.find(t => t.fbm_team_id === ids.teamId);
                if (!exists) {
                    allTeams.push({
                        fbm_team_id: ids.teamId,
                        group_fbm_id: ids.groupId,
                        name,
                        slug: tSlug,
                    });
                }
            }
        });

        if (allTeams.length > 0) {
            blocks.push({
                category_name: 'Unknown',
                phase_name: 'Unknown',
                group_name: 'Unknown',
                teams: allTeams,
                matches: [],
            });
        }
    }

    return blocks;
}

/**
 * Save club detail data to the database
 */
export function saveClubDetailData(clubFbmId: number, blocks: CategoryBlock[]): void {
    const db = getDb();

    // Ensure the club exists
    const club = db.prepare('SELECT id FROM clubs WHERE fbm_id = ?').get(clubFbmId) as { id: number } | undefined;
    if (!club) {
        console.warn(`  ⚠ Club ${clubFbmId} not in database, skipping`);
        return;
    }

    const insertTeam = db.prepare(`
    INSERT INTO teams (club_id, fbm_team_id, name, slug)
    VALUES (@club_id, @fbm_team_id, @name, @slug)
    ON CONFLICT(fbm_team_id) DO UPDATE SET
      name = excluded.name,
      slug = excluded.slug,
      club_id = excluded.club_id,
      updated_at = datetime('now')
  `);

    const saveAll = db.transaction(() => {
        let teamCount = 0;
        for (const block of blocks) {
            for (const team of block.teams) {
                insertTeam.run({
                    club_id: club.id,
                    fbm_team_id: team.fbm_team_id,
                    name: team.name,
                    slug: team.slug,
                });
                teamCount++;
            }
        }
        return teamCount;
    });

    const count = saveAll();
    if (count > 0) {
        console.log(`    💾 Saved ${count} teams for club ${clubFbmId}`);
    }
}

/**
 * Run the club detail scraper for all clubs or a specific one
 */
export async function runClubDetailScraper(specificClubId?: number): Promise<void> {
    const db = getDb();

    let clubs: Array<{ fbm_id: number; slug: string; name: string }>;

    if (specificClubId) {
        const club = db.prepare('SELECT fbm_id, slug, name FROM clubs WHERE fbm_id = ?').get(specificClubId);
        clubs = club ? [club as { fbm_id: number; slug: string; name: string }] : [];
    } else {
        clubs = db.prepare('SELECT fbm_id, slug, name FROM clubs ORDER BY name').all() as Array<{ fbm_id: number; slug: string; name: string }>;
    }

    if (clubs.length === 0) {
        console.log('  No clubs found. Run scrape-clubs first.');
        return;
    }

    console.log(`🏀 Scraping details for ${clubs.length} clubs...`);

    for (let i = 0; i < clubs.length; i++) {
        const club = clubs[i];
        progress(i + 1, clubs.length, club.name);

        try {
            const blocks = await scrapeClubDetail(club.fbm_id, club.slug);
            saveClubDetailData(club.fbm_id, blocks);
        } catch (err) {
            console.error(`\n  ❌ Error scraping club ${club.name}: ${err}`);
        }

        await delay(600);
    }

    const teamCount = (db.prepare('SELECT COUNT(*) as cnt FROM teams').get() as { cnt: number }).cnt;
    console.log(`\n✅ Done. Total teams in database: ${teamCount}`);
}
