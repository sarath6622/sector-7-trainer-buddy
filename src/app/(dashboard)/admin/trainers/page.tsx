'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MappingTable } from '@/components/admin/mapping-table';
import { AssignClientDialog } from '@/components/admin/assign-client-dialog';
import { Plus, UserCheck } from 'lucide-react';
import { TRAINER_SPECIALTY_LABELS } from '@/lib/constants';
import type { TrainerSpecialty } from '@/generated/prisma/enums';

// Admin trainer management: list of all trainers + assignment dialog + active mappings table
export default function AdminTrainersPage() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [assignOpen, setAssignOpen] = useState(false);
    const [preselectedTrainerId, setPreselectedTrainerId] = useState<string | undefined>();

    const { data: trainers, isLoading } = useQuery(trpc.trainer.listAll.queryOptions());

    function handleAssign(trainerId?: string) {
        setPreselectedTrainerId(trainerId);
        setAssignOpen(true);
    }

    return (
        <div className="space-y-8">
            <div className="flex items-start justify-between gap-4">
                <PageHeader
                    title="Trainers"
                    description="Manage trainer profiles and client assignments"
                />
                <Button id="assign-client-btn" onClick={() => handleAssign()} className="gap-2 shrink-0">
                    <Plus className="h-4 w-4" />
                    Assign Client
                </Button>
            </div>

            {/* Trainer grid */}
            {isLoading ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {trainers?.map((t) => (
                        <Card key={t.id} className="hover:border-primary/30 transition-colors">
                            <CardHeader className="pb-2">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={t.user.image ?? undefined} />
                                        <AvatarFallback>{t.user.name?.charAt(0)?.toUpperCase() ?? '?'}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-sm truncate">{t.user.name ?? '—'}</p>
                                        <p className="text-xs text-muted-foreground truncate">{t.user.email}</p>
                                    </div>
                                    {t.profileCompleted && (
                                        <UserCheck className="h-4 w-4 text-green-400 shrink-0" />
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="space-y-3">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="text-muted-foreground">Clients</span>
                                    <Badge variant="secondary">{t.clientMappings.length}</Badge>
                                </div>
                                {t.specialties.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                        {t.specialties.slice(0, 3).map((s) => (
                                            <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                                                {TRAINER_SPECIALTY_LABELS[s as TrainerSpecialty] ?? s}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                <Button
                                    id={`assign-to-trainer-${t.id}`}
                                    size="sm"
                                    variant="outline"
                                    className="w-full h-7 text-xs"
                                    onClick={() => handleAssign(t.id)}
                                >
                                    Assign a Client
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Active mappings table */}
            <div className="space-y-3">
                <h2 className="text-lg font-semibold">Active Assignments</h2>
                <MappingTable onRefetch={() => queryClient.invalidateQueries(trpc.trainer.listAll.queryFilter())} />
            </div>

            <AssignClientDialog
                open={assignOpen}
                onOpenChange={setAssignOpen}
                defaultTrainerId={preselectedTrainerId}
            />
        </div>
    );
}
