import 'server-only';
import { db } from '@/lib/db';

export class WorkoutService {
    // Counts consecutive calendar days (ending today) with at least one COMPLETED workout
    static async calculateStreak(clientProfileId: string): Promise<number> {
        const logs = await db.workoutLog.findMany({
            where: { clientId: clientProfileId, status: 'COMPLETED' },
            select: { date: true },
            orderBy: { date: 'desc' },
        });

        if (logs.length === 0) return 0;

        // Normalise each log date to midnight UTC for day-boundary comparisons
        const uniqueDays = [
            ...new Set(logs.map((l) => l.date.toISOString().slice(0, 10))),
        ].sort((a, b) => (a < b ? 1 : -1)); // descending

        const today = new Date().toISOString().slice(0, 10);
        let streak = 0;
        let expected = today;

        for (const day of uniqueDays) {
            if (day === expected) {
                streak++;
                // Move expected back one calendar day
                const d = new Date(expected);
                d.setUTCDate(d.getUTCDate() - 1);
                expected = d.toISOString().slice(0, 10);
            } else if (day < expected) {
                // Gap found — also allow yesterday as start (workout not done today yet)
                if (streak === 0) {
                    const yesterday = new Date();
                    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
                    const yesterdayStr = yesterday.toISOString().slice(0, 10);
                    if (day === yesterdayStr) {
                        streak++;
                        const d = new Date(yesterdayStr);
                        d.setUTCDate(d.getUTCDate() - 1);
                        expected = d.toISOString().slice(0, 10);
                        continue;
                    }
                }
                break;
            }
        }

        return streak;
    }

    // Counts COMPLETED workouts in the current ISO week (Monday–Sunday)
    static async getWeeklyCount(clientProfileId: string): Promise<number> {
        const now = new Date();
        // ISO week starts Monday: day 0=Sun,1=Mon…6=Sat → shift so Mon=0
        const dow = (now.getUTCDay() + 6) % 7;
        const monday = new Date(now);
        monday.setUTCDate(now.getUTCDate() - dow);
        monday.setUTCHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setUTCDate(monday.getUTCDate() + 6);
        sunday.setUTCHours(23, 59, 59, 999);

        return db.workoutLog.count({
            where: {
                clientId: clientProfileId,
                status: 'COMPLETED',
                date: { gte: monday, lte: sunday },
            },
        });
    }

    // Returns total lifted volume (Σ reps × weightKg) for a single workout log
    static async getTotalVolume(workoutLogId: string): Promise<number> {
        const sets = await db.workoutSet.findMany({
            where: { workoutExercise: { workoutLogId } },
            select: { reps: true, weightKg: true },
        });

        return sets.reduce((sum, s) => {
            if (s.reps != null && s.weightKg != null) {
                return sum + s.reps * s.weightKg;
            }
            return sum;
        }, 0);
    }

    // Verifies a trainer has an active mapping to the given client profile — guards against cross-trainer access
    static async canTrainerAccessClient(
        trainerUserId: string,
        clientProfileId: string,
    ): Promise<boolean> {
        const trainerProfile = await db.trainerProfile.findUnique({
            where: { userId: trainerUserId },
            select: { id: true },
        });
        if (!trainerProfile) return false;

        const mapping = await db.trainerClientMapping.findFirst({
            where: {
                trainerId: trainerProfile.id,
                clientId: clientProfileId,
                isActive: true,
            },
        });

        return mapping !== null;
    }

    // Returns the total number of COMPLETED workouts for a client
    static async getTotalWorkouts(clientProfileId: string): Promise<number> {
        return db.workoutLog.count({
            where: { clientId: clientProfileId, status: 'COMPLETED' },
        });
    }
}
