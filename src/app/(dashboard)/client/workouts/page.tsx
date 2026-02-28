'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { WorkoutLogCard } from '@/components/workouts/workout-log-card';
import { WorkoutDetailSheet } from '@/components/workouts/workout-detail-sheet';
import { WorkoutLogger } from '@/components/workouts/workout-logger';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dumbbell, Plus } from 'lucide-react';
import type { WorkoutStatus } from '@/generated/prisma/enums';

type WorkoutEntry = {
    id: string;
    title?: string | null;
    date: Date;
    durationMin?: number | null;
    notes?: string | null;
    status: WorkoutStatus;
    scheduledAt?: Date | null;
    exercises: Array<{
        id: string;
        orderIndex: number;
        notes?: string | null;
        sets: Array<{ setNumber: number; reps?: number | null; weightKg?: number | null }>;
        exercise: { id: string; name: string; primaryMuscle: string };
    }>;
};

// Client view of their workouts — assigned workouts tab + completed history tab
export default function ClientWorkoutsPage() {
    const trpc = useTRPC();
    const [loggerOpen, setLoggerOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'assigned' | 'history'>('assigned');
    const [selectedWorkout, setSelectedWorkout] = useState<WorkoutEntry | null>(null);
    const [completingWorkout, setCompletingWorkout] = useState<WorkoutEntry | null>(null);

    const { data: assignedData, isLoading: loadingAssigned } = useQuery(
        trpc.workout.list.queryOptions({ status: 'ASSIGNED', limit: 20 }),
    );
    const { data: historyData, isLoading: loadingHistory } = useQuery(
        trpc.workout.list.queryOptions({ status: 'COMPLETED', limit: 20 }),
    );

    const isLoading = loadingAssigned || loadingHistory;

    if (isLoading) {
        return (
            <div className="space-y-6">
                <PageHeader title="My Workouts" description="Log and track your training" />
                <div className="grid gap-3 sm:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, i) => (
                        <Skeleton key={i} className="h-32 rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    const assigned = (assignedData?.workouts as unknown as WorkoutEntry[]) ?? [];
    const history = (historyData?.workouts as unknown as WorkoutEntry[]) ?? [];

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between gap-4">
                <PageHeader
                    title="My Workouts"
                    description="Log your sessions and track your progress"
                />
                <Button id="start-workout-btn" onClick={() => setLoggerOpen(true)} className="gap-2 shrink-0">
                    <Plus className="h-4 w-4" />
                    Log Workout
                </Button>
            </div>

            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
                <TabsList className="w-full sm:w-auto">
                    <TabsTrigger value="assigned" className="flex-1 sm:flex-none">
                        Assigned
                        {assigned.length > 0 && (
                            <span className="ml-1.5 text-xs bg-primary/20 text-primary px-1.5 py-0.5 rounded-full">
                                {assigned.length}
                            </span>
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="history" className="flex-1 sm:flex-none">History</TabsTrigger>
                </TabsList>

                <TabsContent value="assigned" className="mt-4">
                    {assigned.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                                <Dumbbell className="h-10 w-10 text-muted-foreground/40" />
                                <p className="text-sm text-muted-foreground">No assigned workouts. Your trainer will add some soon.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {assigned.map((w) => (
                                <div key={w.id} className="space-y-2">
                                    <WorkoutLogCard
                                        id={w.id}
                                        title={w.title}
                                        date={new Date(w.date)}
                                        status={w.status}
                                        scheduledAt={w.scheduledAt ? new Date(w.scheduledAt) : null}
                                        exerciseCount={w.exercises.length}
                                        muscleGroups={w.exercises.map((e) => e.exercise.primaryMuscle)}
                                        onClick={() => setSelectedWorkout(w)}
                                    />
                                    <Button
                                        id={`start-assigned-${w.id}`}
                                        size="sm"
                                        variant="outline"
                                        className="w-full gap-2"
                                        onClick={() => setCompletingWorkout(w)}
                                    >
                                        <Dumbbell className="h-3.5 w-3.5" />
                                        Start &amp; Log
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>

                <TabsContent value="history" className="mt-4">
                    {history.length === 0 ? (
                        <Card>
                            <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                                <Dumbbell className="h-10 w-10 text-muted-foreground/40" />
                                <p className="text-sm text-muted-foreground">No completed workouts yet. Start logging!</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2">
                            {history.map((w) => (
                                <WorkoutLogCard
                                    key={w.id}
                                    id={w.id}
                                    title={w.title}
                                    date={new Date(w.date)}
                                    durationMin={w.durationMin}
                                    status={w.status}
                                    exerciseCount={w.exercises.length}
                                    muscleGroups={w.exercises.map((e) => e.exercise.primaryMuscle)}
                                    onClick={() => setSelectedWorkout(w)}
                                />
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* Self-log new workout */}
            <WorkoutLogger open={loggerOpen} onOpenChange={setLoggerOpen} />

            {/* Complete an assigned workout */}
            {completingWorkout && (
                <WorkoutLogger
                    open={!!completingWorkout}
                    onOpenChange={(o) => !o && setCompletingWorkout(null)}
                    assignedWorkout={completingWorkout as any}
                    onSuccess={() => setCompletingWorkout(null)}
                />
            )}

            {/* Full workout detail */}
            <WorkoutDetailSheet
                open={!!selectedWorkout}
                onOpenChange={(o) => !o && setSelectedWorkout(null)}
                workout={selectedWorkout as any}
            />
        </div>
    );
}
