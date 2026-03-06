import { openDB, type IDBPDatabase, type DBSchema } from 'idb';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OfflineSet {
  setNumber: number;
  reps?: number;
  weightKg?: number;
  rpe?: number;
  durationSec?: number;
  restSec?: number;
  isWarmup?: boolean;
  isDropSet?: boolean;
}

export interface OfflineExerciseEntry {
  exerciseId: string;
  orderIndex: number;
  notes?: string;
  sets: OfflineSet[];
}

export interface PendingLogPayload {
  title?: string;
  notes?: string;
  durationMin?: number;
  exercises: OfflineExerciseEntry[];
}

export interface PendingCompletePayload {
  id: string; // assigned WorkoutLog.id
  durationMin?: number;
  notes?: string;
  exercises: OfflineExerciseEntry[];
}

export interface PendingWorkout {
  id: string;                                    // client UUID — IndexedDB key
  type: 'log' | 'complete';                      // which tRPC mutation to call on sync
  queuedAt: number;                              // Date.now() — for FIFO ordering
  payload: PendingLogPayload | PendingCompletePayload;
}

// Minimal exercise shape stored for offline search in WorkoutLogger
export interface CachedExercise {
  id: string;
  name: string;
  primaryMuscle: string;
  category: string;
  difficulty: string;
  equipment?: string;
}

// ─── DB Schema ───────────────────────────────────────────────────────────────

interface Sector7DB extends DBSchema {
  pendingWorkouts: {
    key: string;
    value: PendingWorkout;
  };
  exerciseCache: {
    key: string;
    value: CachedExercise;
    indexes: { name: string };
  };
}

// ─── Singleton ───────────────────────────────────────────────────────────────

const DB_NAME = 'sector7-offline';
const DB_VERSION = 1;

// Lazily opened so SSR never touches IndexedDB
let dbPromise: Promise<IDBPDatabase<Sector7DB>> | null = null;

function getDb(): Promise<IDBPDatabase<Sector7DB>> {
  if (!dbPromise) {
    dbPromise = openDB<Sector7DB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pendingWorkouts')) {
          db.createObjectStore('pendingWorkouts', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('exerciseCache')) {
          const store = db.createObjectStore('exerciseCache', { keyPath: 'id' });
          store.createIndex('name', 'name', { unique: false });
        }
      },
    });
  }
  return dbPromise;
}

// ─── Pending Workout Queue ────────────────────────────────────────────────────

// Appends a workout to the offline queue; order is preserved by queuedAt timestamp
export async function enqueuePendingWorkout(workout: PendingWorkout): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await getDb();
  await db.put('pendingWorkouts', workout);
}

// Returns all pending workouts sorted ascending by queuedAt for FIFO replay
export async function getPendingWorkouts(): Promise<PendingWorkout[]> {
  if (typeof window === 'undefined') return [];
  const db = await getDb();
  const all = await db.getAll('pendingWorkouts');
  return all.sort((a, b) => a.queuedAt - b.queuedAt);
}

// Removes a successfully synced workout from the queue by its client-generated id
export async function removePendingWorkout(id: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await getDb();
  await db.delete('pendingWorkouts', id);
}

// Returns count without loading all records — used to initialise the badge on mount
export async function getPendingWorkoutCount(): Promise<number> {
  if (typeof window === 'undefined') return 0;
  const db = await getDb();
  return db.count('pendingWorkouts');
}

// ─── Exercise Cache ───────────────────────────────────────────────────────────

// Replaces the entire exercise cache in one transaction to avoid stale partial state
export async function cacheExercises(exercises: CachedExercise[]): Promise<void> {
  if (typeof window === 'undefined') return;
  const db = await getDb();
  const tx = db.transaction('exerciseCache', 'readwrite');
  await tx.store.clear();
  await Promise.all(exercises.map((ex) => tx.store.put(ex)));
  await tx.done;
}

// Case-insensitive name-contains search against the local cache for offline exercise picker
export async function searchCachedExercises(query: string): Promise<CachedExercise[]> {
  if (typeof window === 'undefined') return [];
  const db = await getDb();
  const all = await db.getAll('exerciseCache');
  if (!query.trim()) return all.slice(0, 20);
  const lower = query.toLowerCase();
  return all.filter((ex) => ex.name.toLowerCase().includes(lower)).slice(0, 20);
}
