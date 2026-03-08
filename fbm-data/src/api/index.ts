import express from 'express';
import { getDb } from '../db/connection.js';

const app = express();
const PORT = 3006;

app.use(express.json());

// CORS
app.use((_req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
});

// ── Health ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
    const db = getDb();
    const counts = {
        clubs: (db.prepare('SELECT COUNT(*) as c FROM clubs').get() as { c: number }).c,
        teams: (db.prepare('SELECT COUNT(*) as c FROM teams').get() as { c: number }).c,
        categories: (db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number }).c,
        groups: (db.prepare('SELECT COUNT(*) as c FROM groups').get() as { c: number }).c,
        matches: (db.prepare('SELECT COUNT(*) as c FROM matches').get() as { c: number }).c,
        reports: (db.prepare('SELECT COUNT(*) as c FROM reports').get() as { c: number }).c,
    };
    res.json({ status: 'ok', counts });
});

// ── Clubs ───────────────────────────────────────────────
app.get('/api/clubs', (req, res) => {
    const db = getDb();
    const search = req.query.q as string | undefined;

    let clubs;
    if (search) {
        clubs = db.prepare(`
      SELECT * FROM clubs WHERE name LIKE ? ORDER BY name
    `).all(`%${search}%`);
    } else {
        clubs = db.prepare('SELECT * FROM clubs ORDER BY name').all();
    }
    res.json(clubs);
});

app.get('/api/clubs/:id', (req, res) => {
    const db = getDb();
    const club = db.prepare('SELECT * FROM clubs WHERE fbm_id = ? OR id = ?')
        .get(req.params.id, req.params.id);
    if (!club) return res.status(404).json({ error: 'Club not found' });
    res.json(club);
});

app.get('/api/clubs/:id/teams', (req, res) => {
    const db = getDb();
    const club = db.prepare('SELECT id FROM clubs WHERE fbm_id = ? OR id = ?')
        .get(req.params.id, req.params.id) as { id: number } | undefined;
    if (!club) return res.status(404).json({ error: 'Club not found' });

    const teams = db.prepare(`
    SELECT t.*, 
           GROUP_CONCAT(DISTINCT gt.group_id) as group_ids
    FROM teams t
    LEFT JOIN group_teams gt ON gt.team_id = t.id
    WHERE t.club_id = ?
    GROUP BY t.id
    ORDER BY t.name
  `).all(club.id);

    res.json(teams);
});

// ── Teams ───────────────────────────────────────────────
app.get('/api/teams', (req, res) => {
    const db = getDb();
    const search = req.query.q as string | undefined;

    let teams;
    if (search) {
        teams = db.prepare(`
      SELECT t.*, c.name as club_name, c.fbm_id as club_fbm_id
      FROM teams t
      LEFT JOIN clubs c ON c.id = t.club_id
      WHERE t.name LIKE ?
      ORDER BY t.name
    `).all(`%${search}%`);
    } else {
        teams = db.prepare(`
      SELECT t.*, c.name as club_name, c.fbm_id as club_fbm_id
      FROM teams t
      LEFT JOIN clubs c ON c.id = t.club_id
      ORDER BY t.name
    `).all();
    }
    res.json(teams);
});

app.get('/api/teams/:id', (req, res) => {
    const db = getDb();
    const team = db.prepare(`
    SELECT t.*, c.name as club_name, c.fbm_id as club_fbm_id
    FROM teams t
    LEFT JOIN clubs c ON c.id = t.club_id
    WHERE t.fbm_team_id = ? OR t.id = ?
  `).get(req.params.id, req.params.id);
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json(team);
});

app.get('/api/teams/:id/matches', (req, res) => {
    const db = getDb();
    const team = db.prepare('SELECT id FROM teams WHERE fbm_team_id = ? OR id = ?')
        .get(req.params.id, req.params.id) as { id: number } | undefined;
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const matches = db.prepare(`
    SELECT m.*,
           ht.name as home_team_name,
           at.name as away_team_name
    FROM matches m
    LEFT JOIN teams ht ON ht.id = m.home_team_id
    LEFT JOIN teams at ON at.id = m.away_team_id
    WHERE m.home_team_id = ? OR m.away_team_id = ?
    ORDER BY m.match_date
  `).all(team.id, team.id);

    res.json(matches);
});

// ── Categories & Leagues ────────────────────────────────
app.get('/api/seasons', (_req, res) => {
    const db = getDb();
    res.json(db.prepare('SELECT * FROM seasons ORDER BY label DESC').all());
});

app.get('/api/delegaciones', (_req, res) => {
    const db = getDb();
    res.json(db.prepare('SELECT * FROM delegaciones ORDER BY name').all());
});

app.get('/api/competitions', (req, res) => {
    const db = getDb();
    const seasonId = req.query.season_id;
    if (seasonId) {
        res.json(db.prepare('SELECT * FROM competitions WHERE season_id = ? ORDER BY name').all(seasonId));
    } else {
        res.json(db.prepare('SELECT * FROM competitions ORDER BY name').all());
    }
});

app.get('/api/categories', (req, res) => {
    const db = getDb();
    const { gender, age_group, competition_id } = req.query;

    let sql = 'SELECT cat.*, comp.name as competition_name FROM categories cat LEFT JOIN competitions comp ON comp.id = cat.competition_id WHERE 1=1';
    const params: unknown[] = [];

    if (gender) { sql += ' AND cat.gender = ?'; params.push(gender); }
    if (age_group) { sql += ' AND cat.age_group = ?'; params.push(age_group); }
    if (competition_id) { sql += ' AND cat.competition_id = ?'; params.push(competition_id); }

    sql += ' ORDER BY cat.name';
    res.json(db.prepare(sql).all(...params));
});

app.get('/api/groups/:id/standings', (req, res) => {
    const db = getDb();
    const group = db.prepare('SELECT id FROM groups WHERE fbm_id = ? OR id = ?')
        .get(req.params.id, req.params.id) as { id: number } | undefined;
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const standings = db.prepare(`
    SELECT gt.*, t.name as team_name, t.fbm_team_id,
           c.name as club_name, c.fbm_id as club_fbm_id
    FROM group_teams gt
    JOIN teams t ON t.id = gt.team_id
    LEFT JOIN clubs c ON c.id = t.club_id
    WHERE gt.group_id = ?
    ORDER BY gt.position, gt.points DESC
  `).all(group.id);

    res.json(standings);
});

app.get('/api/groups/:id/matches', (req, res) => {
    const db = getDb();
    const group = db.prepare('SELECT id FROM groups WHERE fbm_id = ? OR id = ?')
        .get(req.params.id, req.params.id) as { id: number } | undefined;
    if (!group) return res.status(404).json({ error: 'Group not found' });

    const matches = db.prepare(`
    SELECT m.*,
           ht.name as home_team_name,
           at.name as away_team_name
    FROM matches m
    LEFT JOIN teams ht ON ht.id = m.home_team_id
    LEFT JOIN teams at ON at.id = m.away_team_id
    WHERE m.group_id = ?
    ORDER BY m.jornada, m.match_date
  `).all(group.id);

    res.json(matches);
});

// ── Reports ─────────────────────────────────────────────
app.get('/api/reports', (req, res) => {
    const db = getDb();
    const { entity_type, report_type } = req.query;

    let sql = 'SELECT * FROM reports WHERE 1=1';
    const params: unknown[] = [];

    if (entity_type) { sql += ' AND entity_type = ?'; params.push(entity_type); }
    if (report_type) { sql += ' AND report_type = ?'; params.push(report_type); }

    sql += ' ORDER BY created_at DESC';
    res.json(db.prepare(sql).all(...params));
});

// ── Stats ───────────────────────────────────────────────
app.get('/api/stats', (_req, res) => {
    const db = getDb();
    const stats = {
        clubs: (db.prepare('SELECT COUNT(*) as c FROM clubs').get() as { c: number }).c,
        teams: (db.prepare('SELECT COUNT(*) as c FROM teams').get() as { c: number }).c,
        competitions: (db.prepare('SELECT COUNT(*) as c FROM competitions').get() as { c: number }).c,
        categories: (db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number }).c,
        phases: (db.prepare('SELECT COUNT(*) as c FROM phases').get() as { c: number }).c,
        groups: (db.prepare('SELECT COUNT(*) as c FROM groups').get() as { c: number }).c,
        matches: (db.prepare('SELECT COUNT(*) as c FROM matches').get() as { c: number }).c,
        players: (db.prepare('SELECT COUNT(*) as c FROM players').get() as { c: number }).c,
        reports: (db.prepare('SELECT COUNT(*) as c FROM reports').get() as { c: number }).c,
    };
    res.json(stats);
});

export function startServer(): void {
    app.listen(PORT, () => {
        console.log(`🏀 FBM Data API running at http://localhost:${PORT}`);
        console.log(`   Health: http://localhost:${PORT}/health`);
        console.log(`   Stats:  http://localhost:${PORT}/api/stats`);
        console.log(`   Clubs:  http://localhost:${PORT}/api/clubs`);
    });
}
