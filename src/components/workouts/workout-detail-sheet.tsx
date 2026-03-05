'use client';

import { useQuery } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { Clock, Dumbbell, Pencil, StickyNote } from 'lucide-react';
import { MUSCLE_GROUP_LABELS } from '@/lib/constants';
import { useTRPC } from '@/trpc/client';
import type { MuscleGroup } from '@/generated/prisma/enums';

interface WorkoutSet {
    id: string;
    setNumber: number;
    reps?: number | null;
    weightKg?: number | null;
    rpe?: number | null;
    durationSec?: number | null;
    isWarmup: boolean;
    isDropSet: boolean;
}

// Formats a set row into a human-readable summary (80 kg × 10 · RPE 8)
function formatSet(set: WorkoutSet): string {
    const parts: string[] = [];
    if (set.weightKg != null) parts.push(`${set.weightKg} kg`);
    if (set.reps != null) parts.push(`× ${set.reps}`);
    if (set.durationSec != null) parts.push(`${set.durationSec}s`);
    if (set.rpe != null) parts.push(`· RPE ${set.rpe}`);
    return parts.join(' ') || '—';
}

interface WorkoutDetailSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workoutId: string | null;
    /** If provided, an Edit button is shown for ASSIGNED workouts */
    onEdit?: (workoutId: string) => void;
}

export function WorkoutDetailSheet({ open, onOpenChange, workoutId, onEdit }: WorkoutDetailSheetProps) {
    const trpc = useTRPC();

    const { data: workout, isLoading } = useQuery({
        ...trpc.workout.getById.queryOptions({ id: workoutId! }),
        enabled: open && !!workoutId,
    });

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
                {isLoading || !workout ? (
                    <div className="px-6 pt-6 space-y-4">
                        <Skeleton className="h-6 w-48" />
                        <Skeleton className="h-4 w-32" />
                        <Separator />
                        <div className="space-y-3 pt-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <Skeleton key={i} className="h-16 w-full rounded-md" />
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        <SheetHeader className="px-6 pt-6 pb-4">
                            <SheetTitle className="text-lg">{workout.title ?? 'Workout Session'}</SheetTitle>
                            <SheetDescription className="flex flex-wrap gap-3 text-sm text-muted-foreground mt-1">
                                {workout.durationMin && (
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-3.5 w-3.5" />
                                        {workout.durationMin} min
                                    </span>
                                )}
                                <span className="flex items-center gap-1">
                                    <Dumbbell className="h-3.5 w-3.5" />
                                    {workout.exercises.length} exercise{workout.exercises.length !== 1 ? 's' : ''}
                                </span>
                            </SheetDescription>
                        </SheetHeader>

                        {workout.notes && (
                            <div className="px-6 pb-4 flex items-start gap-2 text-sm text-muted-foreground">
                                <StickyNote className="h-4 w-4 mt-0.5 shrink-0" />
                                <p>{workout.notes}</p>
                            </div>
                        )}

                        <Separator />

                        <ScrollArea className="flex-1 px-6 py-4">
                            <div className="space-y-6">
                                {workout.exercises.map((we, idx) => (
                                    <div key={we.id}>
                                        <div className="flex items-start justify-between mb-3">
                                            <div>
                                                <p className="font-medium text-sm">{we.exercise.name}</p>
                                                <span className="text-xs text-muted-foreground">
                                                    {MUSCLE_GROUP_LABELS[we.exercise.primaryMuscle as MuscleGroup]}
                                                </span>
                                            </div>
                                            <Badge variant="outline" className="text-xs">
                                                {we.exercise.category}
                                            </Badge>
                                        </div>

                                        {we.notes && (
                                            <p className="text-xs text-muted-foreground mb-2 italic">{we.notes}</p>
                                        )}

                                        <div className="space-y-1.5">
                                            {we.sets.map((set) => (
                                                <div
                                                    key={set.id}
                                                    className={cn(
                                                        'flex items-center justify-between text-sm px-3 py-1.5 rounded-md',
                                                        set.isWarmup
                                                            ? 'bg-muted/40 text-muted-foreground'
                                                            : 'bg-muted/20',
                                                    )}
                                                >
                                                    <span className="text-xs text-muted-foreground w-10">
                                                        {set.isWarmup ? 'W' : `Set ${set.setNumber}`}
                                                    </span>
                                                    <span className="flex-1 text-center">{formatSet(set)}</span>
                                                    {set.isDropSet && (
                                                        <Badge variant="outline" className="text-xs h-4 px-1">Drop</Badge>
                                                    )}
                                                </div>
                                            ))}
                                        </div>

                                        {idx < workout.exercises.length - 1 && <Separator className="mt-4" />}
                                    </div>
                                ))}
                            </div>
                        </ScrollArea>

                        {onEdit && workout.status === 'ASSIGNED' && (
                            <SheetFooter className="px-6 py-4 border-t shrink-0">
                                <Button
                                    className="w-full gap-2"
                                    onClick={() => { onOpenChange(false); onEdit(workout.id); }}
                                >
                                    <Pencil className="h-4 w-4" />
                                    Edit Workout
                                </Button>
                            </SheetFooter>
                        )}
                    </>
                )}
            </SheetContent>
        </Sheet>
    );
}
