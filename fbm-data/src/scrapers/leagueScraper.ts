import { getDb } from '../db/connection.js';
import { delay, progress } from './utils.js';

/**
 * League scraper using Playwright to navigate the ASP.NET PostBack dropdowns
 * on /es/horarios-y-resultados to discover the full competition hierarchy.
 * 
 * Dropdowns cascade: Delegación → Competición → Categoría → Fase → Grupo
 */

const HORARIOS_URL = 'https://www.fbm.es/es/horarios-y-resultados';

// ASP.NET control IDs for the dropdowns
const CONTROLS = {
    delegacion: 'ctl00_ctl00_contenedor_informacion_contenedor_informacion_con_lateral_formulario_DDLDelegacion',
    competicion: 'ctl00_ctl00_contenedor_informacion_contenedor_informacion_con_lateral_formulario_DDLCompeticiones',
    categoria: 'ctl00_ctl00_contenedor_informacion_contenedor_informacion_con_lateral_formulario_DDLCategorias',
    fase: 'ctl00_ctl00_contenedor_informacion_contenedor_informacion_con_lateral_formulario_DDLFases',
    grupo: 'ctl00_ctl00_contenedor_informacion_contenedor_informacion_con_lateral_formulario_DDLGrupos',
};

interface DropdownOption {
    value: string;
    text: string;
}

interface LeagueHierarchy {
    delegacion: DropdownOption;
    competiciones: Array<{
        option: DropdownOption;
        categorias: Array<{
            option: DropdownOption;
            fases: Array<{
                option: DropdownOption;
                grupos: DropdownOption[];
            }>;
        }>;
    }>;
}

/**
 * Scrape the full league hierarchy using Playwright
 */
export async function scrapeLeagues(): Promise<void> {
    console.log('🏀 Scraping league hierarchy from FBM (Playwright)...');
    console.log('  This requires Playwright. Installing browsers if needed...\n');

    // Dynamic import so playwright doesn't need to be loaded for other scrapers
    const { chromium } = await import('playwright');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    try {
        await page.goto(HORARIOS_URL, { waitUntil: 'networkidle', timeout: 30000 });

        // Helper: get options from a dropdown
        async function getOptions(controlId: string): Promise<DropdownOption[]> {
            return page.evaluate((id) => {
                const select = document.getElementById(id) as HTMLSelectElement;
                if (!select) return [];
                return Array.from(select.options).map(o => ({
                    value: o.value,
                    text: o.textContent?.trim() || '',
                })).filter(o => o.value && o.value !== '' && o.value !== '-1');
            }, controlId);
        }

        // Helper: select an option and wait for PostBack
        async function selectOption(controlId: string, value: string): Promise<void> {
            await page.selectOption(`#${controlId}`, value);
            // ASP.NET PostBack — wait for the page to update
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
            await delay(500);
        }

        const db = getDb();

        // Ensure we have a season
        const seasonLabel = '2025-2026';
        db.prepare('INSERT OR IGNORE INTO seasons (label) VALUES (?)').run(seasonLabel);
        const season = db.prepare('SELECT id FROM seasons WHERE label = ?').get(seasonLabel) as { id: number };

        // Insert delegaciones
        const insertDelegacion = db.prepare(`
      INSERT INTO delegaciones (fbm_id, name)
      VALUES (@fbm_id, @name)
      ON CONFLICT(fbm_id) DO UPDATE SET name = excluded.name, updated_at = datetime('now')
    `);
        const insertCompetition = db.prepare(`
      INSERT INTO competitions (season_id, delegacion_id, fbm_id, name)
      VALUES (@season_id, @delegacion_id, @fbm_id, @name)
      ON CONFLICT(fbm_id, season_id) DO UPDATE SET name = excluded.name, updated_at = datetime('now')
    `);
        const insertCategory = db.prepare(`
      INSERT INTO categories (competition_id, fbm_id, name, gender, age_group, tier)
      VALUES (@competition_id, @fbm_id, @name, @gender, @age_group, @tier)
      ON CONFLICT(fbm_id, competition_id) DO UPDATE SET
        name = excluded.name, gender = excluded.gender,
        age_group = excluded.age_group, tier = excluded.tier,
        updated_at = datetime('now')
    `);
        const insertPhase = db.prepare(`
      INSERT INTO phases (category_id, fbm_id, name)
      VALUES (@category_id, @fbm_id, @name)
      ON CONFLICT(fbm_id, category_id) DO UPDATE SET name = excluded.name, updated_at = datetime('now')
    `);
        const insertGroup = db.prepare(`
      INSERT INTO groups (phase_id, fbm_id, name)
      VALUES (@phase_id, @fbm_id, @name)
      ON CONFLICT(fbm_id, phase_id) DO UPDATE SET name = excluded.name, updated_at = datetime('now')
    `);

        // Get delegaciones
        const delegaciones = await getOptions(CONTROLS.delegacion);
        console.log(`  Found ${delegaciones.length} delegaciones`);

        // Focus on delegacion 1 (FBM) primarily, but process all
        for (const deleg of delegaciones) {
            console.log(`\n  📍 Delegación: ${deleg.text}`);

            insertDelegacion.run({ fbm_id: parseInt(deleg.value), name: deleg.text });
            const delegRow = db.prepare('SELECT id FROM delegaciones WHERE fbm_id = ?').get(parseInt(deleg.value)) as { id: number };

            await selectOption(CONTROLS.delegacion, deleg.value);

            const competiciones = await getOptions(CONTROLS.competicion);
            console.log(`     ${competiciones.length} competitions`);

            for (const comp of competiciones) {
                console.log(`     🏆 ${comp.text}`);

                insertCompetition.run({
                    season_id: season.id,
                    delegacion_id: delegRow.id,
                    fbm_id: parseInt(comp.value),
                    name: comp.text,
                });
                const compRow = db.prepare('SELECT id FROM competitions WHERE fbm_id = ? AND season_id = ?')
                    .get(parseInt(comp.value), season.id) as { id: number };

                await selectOption(CONTROLS.competicion, comp.value);

                const categorias = await getOptions(CONTROLS.categoria);
                console.log(`       ${categorias.length} categories`);

                for (const cat of categorias) {
                    const { parseGender, parseAgeGroup, parseTier } = await import('./utils.js');

                    insertCategory.run({
                        competition_id: compRow.id,
                        fbm_id: parseInt(cat.value),
                        name: cat.text,
                        gender: parseGender(cat.text),
                        age_group: parseAgeGroup(cat.text),
                        tier: parseTier(cat.text),
                    });
                    const catRow = db.prepare('SELECT id FROM categories WHERE fbm_id = ? AND competition_id = ?')
                        .get(parseInt(cat.value), compRow.id) as { id: number };

                    await selectOption(CONTROLS.categoria, cat.value);

                    const fases = await getOptions(CONTROLS.fase);

                    for (const fase of fases) {
                        insertPhase.run({
                            category_id: catRow.id,
                            fbm_id: parseInt(fase.value),
                            name: fase.text,
                        });
                        const phaseRow = db.prepare('SELECT id FROM phases WHERE fbm_id = ? AND category_id = ?')
                            .get(parseInt(fase.value), catRow.id) as { id: number };

                        await selectOption(CONTROLS.fase, fase.value);

                        const grupos = await getOptions(CONTROLS.grupo);

                        for (const grupo of grupos) {
                            insertGroup.run({
                                phase_id: phaseRow.id,
                                fbm_id: parseInt(grupo.value),
                                name: grupo.text,
                            });
                        }

                        if (grupos.length > 0) {
                            console.log(`         ${cat.text} > ${fase.text}: ${grupos.length} groups`);
                        }
                    }

                    // Re-select the category to reset for next category
                    await selectOption(CONTROLS.competicion, comp.value);
                }

                // Re-select delegacion for next competition
                await selectOption(CONTROLS.delegacion, deleg.value);
            }
        }

        // Print summary
        const counts = {
            delegaciones: (db.prepare('SELECT COUNT(*) as c FROM delegaciones').get() as { c: number }).c,
            competitions: (db.prepare('SELECT COUNT(*) as c FROM competitions').get() as { c: number }).c,
            categories: (db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number }).c,
            phases: (db.prepare('SELECT COUNT(*) as c FROM phases').get() as { c: number }).c,
            groups: (db.prepare('SELECT COUNT(*) as c FROM groups').get() as { c: number }).c,
        };

        console.log(`\n✅ League hierarchy scraped:`);
        console.log(`   ${counts.delegaciones} delegaciones`);
        console.log(`   ${counts.competitions} competitions`);
        console.log(`   ${counts.categories} categories`);
        console.log(`   ${counts.phases} phases`);
        console.log(`   ${counts.groups} groups`);

    } finally {
        await browser.close();
    }
}
