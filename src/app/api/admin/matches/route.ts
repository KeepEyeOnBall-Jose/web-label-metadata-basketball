import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createMatch, updateMatchStatus, getMatch } from "@/lib/redis";
import type { CreateMatchPayload, Match } from "@/lib/types";
import { DEFAULT_EVENT_TYPES } from "@/lib/types";

// Simple API-key protection for admin endpoints
function isAuthorized(req: NextRequest): boolean {
    const apiKey = req.headers.get("x-api-key");
    return apiKey === process.env.ADMIN_API_KEY;
}

// POST /api/admin/matches — create a new match
export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json()) as CreateMatchPayload;
    if (!body.name || !body.homeTeam || !body.awayTeam) {
        return NextResponse.json(
            { error: "Missing name, homeTeam, or awayTeam" },
            { status: 400 }
        );
    }

    const match: Match = {
        id: nanoid(10),
        name: body.name,
        homeTeam: body.homeTeam,
        awayTeam: body.awayTeam,
        status: "upcoming",
        eventTypes: body.eventTypes ?? DEFAULT_EVENT_TYPES,
        createdAt: Date.now(),
    };

    await createMatch(match);
    return NextResponse.json(match, { status: 201 });
}

// PATCH /api/admin/matches?id=X&status=live|finished|upcoming
export async function PATCH(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = req.nextUrl.searchParams.get("id");
    const status = req.nextUrl.searchParams.get("status") as
        | "upcoming"
        | "live"
        | "finished"
        | null;

    if (!id || !status) {
        return NextResponse.json(
            { error: "Missing id or status" },
            { status: 400 }
        );
    }

    try {
        await updateMatchStatus(id, status);
        const updated = await getMatch(id);
        return NextResponse.json(updated);
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 404 });
    }
}
