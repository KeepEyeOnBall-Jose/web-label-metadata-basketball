"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Match, LabelEvent, EventType } from "@/lib/types";
import { DEFAULT_EVENT_TYPES } from "@/lib/types";

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

    const eventTypes: EventType[] = match.eventTypes?.length
        ? match.eventTypes
        : DEFAULT_EVENT_TYPES;

    // Timer
    useEffect(() => {
        if (!match.startedAt) return;
        const interval = setInterval(() => {
            setElapsed(formatElapsed(match.startedAt!));
        }, 1000);
        return () => clearInterval(interval);
    }, [match.startedAt]);

    // Load existing events on mount
    useEffect(() => {
        fetch(`/api/events?matchId=${match.id}`)
            .then((r) => r.json())
            .then((data) => {
                if (Array.isArray(data)) setEvents(data);
            })
            .catch(() => { });
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
                    showError("Failed to record event");
                    return;
                }

                const event = (await res.json()) as LabelEvent;
                setEvents((prev) => [event, ...prev]);
            } catch {
                showError("Network error — event not saved");
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
                <div className="event-count">{activeCount}</div>
            </header>

            {/* Event Grid */}
            <div className="event-grid">
                {eventTypes.map((et) => (
                    <button
                        key={et.key}
                        className={`event-btn ${flashBtn === et.key ? "flash" : ""}`}
                        style={{ backgroundColor: et.color }}
                        onClick={() => recordEvent(et.key)}
                        id={`btn-${et.key}`}
                    >
                        {et.shortLabel}
                        <span className="label">{et.label}</span>
                    </button>
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
