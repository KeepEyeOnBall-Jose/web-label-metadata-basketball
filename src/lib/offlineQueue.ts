"use client";

import type { CreateEventPayload, LabelEvent } from "./types";

const QUEUE_KEY = "bball-offline-queue";

interface QueuedEvent {
    payload: CreateEventPayload;
    queuedAt: number;
}

/** Get all queued events from localStorage */
export function getOfflineQueue(): QueuedEvent[] {
    if (typeof window === "undefined") return [];
    try {
        const raw = localStorage.getItem(QUEUE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/** Add an event to the offline queue */
export function enqueueEvent(payload: CreateEventPayload): void {
    const queue = getOfflineQueue();
    queue.push({ payload, queuedAt: Date.now() });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/** Remove specific events from the queue (after successful sync) */
function dequeueEvents(count: number): void {
    const queue = getOfflineQueue();
    queue.splice(0, count);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Flush the offline queue — attempt to POST all queued events to the server.
 * Returns the successfully synced events.
 */
export async function flushOfflineQueue(): Promise<LabelEvent[]> {
    const queue = getOfflineQueue();
    if (queue.length === 0) return [];

    const synced: LabelEvent[] = [];
    let consecutiveFailures = 0;

    for (const item of queue) {
        try {
            const res = await fetch("/api/events", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(item.payload),
            });

            if (res.ok) {
                const event = (await res.json()) as LabelEvent;
                synced.push(event);
                consecutiveFailures = 0;
            } else {
                consecutiveFailures++;
            }
        } catch {
            consecutiveFailures++;
        }

        // If we get 3 failures in a row, stop trying (probably still offline)
        if (consecutiveFailures >= 3) break;
    }

    // Remove successfully synced events from the front of the queue
    if (synced.length > 0) {
        dequeueEvents(synced.length);
    }

    return synced;
}

/** Check how many events are queued */
export function getQueueLength(): number {
    return getOfflineQueue().length;
}
