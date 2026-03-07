import { auth } from "@/lib/auth";
import { getMatch } from "@/lib/redis";
import { redirect } from "next/navigation";
import LabelingClient from "./LabelingClient";
import { DEFAULT_EVENT_TYPES } from "@/lib/types";
import type { Match } from "@/lib/types";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function MatchPage({ params }: PageProps) {
    const session = await auth();
    if (!session?.user) {
        redirect("/");
    }

    const { id } = await params;

    let match: Match | null = null;
    try {
        match = await getMatch(id);
    } catch {
        // Redis not configured — fall through to demo mode
    }

    // If match not found, create a demo match for local dev
    if (!match) {
        match = {
            id,
            name: `Match ${id}`,
            homeTeam: "Home",
            awayTeam: "Away",
            status: "live",
            eventTypes: DEFAULT_EVENT_TYPES,
            createdAt: Date.now(),
            startedAt: Date.now(),
        };
    }

    return <LabelingClient match={match} />;
}
