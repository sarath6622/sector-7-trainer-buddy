'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { ClientCard } from '@/components/trainer/client-card';
import { ClientDetailSheet } from '@/components/trainer/client-detail-sheet';
import { AssignWorkoutForm } from '@/components/workouts/assign-workout-form';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users } from 'lucide-react';

// Trainer's client roster — click a card to open the full detail sheet
export default function TrainerClientsPage() {
    const trpc = useTRPC();
    const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
    const [assigningForClient, setAssigningForClient] = useState<string | null>(null);

    const { data: clients, isLoading } = useQuery(trpc.trainer.getClients.queryOptions());

    if (isLoading) {
        return (
            <div className="space-y-6">
                <PageHeader title="My Clients" description="View and manage your client roster" />
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <PageHeader
                title={`My Clients (${clients?.length ?? 0})`}
                description="Monitor progress and assign workouts for each client"
            />

            {(!clients || clients.length === 0) ? (
                <Card>
                    <CardContent className="flex flex-col items-center justify-center py-16 gap-3">
                        <Users className="h-10 w-10 text-muted-foreground/40" />
                        <p className="font-medium text-sm">No clients assigned yet</p>
                        <p className="text-xs text-muted-foreground text-center max-w-xs">
                            An admin will assign clients to you. Once assigned, they'll appear here.
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {clients.map((c) => (
                        <ClientCard
                            key={c.clientProfileId}
                            clientProfileId={c.clientProfileId}
                            name={c.name}
                            email={c.email}
                            image={c.image}
                            fitnessGoals={c.fitnessGoals}
                            lastWorkout={c.lastWorkout ? { title: c.lastWorkout.title, date: new Date(c.lastWorkout.date) } : null}
                            profileCompleted={c.profileCompleted}
                            onView={setSelectedClientId}
                            onAssignWorkout={setAssigningForClient}
                        />
                    ))}
                </div>
            )}

            <ClientDetailSheet
                clientProfileId={selectedClientId}
                open={!!selectedClientId}
                onOpenChange={(o) => !o && setSelectedClientId(null)}
            />

            <AssignWorkoutForm
                open={!!assigningForClient}
                onOpenChange={(o) => !o && setAssigningForClient(null)}
                defaultClientId={assigningForClient ?? undefined}
            />
        </div>
    );
}
