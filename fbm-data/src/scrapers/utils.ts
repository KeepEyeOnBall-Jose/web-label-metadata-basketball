import * as cheerio from 'cheerio';

const BASE_URL = 'https://www.fbm.es';
const DEFAULT_DELAY_MS = 600;

/**
 * Fetch a page with rate limiting and retry logic
 */
export async function fetchPage(url: string, retries = 3): Promise<string> {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) FBM-Data-Scraper/0.1',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText} for ${url}`);
            }

            return await response.text();
        } catch (err) {
            if (attempt === retries) throw err;
            console.warn(`  ⚠ Attempt ${attempt}/${retries} failed for ${url}, retrying...`);
            await delay(1000 * attempt);
        }
    }
    throw new Error(`Unreachable`);
}

/**
 * Download a binary file (PDF, etc.)
 */
export async function downloadFile(url: string): Promise<Buffer> {
    const response = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) FBM-Data-Scraper/0.1',
            'Accept': 'application/pdf,*/*',
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} downloading ${url}`);
    }

    const arrayBuf = await response.arrayBuffer();
    return Buffer.from(arrayBuf);
}

/**
 * Parse HTML into a Cheerio instance
 */
export function parseHtml(html: string): cheerio.CheerioAPI {
    return cheerio.load(html);
}

/**
 * Rate-limiting delay
 */
export function delay(ms: number = DEFAULT_DELAY_MS): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Build a full URL from a relative path
 */
export function fullUrl(path: string): string {
    if (path.startsWith('http')) return path;
    return `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;
}

/**
 * Extract fbm_id from a club URL like /resultados-club-21452/slug
 */
export function extractClubId(href: string): number | null {
    const match = href.match(/resultados-club-(\d+)/);
    return match ? parseInt(match[1], 10) : null;
}

/**
 * Extract club slug from a club URL
 */
export function extractClubSlug(href: string): string | null {
    const match = href.match(/resultados-club-\d+\/(.+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Extract team_id and group_id from a team URL like /equipo-828035-14582/slug
 */
export function extractTeamIds(href: string): { teamId: number; groupId: number } | null {
    const match = href.match(/equipo-(\d+)-(\d+)/);
    if (!match) return null;
    return { teamId: parseInt(match[1], 10), groupId: parseInt(match[2], 10) };
}

/**
 * Extract team slug from a team URL
 */
export function extractTeamSlug(href: string): string | null {
    const match = href.match(/equipo-\d+-\d+\/(.+)/);
    return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Parse a date string like "19/10/2025" to ISO format "2025-10-19"
 */
export function parseSpanishDate(dateStr: string): string | null {
    const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) return null;
    return `${match[3]}-${match[2]}-${match[1]}`;
}

/**
 * Parse gender from category name
 */
export function parseGender(name: string): string | null {
    if (/\bFem\b/i.test(name)) return 'F';
    if (/\bMasc\b/i.test(name)) return 'M';
    if (/\bMix/i.test(name)) return 'Mixed';
    return null;
}

/**
 * Parse age group from category name
 */
export function parseAgeGroup(name: string): string | null {
    const match = name.match(/\b(Sub\s*\d+|Senior|Minibasket|Premini|Babybasket)\b/i);
    return match ? match[1].trim() : null;
}

/**
 * Parse tier from category name
 */
export function parseTier(name: string): string | null {
    const match = name.match(/\b(ORO|PLATA|BRONCE|PREFERENTE)\b/i);
    return match ? match[1].toUpperCase() : null;
}

/**
 * Build a report URL
 */
export function buildReportUrl(params: {
    delegacion?: number;
    club?: number;
    grupo?: number;
    informe: string;
    formato?: string;
    extra?: Record<string, string | number>;
}): string {
    const { delegacion = 1, club, grupo, informe, formato = 'pdf', extra = {} } = params;
    const url = new URL(`${BASE_URL}/informes.aspx`);
    url.searchParams.set('delegacion', String(delegacion));
    if (club) url.searchParams.set('club', String(club));
    if (grupo) url.searchParams.set('grupo', String(grupo));
    url.searchParams.set('informe', informe);
    url.searchParams.set('formato', formato);
    for (const [k, v] of Object.entries(extra)) {
        url.searchParams.set(k, String(v));
    }
    return url.toString();
}

/**
 * Simple progress logger
 */
export function progress(current: number, total: number, label: string): void {
    const pct = Math.round((current / total) * 100);
    process.stdout.write(`\r  [${pct}%] ${current}/${total} ${label}`);
    if (current === total) console.log('');
}

export { BASE_URL };
