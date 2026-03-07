// ── Data Model ──────────────────────────────────────────────

export type MatchStatus = "upcoming" | "live" | "finished";

export interface Match {
  id: string;
  name: string; // e.g. "Lakers vs Celtics"
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
  eventType: string;
  serverTimestamp: number; // ms since epoch — SOURCE OF TRUTH
  clientTimestamp: number; // ms since epoch — for drift analysis
  deleted: boolean; // soft-delete for undo
}

// ── Event Type Catalogue ────────────────────────────────────

export interface EventType {
  key: string;
  label: string;
  shortLabel: string;
  color: string; // CSS color for the button
}

export const DEFAULT_EVENT_TYPES: EventType[] = [
  { key: "pass", label: "Pass", shortLabel: "PASS", color: "#4CAF50" },
  { key: "2pt_made", label: "2pt Made", shortLabel: "2PT ✓", color: "#2196F3" },
  { key: "2pt_missed", label: "2pt Missed", shortLabel: "2PT ✗", color: "#1565C0" },
  { key: "3pt_made", label: "3pt Made", shortLabel: "3PT ✓", color: "#FF9800" },
  { key: "3pt_missed", label: "3pt Missed", shortLabel: "3PT ✗", color: "#E65100" },
  { key: "ft_made", label: "Free Throw Made", shortLabel: "FT ✓", color: "#9C27B0" },
  { key: "ft_missed", label: "Free Throw Missed", shortLabel: "FT ✗", color: "#7B1FA2" },
  { key: "rebound", label: "Rebound", shortLabel: "REB", color: "#607D8B" },
  { key: "turnover", label: "Turnover", shortLabel: "TO", color: "#F44336" },
  { key: "steal", label: "Steal", shortLabel: "STL", color: "#E91E63" },
  { key: "foul", label: "Foul", shortLabel: "FOUL", color: "#FF5722" },
  { key: "timeout", label: "Timeout", shortLabel: "T/O", color: "#795548" },
  { key: "substitution", label: "Substitution", shortLabel: "SUB", color: "#009688" },
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
