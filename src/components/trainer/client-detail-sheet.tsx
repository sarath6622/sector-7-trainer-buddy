'use client';

import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { WorkoutLogCard } from '@/components/workouts/workout-log-card';
import { Dumbbell, Ruler, Weight, Calendar } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import type { WorkoutStatus } from '@/generated/prisma/enums';

interface ClientDetailSheetProps {
    clientProfileId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onAssignWorkout?: (clientProfileId: string) => void;
}

// Slide-in panel showing full client profile stats and recent workout history
export function ClientDetailSheet({ clientProfileId, open, onOpenChange, onAssignWorkout }: ClientDetailSheetProps) {
    const trpc = useTRPC();

    const { data: client, isLoading } = useQuery({
        ...trpc.trainer.getClientDetail.queryOptions({ clientProfileId: clientProfileId! }),
        enabled: !!clientProfileId && open,
    });

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
                <SheetHeader className="px-6 pt-6 pb-4">
                    <SheetTitle>Client Profile</SheetTitle>
                    <SheetDescription>Full profile and workout history</SheetDescription>
                </SheetHeader>

                {isLoading ? (
                    <div className="px-6 space-y-4">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-24 w-full" />
                        <Skeleton className="h-32 w-full" />
                    </div>
                ) : client ? (
                    <ScrollArea className="flex-1 px-6 pb-6">
                        {/* Identity */}
                        <div className="flex items-center gap-4 mb-4">
                            <Avatar className="h-14 w-14 ring-2 ring-border">
                                <AvatarImage src={client.user.image ?? undefined} />
                                <AvatarFallback className="text-lg font-bold">
                                    {client.user.name?.charAt(0)?.toUpperCase() ?? '?'}
                                </AvatarFallback>
                            </Avatar>
                            <div>
                                <p className="font-semibold">{client.user.name ?? 'Unnamed Client'}</p>
                                <p className="text-sm text-muted-foreground">{client.user.email}</p>
                            </div>
                        </div>

                        <Separator className="mb-4" />

                        {/* Body stats */}
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            {client.heightCm && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Ruler className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-muted-foreground">Height</span>
                                    <span className="font-medium ml-auto">{client.heightCm} cm</span>
                                </div>
                            )}
                            {client.weightKg && (
                                <div className="flex items-center gap-2 text-sm">
                                    <Weight className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-muted-foreground">Weight</span>
                                    <span className="font-medium ml-auto">{client.weightKg} kg</span>
                                </div>
                            )}
                            {client.dateOfBirth && (
                                <div className="flex items-center gap-2 text-sm col-span-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-muted-foreground">DOB</span>
                                    <span className="font-medium ml-auto">
                                        {new Date(client.dateOfBirth).toLocaleDateString()}
                                    </span>
                                </div>
                            )}
                        </div>

                        {/* Fitness goals */}
                        {client.fitnessGoals.length > 0 && (
                            <div className="mb-4">
                                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Goals</p>
                                <div className="flex flex-wrap gap-1">
                                    {client.fitnessGoals.map((g) => (
                                        <Badge key={g} variant="secondary" className="text-xs">
                                            {g.replace(/_/g, ' ')}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        )}

                        <Separator className="mb-4" />

                        {/* Recent workouts */}
                        <div>
                            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">
                                Recent Workouts ({client.workoutLogs.length})
                            </p>
                            {client.workoutLogs.length === 0 ? (
                                <div className="flex flex-col items-center gap-2 py-6">
                                    <Dumbbell className="h-8 w-8 text-muted-foreground/40" />
                                    <p className="text-sm text-muted-foreground">No completed workouts yet</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {client.workoutLogs.map((w) => (
                                        <WorkoutLogCard
                                            key={w.id}
                                            id={w.id}
                                            title={w.title}
                                            date={new Date(w.date)}
                                            status={w.status as WorkoutStatus}
                                            durationMin={w.durationMin}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </ScrollArea>
                ) : (
                    <div className="flex-1 flex items-center justify-center">
                        <p className="text-muted-foreground text-sm">Client not found</p>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
