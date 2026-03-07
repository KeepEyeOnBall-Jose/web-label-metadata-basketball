import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addEvent, getEvents } from "@/lib/redis";
import { nanoid } from "nanoid";
import type { CreateEventPayload, LabelEvent } from "@/lib/types";

// POST /api/events — record a new event (server timestamps it)
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id || !session?.user?.email) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await req.json()) as CreateEventPayload;
    if (!body.matchId || !body.eventType || !body.clientTimestamp) {
        return NextResponse.json(
            { error: "Missing matchId, eventType, or clientTimestamp" },
            { status: 400 }
        );
    }

    const event: LabelEvent = {
        id: nanoid(12),
        matchId: body.matchId,
        userId: session.user.id,
        userEmail: session.user.email,
        eventType: body.eventType,
        serverTimestamp: Date.now(), // ← SOURCE OF TRUTH
        clientTimestamp: body.clientTimestamp,
        deleted: false,
    };

    await addEvent(event);
    return NextResponse.json(event, { status: 201 });
}

// GET /api/events?matchId=X — get current user's events for a match
export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const matchId = req.nextUrl.searchParams.get("matchId");
    if (!matchId) {
        return NextResponse.json({ error: "Missing matchId" }, { status: 400 });
    }

    const events = await getEvents(matchId, session.user.id);
    return NextResponse.json(events);
}
