"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import type { Match, LabelEvent } from "@/lib/types";
import type { ActiveUser } from "@/lib/redis";

interface BackendData {
    testMatch: Match;
    matches: Match[];
    recentLabels: LabelEvent[];
    activeUsers: ActiveUser[];
    serverTime: number;
}

function timeAgo(timestamp: number): string {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 5) return "just now";
    if (seconds < 60) return `${seconds}s ago`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    return `${hours}h ago`;
}

function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString("es-ES", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "Europe/Madrid",
    });
}

export default function BackendViewClient({ userEmail }: { userEmail: string }) {
    const [data, setData] = useState<BackendData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [lastRefresh, setLastRefresh] = useState(Date.now());

    const fetchData = useCallback(async () => {
        try {
            const res = await fetch("/api/admin/backend");
            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }
            const json = await res.json();
            setData(json);
            setError(null);
            setLastRefresh(Date.now());
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to fetch");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000);
        return () => clearInterval(interval);
    }, [fetchData]);

    // Real matches = all matches minus test-match
    const realMatches = data?.matches.filter((m) => m.id !== "test-match") ?? [];

    return (
        <main className="backend-page">
            {/* ── Header ── */}
            <header className="backend-header">
                <div>
                    <h1>🏀 Backend View</h1>
                    <span className="backend-user">{userEmail}</span>
                </div>
                <div className="backend-refresh">
                    {loading && <span className="spinner-sm" />}
                    <span className="backend-time">
                        Updated {timeAgo(lastRefresh)}
                    </span>
                </div>
            </header>

            {/* ── Match Day Disclaimer ── */}
            <div className="backend-disclaimer">
                <div className="disclaimer-icon">⚠️</div>
                <div className="disclaimer-content">
                    <h2>MATCH DAY — 8 March 2026</h2>
                    <div className="disclaimer-times">
                        <div className="disclaimer-row">
                            <span className="disclaimer-badge warmup">12:30</span>
                            <span>Warmup starts — connect to <strong>TEST EVENT</strong> to practice</span>
                        </div>
                        <div className="disclaimer-row">
                            <span className="disclaimer-badge live">13:15</span>
                            <span>REAL MATCH starts — switch to the <strong>REAL EVENT</strong></span>
                        </div>
                    </div>
                    <p className="disclaimer-rule">
                        👉 Before 13:15 → use the <strong>Test Match</strong> below.<br />
                        👉 At 13:15 → switch to the <strong>Real Match</strong>.
                    </p>
                </div>
            </div>

            {error && (
                <div className="backend-error">
                    ❌ {error}
                </div>
            )}

            {/* ── Test Match Card (always pinned) ── */}
            {data?.testMatch && (
                <section className="backend-section">
                    <h3 className="section-title">🧪 Test Match (Always Available)</h3>
                    <Link href={`/match/${data.testMatch.id}`} className="backend-match-card test">
                        <div>
                            <div className="match-card-name">{data.testMatch.name}</div>
                            <div className="match-card-teams">
                                {data.testMatch.homeTeam} vs {data.testMatch.awayTeam}
                            </div>
                        </div>
                        <span className="match-card-status live">LIVE</span>
                    </Link>
                </section>
            )}

            {/* ── Real Matches ── */}
            <section className="backend-section">
                <h3 className="section-title">🏟️ Active Matches</h3>
                {realMatches.length > 0 ? (
                    realMatches.map((match) => (
                        <Link
                            key={match.id}
                            href={`/match/${match.id}`}
                            className="backend-match-card"
                        >
                            <div>
                                <div className="match-card-name">{match.name}</div>
                                <div className="match-card-teams">
                                    {match.homeTeam} vs {match.awayTeam}
                                </div>
                            </div>
                            <span className={`match-card-status ${match.status}`}>
                                {match.status.toUpperCase()}
                            </span>
                        </Link>
                    ))
                ) : (
                    <div className="backend-empty">
                        No active matches right now. Create one via the admin API.
                    </div>
                )}
            </section>

            {/* ── Online Users ── */}
            <section className="backend-section">
                <h3 className="section-title">
                    👥 Active Users
                    {data?.activeUsers && (
                        <span className="section-count">{data.activeUsers.length}</span>
                    )}
                </h3>
                {data?.activeUsers && data.activeUsers.length > 0 ? (
                    <div className="backend-table">
                        <div className="table-header">
                            <span>Email</span>
                            <span>Last Seen</span>
                            <span>Events</span>
                        </div>
                        {data.activeUsers.map((user) => (
                            <div key={user.email} className="table-row">
                                <span className="user-email">{user.email}</span>
                                <span className="user-time">{timeAgo(user.lastSeen)}</span>
                                <span className="user-count">{user.totalEvents}</span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="backend-empty">No users have labelled yet.</div>
                )}
            </section>

            {/* ── Label Stream ── */}
            <section className="backend-section">
                <h3 className="section-title">
                    📡 Live Label Stream
                    {data?.recentLabels && (
                        <span className="section-count">{data.recentLabels.length}</span>
                    )}
                </h3>
                {data?.recentLabels && data.recentLabels.length > 0 ? (
                    <div className="label-stream">
                        {data.recentLabels.map((label) => (
                            <div key={label.id} className="label-row">
                                <span
                                    className="label-type"
                                    title={label.eventType}
                                >
                                    {label.eventType}
                                </span>
                                <span className="label-user">
                                    {label.userEmail.split("@")[0]}
                                </span>
                                <span className="label-time">
                                    {formatTime(label.serverTimestamp)}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="backend-empty">No labels recorded yet.</div>
                )}
            </section>
        </main>
    );
}
