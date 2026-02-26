/**
 * traceCache — persists agent trace entries in localStorage, keyed by
 * conversationId.  This lets users revisit the trace timeline after a
 * task has completed and the in-memory store has been cleared.
 *
 * Storage layout:
 *   localStorage["agent:trace-cache"] = JSON.stringify({
 *     [conversationId]: TraceEntry[]
 *   })
 */

import type { TraceEntry } from "@/types/agent.types";

const CACHE_KEY = "agent:trace-cache";
/** Maximum number of conversations to keep traces for */
const MAX_CACHED_CONVERSATIONS = 30;

function readCache(): Record<string, TraceEntry[]> {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, TraceEntry[]>) : {};
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, TraceEntry[]>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Storage quota exceeded or unavailable — silently ignore
  }
}

/**
 * Persist trace entries for a conversation.
 * Overwrites any previously cached traces for the same conversationId.
 */
export function saveTracesToCache(
  conversationId: string,
  traces: TraceEntry[],
): void {
  if (!conversationId || traces.length === 0) return;

  const cache = readCache();
  cache[conversationId] = traces;

  // Evict oldest entries if over limit
  const keys = Object.keys(cache);
  if (keys.length > MAX_CACHED_CONVERSATIONS) {
    for (let i = 0; i < keys.length - MAX_CACHED_CONVERSATIONS; i++) {
      delete cache[keys[i]];
    }
  }

  writeCache(cache);
}

/**
 * Load cached trace entries for a conversation.
 * Returns an empty array if nothing is cached.
 */
export function loadTracesFromCache(conversationId: string): TraceEntry[] {
  if (!conversationId) return [];
  const cache = readCache();
  return cache[conversationId] ?? [];
}

/**
 * Remove cached traces for a specific conversation.
 */
export function clearTracesFromCache(conversationId: string): void {
  const cache = readCache();
  if (conversationId in cache) {
    delete cache[conversationId];
    writeCache(cache);
  }
}
