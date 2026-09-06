/**
 * Tententoon CRUD over the localStorage index + per-id state, plus the
 * IDB blob store for source images. State writes are synchronous because
 * localStorage is sync; blob ops are async because IDB is.
 *
 * V1 surface: create, load, writeState, list, getCurrentId, setCurrentId,
 * generateName. Rename / delete arrive in V3.
 */

import {
  LS_CURRENT,
  LS_INDEX,
  stateKey,
  type IndexEntry,
  type SourceRef,
  type TtState
} from './schema';

function readIndex(): IndexEntry[] {
  try {
    const raw = localStorage.getItem(LS_INDEX);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e) =>
        e &&
        typeof e.id === 'string' &&
        typeof e.name === 'string' &&
        typeof e.createdAt === 'number' &&
        typeof e.updatedAt === 'number'
    );
  } catch {
    return [];
  }
}

function writeIndex(entries: IndexEntry[]): void {
  try {
    localStorage.setItem(LS_INDEX, JSON.stringify(entries));
  } catch {}
}

function upsertIndex(entry: IndexEntry): void {
  const all = readIndex();
  const i = all.findIndex((e) => e.id === entry.id);
  if (i >= 0) all[i] = entry;
  else all.push(entry);
  writeIndex(all);
}

export function list(): IndexEntry[] {
  return readIndex().slice().sort((a, b) => b.createdAt - a.createdAt);
}

export function getCurrentId(): string | null {
  try {
    return localStorage.getItem(LS_CURRENT);
  } catch {
    return null;
  }
}

export function setCurrentId(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(LS_CURRENT);
    else localStorage.setItem(LS_CURRENT, id);
  } catch {}
}

export function readState(id: string): TtState | null {
  try {
    const raw = localStorage.getItem(stateKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as TtState;
  } catch {
    return null;
  }
}

export function writeState(id: string, state: TtState): void {
  const now = Date.now();
  try {
    localStorage.setItem(stateKey(id), JSON.stringify(state));
  } catch {}
  const all = readIndex();
  const entry = all.find((e) => e.id === id);
  if (entry) {
    entry.updatedAt = now;
    if (state.imageName && entry.name === '' /* never override a user-named entry */) {
      // V3 introduces rename; until then names come from the import filename.
    }
    writeIndex(all);
  }
}

/**
 * Build a default human-readable name from the source's filename and
 * a timestamp. Falls back to "Untitled" when no filename is known
 * (e.g. URL sources or fresh tententoons).
 */
export function generateName(imageName: string): string {
  const stamp = new Date();
  const ts =
    stamp.getFullYear() +
    '-' +
    String(stamp.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(stamp.getDate()).padStart(2, '0') +
    ' ' +
    String(stamp.getHours()).padStart(2, '0') +
    ':' +
    String(stamp.getMinutes()).padStart(2, '0');
  const base = imageName.trim() || 'Untitled';
  return `${base} · ${ts}`;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `tt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Create a new tententoon. Sets it as the current id. Caller is
 * responsible for any blob import — pass the resulting SourceRef in
 * `state.source` (or leave null for an unbound tententoon).
 */
export function create(state: TtState, name?: string): IndexEntry {
  const id = uuid();
  const now = Date.now();
  const entry: IndexEntry = {
    id,
    name: name ?? generateName(state.imageName),
    createdAt: now,
    updatedAt: now
  };
  upsertIndex(entry);
  try {
    localStorage.setItem(stateKey(id), JSON.stringify(state));
  } catch {}
  setCurrentId(id);
  return entry;
}

/**
 * Resolve an id to its index entry + state. Returns null if anything
 * referenced is missing (id without state, etc.) so callers can fall
 * through to the empty editor without crashing on partial storage.
 */
export function load(id: string): { entry: IndexEntry; state: TtState } | null {
  const entry = readIndex().find((e) => e.id === id);
  if (!entry) return null;
  const state = readState(id);
  if (!state) return null;
  return { entry, state };
}

/** Update the display name of a tententoon. Does not touch updatedAt. */
export function rename(id: string, name: string): void {
  const all = readIndex();
  const entry = all.find((e) => e.id === id);
  if (!entry) return;
  entry.name = name;
  writeIndex(all);
}

/**
 * Remove a tententoon. Drops the per-id state and the index entry.
 * V3 stub for undo/thumb cleanup — both stores stay empty until V5
 * populates them, so nothing to remove here. Orphan blob GC also
 * lands in V5; imports referenced only by this entry stay in the
 * `blobs` IDB store until then.
 */
export function remove(id: string): void {
  try {
    localStorage.removeItem(stateKey(id));
  } catch {}
  const all = readIndex();
  const next = all.filter((e) => e.id !== id);
  writeIndex(next);
  if (getCurrentId() === id) setCurrentId(null);
}

export type { IndexEntry, TtState, SourceRef };
