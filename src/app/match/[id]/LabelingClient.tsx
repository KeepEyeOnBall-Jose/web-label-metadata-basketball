"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Match, LabelEvent, EventType, FollowUp } from "@/lib/types";
import { DEFAULT_EVENT_TYPES } from "@/lib/types";
import { enqueueEvent, flushOfflineQueue, getQueueLength } from "@/lib/offlineQueue";

// ── Helpers ─────────────────────────────────────────────────

function formatElapsed(startMs: number): string {
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    return `${mins}m ago`;
}

// ── Layout Definition ───────────────────────────────────────

interface GridRow {
    left: string;
    right?: string;
    category?: string;
}

const GRID_LAYOUT: GridRow[] = [
    { left: "2pt_made", right: "2pt_missed", category: "SCORING" },
    { left: "3pt_made", right: "3pt_missed" },
    { left: "ft_made", right: "ft_missed" },
    { left: "pass", right: "rebound", category: "PLAY" },
    { left: "steal", right: "turnover" },
    { left: "foul", right: "timeout" },
    { left: "substitution" },
];

// ── Pending follow-up state ─────────────────────────────────

interface PendingFollowUp {
    eventKey: string;       // e.g. "substitution"
    followUp: FollowUp;     // the question + options
    clientTimestamp: number; // captured at first-tap time
    color: string;          // button color for overlay header
    shortLabel: string;     // e.g. "SUB"
}

// ── Component ───────────────────────────────────────────────

interface LabelingClientProps {
    match: Match;
}

export default function LabelingClient({ match }: LabelingClientProps) {
    const router = useRouter();
    const [events, setEvents] = useState<LabelEvent[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [flashBtn, setFlashBtn] = useState<string | null>(null);
    const [elapsed, setElapsed] = useState("00:00");
    const errorTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [queuedCount, setQueuedCount] = useState(0);
    const [pendingFollowUp, setPendingFollowUp] = useState<PendingFollowUp | null>(null);

    const eventTypes: EventType[] = match.eventTypes?.length
        ? match.eventTypes
        : DEFAULT_EVENT_TYPES;

    const getET = (key: string): EventType | undefined =>
        eventTypes.find((t) => t.key === key);

    // Timer
    useEffect(() => {
        if (!match.startedAt) return;
        const interval = setInterval(() => {
            setElapsed(formatElapsed(match.startedAt!));
        }, 1000);
        return () => clearInterval(interval);
    }, [match.startedAt]);

    // Load existing events on mount + flush offline queue
    useEffect(() => {
        fetch(`/api/events?matchId=${match.id}`)
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data)) setEvents(data);
            })
            .catch(() => { });

        flushOfflineQueue().then((synced) => {
            if (synced.length > 0) {
                setEvents((prev) => [...synced.reverse(), ...prev]);
            }
            setQueuedCount(getQueueLength());
        });

        const handleOnline = () => {
            flushOfflineQueue().then((synced) => {
                if (synced.length > 0) {
                    setEvents((prev) => [...synced.reverse(), ...prev]);
                }
                setQueuedCount(getQueueLength());
            });
        };
        window.addEventListener("online", handleOnline);
        return () => window.removeEventListener("online", handleOnline);
    }, [match.id]);

    const showError = useCallback((msg: string) => {
        setError(msg);
        if (errorTimeout.current) clearTimeout(errorTimeout.current);
        errorTimeout.current = setTimeout(() => setError(null), 3000);
    }, []);

    // ── Record an event (final) ─────────────────────────────
    const recordEvent = useCallback(
        async (eventType: string, clientTimestamp?: number) => {
            const ts = clientTimestamp ?? Date.now();

            // Flash the base key (strip suffix)
            const baseKey = eventType.split(":")[0];
            setFlashBtn(baseKey);
            setTimeout(() => setFlashBtn(null), 300);

            if (navigator.vibrate) navigator.vibrate(30);

            try {
                const res = await fetch("/api/events", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        matchId: match.id,
                        eventType,
                        clientTimestamp: ts,
                    }),
                });

                if (!res.ok) {
                    enqueueEvent({ matchId: match.id, eventType, clientTimestamp: ts });
                    setQueuedCount(getQueueLength());
                    showError("Queued offline");
                    return;
                }

                const event = (await res.json()) as LabelEvent;
                setEvents((prev) => [event, ...prev]);
            } catch {
                enqueueEvent({ matchId: match.id, eventType, clientTimestamp: ts });
                setQueuedCount(getQueueLength());
                showError("Offline — event queued");
            }
        },
        [match.id, showError]
    );

    // ── Handle initial button tap ───────────────────────────
    const handleButtonTap = useCallback(
        (eventKey: string) => {
            const et = getET(eventKey);
            if (!et) return;

            if (et.followUp) {
                // Show follow-up overlay — capture timestamp NOW
                if (navigator.vibrate) navigator.vibrate(30);
                setPendingFollowUp({
                    eventKey: et.key,
                    followUp: et.followUp,
                    clientTimestamp: Date.now(),
                    color: et.color,
                    shortLabel: et.shortLabel,
                });
            } else {
                // Direct record
                recordEvent(eventKey);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [recordEvent, eventTypes]
    );

    // ── Handle follow-up selection ──────────────────────────
    const handleFollowUpSelect = useCallback(
        (suffix: string) => {
            if (!pendingFollowUp) return;
            const compoundKey = `${pendingFollowUp.eventKey}:${suffix}`;
            recordEvent(compoundKey, pendingFollowUp.clientTimestamp);
            setPendingFollowUp(null);
        },
        [pendingFollowUp, recordEvent]
    );

    const cancelFollowUp = useCallback(() => {
        setPendingFollowUp(null);
    }, []);

    // Undo an event
    const undoEvent = useCallback(
        async (eventId: string) => {
            if (navigator.vibrate) navigator.vibrate([20, 30, 20]);

            try {
                const res = await fetch(
                    `/api/events/${eventId}?matchId=${match.id}`,
                    { method: "DELETE" }
                );

                if (!res.ok) {
                    showError("Failed to undo");
                    return;
                }

                setEvents((prev) =>
                    prev.map((e) =>
                        e.id === eventId ? { ...e, deleted: true } : e
                    )
                );
            } catch {
                showError("Network error — undo failed");
            }
        },
        [match.id, showError]
    );

    const recentEvents = events.filter((e) => !e.deleted).slice(0, 5);
    const activeCount = events.filter((e) => !e.deleted).length;

    // ── Resolve display label for compound event types ──────
    const getDisplayLabel = (eventType: string): string => {
        const parts = eventType.split(":");
        const baseKey = parts[0];
        const et = getET(baseKey);
        if (!et) return eventType;
        if (parts.length === 1) return et.shortLabel;

        // Build compact tag from suffix parts
        // "home" → "H", "away" → "A", "personal" → "PER", etc.
        const tags = parts.slice(1).map((p) => {
            if (p === "home") return "H";
            if (p === "away") return "A";
            return p.slice(0, 3).toUpperCase();
        });
        return `${et.shortLabel}·${tags.join("·")}`;
    };

    const getDisplayColor = (eventType: string): string | undefined => {
        const baseKey = eventType.split(":")[0];
        return getET(baseKey)?.color;
    };

    // ── Render a single event button ────────────────────────
    const renderBtn = (key: string, fullWidth?: boolean) => {
        const et = getET(key);
        if (!et) return null;
        const hasFollowUp = !!et.followUp;
        return (
            <button
                key={et.key}
                className={`event-btn ${flashBtn === et.key ? "flash" : ""} ${fullWidth ? "full-width" : ""}`}
                style={{ backgroundColor: et.color }}
                onClick={() => handleButtonTap(et.key)}
                id={`btn-${et.key}`}
            >
                <span className="btn-short">{et.shortLabel}</span>
                <span className="btn-label">
                    {et.label}
                    {hasFollowUp && " ›"}
                </span>
            </button>
        );
    };

    return (
        <div className="labeling-page">
            {/* Header */}
            <header className="labeling-header">
                <button className="back-btn" onClick={() => router.push("/")} aria-label="Back">
                    ←
                </button>
                <div className="match-info">
                    <h2>{match.name}</h2>
                    <div className="timer">
                        {match.startedAt ? elapsed : match.status}
                    </div>
                </div>
                <div className="event-count">
                    {activeCount}
                    {queuedCount > 0 && (
                        <span style={{ color: "var(--warning)", fontSize: "0.65rem", display: "block" }}>
                            +{queuedCount} queued
                        </span>
                    )}
                </div>
            </header>

            {/* Semantic Grid */}
            <div className="event-grid-v2">
                {GRID_LAYOUT.map((row, i) => (
                    <div key={i} className="grid-row-wrap">
                        {row.category && (
                            <div className="grid-section-label">{row.category}</div>
                        )}
                        <div className={`grid-row ${!row.right ? "single" : ""}`}>
                            {renderBtn(row.left, !row.right)}
                            {row.right && renderBtn(row.right)}
                        </div>
                    </div>
                ))}
            </div>

            {/* Undo Bar */}
            <div className="undo-bar">
                <span className="undo-label">Undo</span>
                {recentEvents.length === 0 ? (
                    <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        tap events above
                    </span>
                ) : (
                    recentEvents.map((e) => (
                        <button
                            key={e.id}
                            className="undo-chip"
                            onClick={() => undoEvent(e.id)}
                            style={{ borderColor: getDisplayColor(e.eventType) }}
                        >
                            <span>{getDisplayLabel(e.eventType)}</span>
                            <span className="time">{timeAgo(e.serverTimestamp)}</span>
                            <span className="x">✕</span>
                        </button>
                    ))
                )}
            </div>

            {/* Follow-Up Overlay */}
            {pendingFollowUp && (() => {
                const opts = pendingFollowUp.followUp.options;
                // Detect grid layout: options with "home:" and "away:" prefixes
                const homeOpts = opts.filter((o) => o.suffix.startsWith("home"));
                const awayOpts = opts.filter((o) => o.suffix.startsWith("away"));
                const isGrid = homeOpts.length > 0 && awayOpts.length > 0 && homeOpts.length === awayOpts.length;

                return (
                    <div className="followup-overlay" onClick={cancelFollowUp}>
                        <div className="followup-card" onClick={(e) => e.stopPropagation()}>
                            <div
                                className="followup-header"
                                style={{ backgroundColor: pendingFollowUp.color }}
                            >
                                <span className="followup-event">{pendingFollowUp.shortLabel}</span>
                            </div>
                            <div className="followup-question">{pendingFollowUp.followUp.question}</div>

                            {isGrid ? (
                                /* ── Grid layout: team columns × type rows ── */
                                <div className="followup-grid">
                                    <div className="followup-col-header home">{match.homeTeam}</div>
                                    <div className="followup-col-header away">{match.awayTeam}</div>
                                    {homeOpts.map((homeOpt, i) => {
                                        const awayOpt = awayOpts[i];
                                        return (
                                            <div key={i} className="followup-grid-row">
                                                <button
                                                    className="followup-btn"
                                                    style={{ backgroundColor: homeOpt.color }}
                                                    onClick={() => handleFollowUpSelect(homeOpt.suffix)}
                                                >
                                                    <span className="followup-btn-label">{homeOpt.label}</span>
                                                </button>
                                                <button
                                                    className="followup-btn"
                                                    style={{ backgroundColor: awayOpt.color }}
                                                    onClick={() => handleFollowUpSelect(awayOpt.suffix)}
                                                >
                                                    <span className="followup-btn-label">{awayOpt.label}</span>
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* ── Simple vertical layout (SUB, T/O) ── */
                                <div className="followup-options">
                                    {opts.map((opt) => (
                                        <button
                                            key={opt.suffix}
                                            className="followup-btn"
                                            style={{ backgroundColor: opt.color }}
                                            onClick={() => handleFollowUpSelect(opt.suffix)}
                                        >
                                            <span className="followup-btn-label">{opt.label}</span>
                                            <span className="followup-btn-team">
                                                {opt.suffix === "home" ? match.homeTeam : match.awayTeam}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}

                            <button className="followup-cancel" onClick={cancelFollowUp}>
                                Cancel
                            </button>
                        </div>
                    </div>
                );
            })()}

            {/* Error Toast */}
            {error && <div className="error-toast">{error}</div>}
        </div>
    );
}
