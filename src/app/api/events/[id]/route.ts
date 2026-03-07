import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { softDeleteEvent } from "@/lib/redis";

// DELETE /api/events/[id] — soft-delete (undo) an event
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const matchId = req.nextUrl.searchParams.get("matchId");
  if (!matchId) {
    return NextResponse.json({ error: "Missing matchId" }, { status: 400 });
  }

  const deleted = await softDeleteEvent(matchId, session.user.id, id);
  if (!deleted) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
