import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listActiveMatches } from "@/lib/redis";

export async function GET() {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const matches = await listActiveMatches();
    return NextResponse.json(matches);
}
