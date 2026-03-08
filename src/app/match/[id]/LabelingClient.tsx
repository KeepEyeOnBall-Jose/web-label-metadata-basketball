"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Match, LabelEvent, EventType } from "@/lib/types";
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
// Rows define the semantic grid:
// - Scoring rows: success (left) / fail (right), ordered by frequency
// - Non-scoring rows: ordered by frequency, paired in 2-column

interface GridRow {
    left: string;       // event key for left button
    right?: string;     // event key for right button (omit for full-width)
    category?: string;  // optional section label
}

const GRID_LAYOUT: GridRow[] = [
    // ── Scoring: ✓ left, ✗ right, most frequent first ──
    { left: "2pt_made", right: "2pt_missed", category: "SCORING" },
    { left: "3pt_made", right: "3pt_missed" },
    { left: "ft_made", right: "ft_missed" },
    // ── Non-scoring: by frequency ──
    { left: "pass", right: "rebound", category: "PLAY" },
    { left: "foul", right: "turnover" },
    { left: "steal", right: "timeout" },
    { left: "substitution" },
];

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

    const eventTypes: EventType[] = match.eventTypes?.length
        ? match.eventTypes
        : DEFAULT_EVENT_TYPES;

    // Helper to find an EventType by key
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

        // Flush any offline-queued events
        flushOfflineQueue().then((synced) => {
            if (synced.length > 0) {
                setEvents((prev) => [...synced.reverse(), ...prev]);
            }
            setQueuedCount(getQueueLength());
        });

        // Re-flush when coming back online
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

    // Show error for 3 seconds
    const showError = useCallback((msg: string) => {
        setError(msg);
        if (errorTimeout.current) clearTimeout(errorTimeout.current);
        errorTimeout.current = setTimeout(() => setError(null), 3000);
    }, []);

    // Record an event
    const recordEvent = useCallback(
        async (eventType: string) => {
            // Flash animation
            setFlashBtn(eventType);
            setTimeout(() => setFlashBtn(null), 300);

            // Haptic feedback (if available)
            if (navigator.vibrate) {
                navigator.vibrate(30);
            }

            const clientTimestamp = Date.now();

            try {
                const res = await fetch("/api/events", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        matchId: match.id,
                        eventType,
                        clientTimestamp,
                    }),
                });

                if (!res.ok) {
                    // Server rejected — queue offline
                    enqueueEvent({ matchId: match.id, eventType, clientTimestamp });
                    setQueuedCount(getQueueLength());
                    showError("Queued offline");
                    return;
                }

                const event = (await res.json()) as LabelEvent;
                setEvents((prev) => [event, ...prev]);
            } catch {
                // Network failure — queue offline
                enqueueEvent({ matchId: match.id, eventType, clientTimestamp });
                setQueuedCount(getQueueLength());
                showError("Offline — event queued");
            }
        },
        [match.id, showError]
    );

    // Undo an event
    const undoEvent = useCallback(
        async (eventId: string) => {
            // Haptic
            if (navigator.vibrate) {
                navigator.vibrate([20, 30, 20]);
            }

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

    // Recent non-deleted events for the undo bar
    const recentEvents = events
        .filter((e) => !e.deleted)
        .slice(0, 5);

    const activeCount = events.filter((e) => !e.deleted).length;

    // ── Render a single event button ────────────────────────
    const renderBtn = (key: string, fullWidth?: boolean) => {
        const et = getET(key);
        if (!et) return null;
        return (
            <button
                key={et.key}
                className={`event-btn ${flashBtn === et.key ? "flash" : ""} ${fullWidth ? "full-width" : ""}`}
                style={{ backgroundColor: et.color }}
                onClick={() => recordEvent(et.key)}
                id={`btn-${et.key}`}
            >
                <span className="btn-short">{et.shortLabel}</span>
                <span className="btn-label">{et.label}</span>
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
                    recentEvents.map((e) => {
                        const et = eventTypes.find((t) => t.key === e.eventType);
                        return (
                            <button
                                key={e.id}
                                className="undo-chip"
                                onClick={() => undoEvent(e.id)}
                                style={{ borderColor: et?.color }}
                            >
                                <span>{et?.shortLabel || e.eventType}</span>
                                <span className="time">{timeAgo(e.serverTimestamp)}</span>
                                <span className="x">✕</span>
                            </button>
                        );
                    })
                )}
            </div>

            {/* Error Toast */}
            {error && <div className="error-toast">{error}</div>}
        </div>
    );
}
