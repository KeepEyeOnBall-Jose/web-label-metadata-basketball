import LabelingClient from "../match/[id]/LabelingClient";
import { DEFAULT_EVENT_TYPES } from "@/lib/types";
import type { Match } from "@/lib/types";

/**
 * Demo page at /demo — renders the labeling grid without authentication.
 * Use this for local development and UI testing.
 */
export default function DemoPage() {
    const demoMatch: Match = {
        id: "demo",
        name: "Madrid Elite Blanco vs FGS Sports",
        homeTeam: "Madrid Elite Blanco",
        awayTeam: "FGS Sports C.D.E.",
        status: "live",
        eventTypes: DEFAULT_EVENT_TYPES,
        createdAt: Date.now(),
        startedAt: Date.now() - 60_000 * 12, // Started 12 minutes ago
    };

    return <LabelingClient match={demoMatch} />;
}
