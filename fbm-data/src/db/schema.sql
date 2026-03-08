-- FBM Basketball League Data Model
-- SQLite schema for Federación de Baloncesto de Madrid

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ============================================================
-- Seasons
-- ============================================================
CREATE TABLE IF NOT EXISTS seasons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL UNIQUE,  -- e.g. "2025-2026"
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Delegaciones (regional divisions within FBM)
-- ============================================================
CREATE TABLE IF NOT EXISTS delegaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fbm_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Competitions (top-level groupings within a season+delegacion)
-- ============================================================
CREATE TABLE IF NOT EXISTS competitions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  season_id INTEGER NOT NULL REFERENCES seasons(id),
  delegacion_id INTEGER NOT NULL REFERENCES delegaciones(id),
  fbm_id INTEGER NOT NULL,
  name TEXT NOT NULL,           -- e.g. "COMPETICIONES FEDERADAS FBM"
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(fbm_id, season_id)
);

-- ============================================================
-- Categories (divisions within a competition)
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competition_id INTEGER NOT NULL REFERENCES competitions(id),
  fbm_id INTEGER NOT NULL,
  name TEXT NOT NULL,           -- e.g. "2ª Div Aut Fem ORO"
  gender TEXT,                  -- M, F, Mixed
  age_group TEXT,               -- Senior, Sub22, Sub18, Minibasket, etc.
  tier TEXT,                    -- ORO, PLATA, BRONCE, null
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(fbm_id, competition_id)
);

-- ============================================================
-- Phases (stages within a category)
-- ============================================================
CREATE TABLE IF NOT EXISTS phases (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES categories(id),
  fbm_id INTEGER NOT NULL,
  name TEXT NOT NULL,           -- e.g. "PRIMERA FASE", "PLAYOFFS"
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(fbm_id, category_id)
);

-- ============================================================
-- Groups (brackets within a phase)
-- ============================================================
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phase_id INTEGER NOT NULL REFERENCES phases(id),
  fbm_id INTEGER NOT NULL,
  name TEXT NOT NULL,           -- e.g. "GRUPO 1"
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(fbm_id, phase_id)
);

-- ============================================================
-- Clubs
-- ============================================================  
CREATE TABLE IF NOT EXISTS clubs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fbm_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Teams (a club's entry in a specific context)
-- ============================================================
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  club_id INTEGER REFERENCES clubs(id),
  fbm_team_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  slug TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(fbm_team_id)
);

-- ============================================================
-- Group-Team enrollment (a team in a specific group, with standings)
-- ============================================================
CREATE TABLE IF NOT EXISTS group_teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER NOT NULL REFERENCES groups(id),
  team_id INTEGER NOT NULL REFERENCES teams(id),
  position INTEGER,
  points INTEGER DEFAULT 0,
  games_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  points_for INTEGER DEFAULT 0,
  points_against INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(group_id, team_id)
);

-- ============================================================
-- Matches
-- ============================================================
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id INTEGER REFERENCES groups(id),
  home_team_id INTEGER REFERENCES teams(id),
  away_team_id INTEGER REFERENCES teams(id),
  jornada INTEGER,
  match_date TEXT,              -- ISO date
  match_time TEXT,              -- HH:MM
  venue TEXT,
  home_score INTEGER,
  away_score INTEGER,
  status TEXT DEFAULT 'scheduled',  -- scheduled, played, postponed, cancelled
  fbm_match_id TEXT,           -- if discoverable
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Players (placeholder — populated from actas/manual entry)
-- ============================================================
CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER REFERENCES teams(id),
  name TEXT NOT NULL,
  number TEXT,
  position TEXT,
  license_number TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- Reports (downloaded PDFs metadata)
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_type TEXT NOT NULL,    -- 'resultados-clasificacion', 'calendario', 'proximos-partidos', etc.
  entity_type TEXT NOT NULL,    -- 'club', 'group'
  entity_fbm_id INTEGER NOT NULL,
  delegacion_fbm_id INTEGER NOT NULL DEFAULT 1,
  file_path TEXT,               -- local path to downloaded PDF
  url TEXT NOT NULL,
  downloaded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(report_type, entity_type, entity_fbm_id)
);

-- ============================================================
-- Indexes for common queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_teams_club ON teams(club_id);
CREATE INDEX IF NOT EXISTS idx_group_teams_group ON group_teams(group_id);
CREATE INDEX IF NOT EXISTS idx_group_teams_team ON group_teams(team_id);
CREATE INDEX IF NOT EXISTS idx_matches_group ON matches(group_id);
CREATE INDEX IF NOT EXISTS idx_matches_home ON matches(home_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_away ON matches(away_team_id);
CREATE INDEX IF NOT EXISTS idx_matches_date ON matches(match_date);
CREATE INDEX IF NOT EXISTS idx_players_team ON players(team_id);
CREATE INDEX IF NOT EXISTS idx_categories_competition ON categories(competition_id);
CREATE INDEX IF NOT EXISTS idx_phases_category ON phases(category_id);
CREATE INDEX IF NOT EXISTS idx_groups_phase ON groups(phase_id);
