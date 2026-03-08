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
  eventType: string; // may include follow-up suffix e.g. "substitution:home"
  serverTimestamp: number; // ms since epoch — SOURCE OF TRUTH
  clientTimestamp: number; // ms since epoch — for drift analysis
  deleted: boolean; // soft-delete for undo
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
// Made/success → greens (3PT darker than 2PT)
// Missed/fail  → reds  (3PT darker than 2PT)
// FT           → purple family (keeps uniqueness)
// Non-scoring  → distinct neutrals

export const DEFAULT_EVENT_TYPES: EventType[] = [
  // ── Scoring ──
  { key: "2pt_made", label: "2pt Made", shortLabel: "2PT ✓", color: "#66BB6A" }, // light green
  { key: "2pt_missed", label: "2pt Missed", shortLabel: "2PT ✗", color: "#EF5350" }, // light red
  { key: "3pt_made", label: "3pt Made", shortLabel: "3PT ✓", color: "#2E7D32" }, // deep green
  { key: "3pt_missed", label: "3pt Missed", shortLabel: "3PT ✗", color: "#C62828" }, // deep red
  { key: "ft_made", label: "Free Throw Made", shortLabel: "FT ✓", color: "#AB47BC" }, // medium purple
  { key: "ft_missed", label: "Free Throw Missed", shortLabel: "FT ✗", color: "#7B1FA2" }, // deep purple
  // ── Non-scoring (no follow-up) ──
  { key: "pass", label: "Pass", shortLabel: "PASS", color: "#42A5F5" }, // blue
  { key: "rebound", label: "Rebound", shortLabel: "REB", color: "#78909C" }, // blue-grey
  { key: "steal", label: "Steal", shortLabel: "STL", color: "#26A69A" }, // teal
  { key: "turnover", label: "Turnover", shortLabel: "TO", color: "#FF7043" }, // deep orange
  // ── Non-scoring (with team follow-up) ──
  {
    key: "foul", label: "Foul", shortLabel: "FOUL", color: "#FFA726", // amber
    followUp: {
      question: "Which team?",
      options: [
        { suffix: "home", label: "HOME", color: "#1565C0" },
        { suffix: "away", label: "AWAY", color: "#AD1457" },
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
