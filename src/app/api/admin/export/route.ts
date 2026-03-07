import { NextRequest, NextResponse } from "next/server";
import { getMatch } from "@/lib/redis";
import redis from "@/lib/redis";
import type { LabelEvent } from "@/lib/types";

// Simple API-key protection
function isAuthorized(req: NextRequest): boolean {
    const apiKey = req.headers.get("x-api-key");
    return apiKey === process.env.ADMIN_API_KEY;
}

/**
 * GET /api/admin/export?matchId=X[&format=json|csv][&includeDeleted=true]
 *
 * Export all label events for a match, across ALL users.
 * Returns a combined, chronologically-sorted dataset.
 */
export async function GET(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const matchId = req.nextUrl.searchParams.get("matchId");
    if (!matchId) {
        return NextResponse.json({ error: "Missing matchId" }, { status: 400 });
    }

    const format = req.nextUrl.searchParams.get("format") ?? "json";
    const includeDeleted =
        req.nextUrl.searchParams.get("includeDeleted") === "true";

    // Get match metadata
    const match = await getMatch(matchId);

    // Discover all user event keys for this match
    const allKeys: string[] = [];
    let cursor = "0";
    do {
        const result = await redis.scan(cursor, {
            match: `events:${matchId}:*`,
            count: 100,
        });
        cursor = String(result[0]);
        allKeys.push(...result[1]);
    } while (cursor !== "0");

    // Collect all events from all users
    const allEvents: LabelEvent[] = [];
    for (const key of allKeys) {
        const events = await redis.lrange<LabelEvent>(key, 0, -1);
        allEvents.push(...events);
    }

    // Filter deleted events unless explicitly included
    const filtered = includeDeleted
        ? allEvents
        : allEvents.filter((e) => !e.deleted);

    // Sort chronologically by server timestamp
    filtered.sort((a, b) => a.serverTimestamp - b.serverTimestamp);

    // CSV format
    if (format === "csv") {
        const headers = [
            "id",
            "matchId",
            "userId",
            "userEmail",
            "eventType",
            "serverTimestamp",
            "clientTimestamp",
            "deleted",
        ];
        const rows = filtered.map((e) =>
            [
                e.id,
                e.matchId,
                e.userId,
                e.userEmail,
                e.eventType,
                e.serverTimestamp,
                e.clientTimestamp,
                e.deleted,
            ].join(",")
        );
        const csv = [headers.join(","), ...rows].join("\n");

        return new NextResponse(csv, {
            headers: {
                "Content-Type": "text/csv",
                "Content-Disposition": `attachment; filename="events-${matchId}.csv"`,
            },
        });
    }

    // JSON format (default)
    return NextResponse.json({
        match: match ?? { id: matchId },
        totalEvents: filtered.length,
        totalUsers: allKeys.length,
        events: filtered,
    });
}
