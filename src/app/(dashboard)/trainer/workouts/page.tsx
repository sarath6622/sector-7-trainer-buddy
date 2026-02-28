'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { WorkoutLogCard } from '@/components/workouts/workout-log-card';
import { WorkoutDetailSheet } from '@/components/workouts/workout-detail-sheet';
import { AssignWorkoutForm } from '@/components/workouts/assign-workout-form';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Users } from 'lucide-react';
import type { WorkoutStatus } from '@/generated/prisma/enums';

interface SelectedWorkout {
    id: string;
    title?: string | null;
    date: Date;
    durationMin?: number | null;
    notes?: string | null;
    status: WorkoutStatus;
    exercises: any[];
}

// Trainer dashboard for managing client workouts — shows overview of all assigned clients
export default function TrainerWorkoutsPage() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [assignOpen, setAssignOpen] = useState(false);
    const [assignClientId, setAssignClientId] = useState<string | undefined>();
    const [detailWorkout, setDetailWorkout] = useState<SelectedWorkout | null>(null);

    const { data: overview, isLoading } = useQuery(trpc.workout.getTrainerOverview.queryOptions());

    function handleAssign(clientProfileId: string) {
        setAssignClientId(clientProfileId);
        setAssignOpen(true);
    }

    if (isLoading) {
        return (
            <div className="space-y-6">
                <PageHeader title="Workouts" description="Manage client workouts" />
                <div className="space-y-4">
                    {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-40 w-full rounded-xl" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader title="Workouts" description="Assign and track workouts for your clients" />

            {overview?.clients.length === 0 ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12 gap-3">
                        <Users className="h-10 w-10 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">No clients assigned to you yet.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-6">
                    {overview?.clients.map((client) => (
                        <Card key={client.clientProfileId}>
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-9 w-9">
                                            <AvatarImage src={client.image ?? undefined} />
                                            <AvatarFallback>{client.name?.charAt(0) ?? '?'}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <CardTitle className="text-base">{client.name ?? 'Client'}</CardTitle>
                                            <p className="text-xs text-muted-foreground">
                                                {client.recentWorkouts.length} recent workout{client.recentWorkouts.length !== 1 ? 's' : ''}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => handleAssign(client.clientProfileId)}
                                        className="gap-1.5"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        Assign
                                    </Button>
                                </div>
                            </CardHeader>

                            <CardContent>
                                {client.recentWorkouts.length === 0 ? (
                                    <p className="text-sm text-muted-foreground text-center py-4">No workouts yet. Assign one to get started.</p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {client.recentWorkouts.map((w) => (
                                            <WorkoutLogCard
                                                key={w.id}
                                                id={w.id}
                                                title={w.title}
                                                date={new Date(w.date)}
                                                status={w.status as WorkoutStatus}
                                                scheduledAt={w.scheduledAt ? new Date(w.scheduledAt) : null}
                                            />
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            <AssignWorkoutForm
                open={assignOpen}
                onOpenChange={setAssignOpen}
                defaultClientId={assignClientId}
                onSuccess={() => queryClient.invalidateQueries(trpc.workout.getTrainerOverview.queryFilter())}
            />

            <WorkoutDetailSheet
                open={!!detailWorkout}
                onOpenChange={(o) => !o && setDetailWorkout(null)}
                workout={detailWorkout}
            />
        </div>
    );
}
