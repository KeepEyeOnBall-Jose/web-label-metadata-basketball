import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listActiveMatches, scanAllRecentEvents, ensureTestMatch } from "@/lib/redis";

const ROOT_EMAILS = [
    "jose@keepeyeonball.com",
    "david.cotaina@keepeyeonball.com",
    "vectorblanco@gmail.com",
];

/**
 * GET /api/admin/backend — Backend dashboard data
 * Session-gated to root users only.
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.email || !ROOT_EMAILS.includes(session.user.email)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        // Ensure test match always exists
        const testMatch = await ensureTestMatch();

        // Get all active matches
        const matches = await listActiveMatches();

        // Get recent labels and active users
        const { events: recentLabels, activeUsers } = await scanAllRecentEvents(50);

        return NextResponse.json({
            testMatch,
            matches,
            recentLabels,
            activeUsers,
            serverTime: Date.now(),
        });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
