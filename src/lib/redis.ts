import { Redis } from "@upstash/redis";
import type { Match, LabelEvent } from "./types";

// ── Redis client (uses env vars set by Vercel integration) ──
const redis = new Redis({
    url: process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
});

// ── Key helpers ─────────────────────────────────────────────

const keys = {
    match: (id: string) => `match:${id}`,
    activeMatches: () => "matches:active",
    events: (matchId: string, userId: string) => `events:${matchId}:${userId}`,
};

// ── Match operations ────────────────────────────────────────

export async function getMatch(id: string): Promise<Match | null> {
    return redis.get<Match>(keys.match(id));
}

export async function listActiveMatches(): Promise<Match[]> {
    const ids = await redis.smembers(keys.activeMatches());
    if (!ids.length) return [];

    const pipeline = redis.pipeline();
    for (const id of ids) {
        pipeline.get(keys.match(id));
    }
    const results = await pipeline.exec<(Match | null)[]>();
    return results.filter((m): m is Match => m !== null);
}

export async function createMatch(match: Match): Promise<void> {
    const pipeline = redis.pipeline();
    pipeline.set(keys.match(match.id), match);
    if (match.status !== "finished") {
        pipeline.sadd(keys.activeMatches(), match.id);
    }
    await pipeline.exec();
}

export async function updateMatchStatus(
    id: string,
    status: Match["status"]
): Promise<void> {
    const match = await getMatch(id);
    if (!match) throw new Error(`Match ${id} not found`);

    match.status = status;
    if (status === "live" && !match.startedAt) {
        match.startedAt = Date.now();
    }

    const pipeline = redis.pipeline();
    pipeline.set(keys.match(id), match);
    if (status === "finished") {
        pipeline.srem(keys.activeMatches(), id);
    }
    await pipeline.exec();
}

// ── Event operations ────────────────────────────────────────

export async function addEvent(event: LabelEvent): Promise<void> {
    const key = keys.events(event.matchId, event.userId);
    // Prepend so newest is first; cap at 2000 events per user per match
    await redis.lpush(key, event);
}

export async function getEvents(
    matchId: string,
    userId: string,
    limit = 200
): Promise<LabelEvent[]> {
    const key = keys.events(matchId, userId);
    return redis.lrange<LabelEvent>(key, 0, limit - 1);
}

export async function softDeleteEvent(
    matchId: string,
    userId: string,
    eventId: string
): Promise<boolean> {
    const key = keys.events(matchId, userId);
    const all = await redis.lrange<LabelEvent>(key, 0, -1);
    const idx = all.findIndex((e) => e.id === eventId);
    if (idx === -1) return false;

    const event = all[idx];
    if (event.deleted) return false;

    event.deleted = true;
    // Redis LSET replaces element at index
    await redis.lset(key, idx, event);
    return true;
}

export default redis;
