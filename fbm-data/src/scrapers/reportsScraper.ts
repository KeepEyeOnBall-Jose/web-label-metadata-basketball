import { getDb, DATA_DIR } from '../db/connection.js';
import { downloadFile, buildReportUrl, delay, progress } from './utils.js';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

const REPORTS_DIR = join(DATA_DIR, 'reports');

// Report types we can download
const CLUB_REPORT_TYPES = [
    'proximos-partidos-club',
    'resultados-clasificacion',
] as const;

const GROUP_REPORT_TYPES = [
    'resultados-clasificacion-proxima',
    'calendario',
] as const;

/**
 * Ensure reports directory exists
 */
function ensureReportsDir(subdir?: string): string {
    const dir = subdir ? join(REPORTS_DIR, subdir) : REPORTS_DIR;
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return dir;
}

/**
 * Download all available club-level reports
 */
export async function downloadClubReports(): Promise<void> {
    const db = getDb();
    const clubs = db.prepare('SELECT fbm_id, slug, name FROM clubs ORDER BY name').all() as Array<{
        fbm_id: number;
        slug: string;
        name: string;
    }>;

    if (clubs.length === 0) {
        console.log('  No clubs in database. Run scrape-clubs first.');
        return;
    }

    const clubsDir = ensureReportsDir('clubs');
    console.log(`📄 Downloading reports for ${clubs.length} clubs...`);

    const insertReport = db.prepare(`
    INSERT INTO reports (report_type, entity_type, entity_fbm_id, delegacion_fbm_id, file_path, url, downloaded_at)
    VALUES (@report_type, @entity_type, @entity_fbm_id, @delegacion_fbm_id, @file_path, @url, datetime('now'))
    ON CONFLICT(report_type, entity_type, entity_fbm_id) DO UPDATE SET
      file_path = excluded.file_path,
      url = excluded.url,
      downloaded_at = datetime('now'),
      updated_at = datetime('now')
  `);

    let downloaded = 0;
    let errors = 0;

    for (let i = 0; i < clubs.length; i++) {
        const club = clubs[i];
        progress(i + 1, clubs.length, `${club.name}`);

        for (const reportType of CLUB_REPORT_TYPES) {
            const url = buildReportUrl({
                club: club.fbm_id,
                informe: reportType,
            });

            const filename = `club-${club.fbm_id}-${reportType}.pdf`;
            const filePath = join(clubsDir, filename);

            // Skip if already downloaded
            if (existsSync(filePath)) {
                continue;
            }

            try {
                const buffer = await downloadFile(url);

                // Verify it's actually a PDF (check magic bytes)
                if (buffer.length > 4 && buffer.slice(0, 4).toString() === '%PDF') {
                    writeFileSync(filePath, buffer);

                    insertReport.run({
                        report_type: reportType,
                        entity_type: 'club',
                        entity_fbm_id: club.fbm_id,
                        delegacion_fbm_id: 1,
                        file_path: filePath,
                        url,
                    });

                    downloaded++;
                }
            } catch (err) {
                errors++;
                // Many clubs may not have some report types — that's fine
            }

            await delay(300);
        }
    }

    console.log(`\n✅ Downloaded ${downloaded} club reports (${errors} errors/missing)`);
}

/**
 * Download all available group-level reports (these are the "actas"/standings)
 * Groups are discovered from team URLs: /equipo-{team_id}-{group_id}/{slug}
 */
export async function downloadGroupReports(): Promise<void> {
    const db = getDb();

    // Discover unique group IDs from team URLs stored in the database
    // We also need to find groups from the club pages we've scraped
    // For now, extract from team data
    const teams = db.prepare(`
    SELECT DISTINCT fbm_team_id, name FROM teams
  `).all() as Array<{ fbm_team_id: number; name: string }>;

    // We need to re-discover group IDs since they come from URLs
    // Let's get them from a fresh scrape of club pages
    console.log('📄 Discovering groups from club pages for report downloads...');

    const clubs = db.prepare('SELECT fbm_id, slug, name FROM clubs ORDER BY name').all() as Array<{
        fbm_id: number;
        slug: string;
        name: string;
    }>;

    const groupIds = new Set<number>();
    const { fetchPage, parseHtml, extractTeamIds } = await import('./utils.js');

    // Sample a few clubs to discover group IDs quickly
    const sampleClubs = clubs.slice(0, Math.min(20, clubs.length));

    for (let i = 0; i < sampleClubs.length; i++) {
        const club = sampleClubs[i];
        progress(i + 1, sampleClubs.length, `Scanning ${club.name}`);

        try {
            const html = await fetchPage(`https://www.fbm.es/resultados-club-${club.fbm_id}/${club.slug}`);
            const $ = parseHtml(html);

            $('a[href*="equipo-"]').each((_i, el) => {
                const href = $(el).attr('href') || '';
                const ids = extractTeamIds(href);
                if (ids) {
                    groupIds.add(ids.groupId);
                }
            });
        } catch {
            // Skip errors
        }

        await delay(400);
    }

    console.log(`\n  Found ${groupIds.size} unique groups`);

    if (groupIds.size === 0) {
        console.log('  No groups discovered. Run scrape-club-details first.');
        return;
    }

    const groupsDir = ensureReportsDir('groups');
    console.log(`📄 Downloading reports for ${groupIds.size} groups...`);

    const insertReport = db.prepare(`
    INSERT INTO reports (report_type, entity_type, entity_fbm_id, delegacion_fbm_id, file_path, url, downloaded_at)
    VALUES (@report_type, @entity_type, @entity_fbm_id, @delegacion_fbm_id, @file_path, @url, datetime('now'))
    ON CONFLICT(report_type, entity_type, entity_fbm_id) DO UPDATE SET
      file_path = excluded.file_path,
      url = excluded.url,
      downloaded_at = datetime('now'),
      updated_at = datetime('now')
  `);

    let downloaded = 0;
    let errors = 0;
    const groupArray = Array.from(groupIds);

    for (let i = 0; i < groupArray.length; i++) {
        const groupId = groupArray[i];
        progress(i + 1, groupArray.length, `Group ${groupId}`);

        for (const reportType of GROUP_REPORT_TYPES) {
            const url = buildReportUrl({
                grupo: groupId,
                informe: reportType,
            });

            const filename = `group-${groupId}-${reportType}.pdf`;
            const filePath = join(groupsDir, filename);

            if (existsSync(filePath)) {
                continue;
            }

            try {
                const buffer = await downloadFile(url);

                if (buffer.length > 4 && buffer.slice(0, 4).toString() === '%PDF') {
                    writeFileSync(filePath, buffer);

                    insertReport.run({
                        report_type: reportType,
                        entity_type: 'group',
                        entity_fbm_id: groupId,
                        delegacion_fbm_id: 1,
                        file_path: filePath,
                        url,
                    });

                    downloaded++;
                }
            } catch {
                errors++;
            }

            await delay(300);
        }
    }

    console.log(`\n✅ Downloaded ${downloaded} group reports (${errors} errors/missing)`);
}

/**
 * Run all report downloads
 */
export async function runReportsScraper(): Promise<void> {
    console.log('📥 Starting reports download...\n');
    await downloadClubReports();
    console.log('');
    await downloadGroupReports();

    const db = getDb();
    const totalReports = (db.prepare('SELECT COUNT(*) as cnt FROM reports').get() as { cnt: number }).cnt;
    console.log(`\n📊 Total reports in database: ${totalReports}`);
}
