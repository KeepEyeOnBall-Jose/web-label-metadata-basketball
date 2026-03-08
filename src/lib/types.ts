// ── Data Model ──────────────────────────────────────────────

export type MatchStatus = "upcoming" | "live" | "finished";

export interface Match {
  id: string;
  name: string; // e.g. "Madrid Elite Blanco vs FGS Sports"
  homeTeam: string;
  awayTeam: string;
  status: MatchStatus;
  eventTypes: EventType[];
  createdAt: number; // ms since epoch
  startedAt?: number; // ms since epoch
}

export interface LabelEvent {
  id: string; // nanoid
  matchId: string;
  userId: string;
  userEmail: string;
  eventType: string; // may include follow-up suffix e.g. "foul:home:personal"
  serverTimestamp: number; // ms since epoch — SOURCE OF TRUTH
  clientTimestamp: number; // ms since epoch — for drift analysis
  deleted: boolean; // soft-delete for undo
}

// ── Game State FSM ──────────────────────────────────────────

export type GameState =
  | "PRE_GAME"
  | "Q1"
  | "Q1_BREAK"
  | "Q2"
  | "HALFTIME"
  | "Q3"
  | "Q3_BREAK"
  | "Q4"
  | "OVERTIME"
  | "POST_GAME";

/** Which states count as "play active" (labels are available) */
export const PLAY_ACTIVE_STATES: GameState[] = [
  "Q1", "Q2", "Q3", "Q4", "OVERTIME",
];

/** A transition between game states, triggered by a control button */
export interface GameTransition {
  eventKey: string;     // stored as eventType, e.g. "control:start_match"
  label: string;        // button text, e.g. "START MATCH"
  fromState: GameState;
  toState: GameState;
  color: string;        // button color
}

export const GAME_TRANSITIONS: GameTransition[] = [
  { eventKey: "control:start_match", label: "START MATCH", fromState: "PRE_GAME", toState: "Q1", color: "#2E7D32" },
  { eventKey: "control:end_q1", label: "END Q1", fromState: "Q1", toState: "Q1_BREAK", color: "#C62828" },
  { eventKey: "control:start_q2", label: "START Q2", fromState: "Q1_BREAK", toState: "Q2", color: "#2E7D32" },
  { eventKey: "control:end_q2", label: "END Q2", fromState: "Q2", toState: "HALFTIME", color: "#C62828" },
  { eventKey: "control:start_q3", label: "START Q3", fromState: "HALFTIME", toState: "Q3", color: "#2E7D32" },
  { eventKey: "control:end_q3", label: "END Q3", fromState: "Q3", toState: "Q3_BREAK", color: "#C62828" },
  { eventKey: "control:start_q4", label: "START Q4", fromState: "Q3_BREAK", toState: "Q4", color: "#2E7D32" },
  { eventKey: "control:end_match", label: "END MATCH", fromState: "Q4", toState: "POST_GAME", color: "#C62828" },
  { eventKey: "control:overtime", label: "OVERTIME", fromState: "Q4", toState: "OVERTIME", color: "#FF6F00" },
  { eventKey: "control:end_ot", label: "END MATCH", fromState: "OVERTIME", toState: "POST_GAME", color: "#C62828" },
];

/** Derive current game state from the sequence of non-deleted control events */
export function deriveGameState(events: LabelEvent[]): GameState {
  const controlEvents = events
    .filter((e) => !e.deleted && e.eventType.startsWith("control:"))
    .sort((a, b) => a.serverTimestamp - b.serverTimestamp);

  let state: GameState = "PRE_GAME";
  for (const ev of controlEvents) {
    const transition = GAME_TRANSITIONS.find(
      (t) => t.eventKey === ev.eventType && t.fromState === state
    );
    if (transition) {
      state = transition.toState;
    }
  }
  return state;
}

/** Get the human-readable label for a game state */
export function gameStateLabel(state: GameState): string {
  switch (state) {
    case "PRE_GAME": return "Pre-Game";
    case "Q1": return "Q1";
    case "Q1_BREAK": return "Q1 Break";
    case "Q2": return "Q2";
    case "HALFTIME": return "Halftime";
    case "Q3": return "Q3";
    case "Q3_BREAK": return "Q3 Break";
    case "Q4": return "Q4";
    case "OVERTIME": return "Overtime";
    case "POST_GAME": return "Game Over";
  }
}

// ── Event Type Catalogue ────────────────────────────────────

/** A follow-up option shown in the full-screen overlay after the initial tap */
export interface FollowUpOption {
  suffix: string; // appended to key, e.g. "home" → "substitution:home"
  label: string; // display text e.g. "Home Team"
  color: string; // button color in overlay
}

/** Defines an optional second-step question triggered after tapping an event */
export interface FollowUp {
  question: string; // e.g. "Which team?"
  options: FollowUpOption[];
}

export interface EventType {
  key: string;
  label: string;
  shortLabel: string;
  color: string; // CSS color for the button
  followUp?: FollowUp; // if set, tapping opens a full-screen overlay
}

// ── Semantic Color Palette ──────────────────────────────────
// Ordered by ascending point value: FT (1pt) → 2PT → 3PT
// Made/success → greens (3PT darker than 2PT)
// Missed/fail  → reds  (3PT darker than 2PT)
// FT           → purple family
// Non-scoring  → distinct neutrals

export const DEFAULT_EVENT_TYPES: EventType[] = [
  // ── Scoring (ascending: FT → 2PT → 3PT) ──
  { key: "ft_made", label: "Free Throw Made", shortLabel: "FT ✓", color: "#AB47BC" }, // medium purple
  { key: "ft_missed", label: "Free Throw Missed", shortLabel: "FT ✗", color: "#7B1FA2" }, // deep purple
  { key: "2pt_made", label: "2pt Made", shortLabel: "2PT ✓", color: "#66BB6A" }, // light green
  { key: "2pt_missed", label: "2pt Missed", shortLabel: "2PT ✗", color: "#EF5350" }, // light red
  { key: "3pt_made", label: "3pt Made", shortLabel: "3PT ✓", color: "#2E7D32" }, // deep green
  { key: "3pt_missed", label: "3pt Missed", shortLabel: "3PT ✗", color: "#C62828" }, // deep red
  // ── Non-scoring (no follow-up) ──
  { key: "pass", label: "Pass", shortLabel: "PASS", color: "#42A5F5" }, // blue
  { key: "rebound", label: "Rebound", shortLabel: "REB", color: "#78909C" }, // blue-grey
  { key: "steal", label: "Steal", shortLabel: "STL", color: "#26A69A" }, // teal
  { key: "turnover", label: "Turnover", shortLabel: "TO", color: "#FF7043" }, // deep orange
  // ── Non-scoring (with follow-up) ──
  {
    key: "foul", label: "Foul", shortLabel: "FOUL", color: "#FFA726", // amber
    followUp: {
      question: "What kind?",
      options: [
        { suffix: "home:personal", label: "PERSONAL", color: "#1565C0" },
        { suffix: "away:personal", label: "PERSONAL", color: "#AD1457" },
        { suffix: "home:technical", label: "TECHNICAL", color: "#0D47A1" },
        { suffix: "away:technical", label: "TECHNICAL", color: "#880E4F" },
        { suffix: "home:flagrant", label: "FLAGRANT", color: "#0A3069" },
        { suffix: "away:flagrant", label: "FLAGRANT", color: "#6A0035" },
      ],
    },
  },
  {
    key: "timeout", label: "Timeout", shortLabel: "T/O", color: "#8D6E63", // brown
    followUp: {
      question: "Which team?",
      options: [
        { suffix: "home", label: "HOME", color: "#1565C0" },
        { suffix: "away", label: "AWAY", color: "#AD1457" },
      ],
    },
  },
  {
    key: "substitution", label: "Substitution", shortLabel: "SUB", color: "#00ACC1", // cyan
    followUp: {
      question: "Which team?",
      options: [
        { suffix: "home", label: "HOME", color: "#1565C0" },
        { suffix: "away", label: "AWAY", color: "#AD1457" },
      ],
    },
  },
];

// ── API Payloads ────────────────────────────────────────────

export interface CreateEventPayload {
  matchId: string;
  eventType: string;
  clientTimestamp: number;
}

export interface CreateMatchPayload {
  name: string;
  homeTeam: string;
  awayTeam: string;
  eventTypes?: EventType[];
}
