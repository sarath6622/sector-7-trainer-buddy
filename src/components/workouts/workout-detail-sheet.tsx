'use client';

import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { Clock, Dumbbell, StickyNote } from 'lucide-react';
import { MUSCLE_GROUP_LABELS } from '@/lib/constants';
import type { MuscleGroup, WorkoutStatus } from '@/generated/prisma/enums';

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

interface WorkoutExerciseDetail {
    id: string;
    orderIndex: number;
    notes?: string | null;
    sets: WorkoutSet[];
    exercise: {
        name: string;
        primaryMuscle: MuscleGroup;
        category: string;
        mediaUrl?: string | null;
        mediaType?: string | null;
    };
}

interface WorkoutDetailSheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workout: {
        id: string;
        title?: string | null;
        date: Date;
        durationMin?: number | null;
        notes?: string | null;
        status: WorkoutStatus;
        exercises: WorkoutDetailExercise[];
    } | null;
}

type WorkoutDetailExercise = WorkoutExerciseDetail;

// Formats a set row into a human-readable summary (80 kg × 10 · RPE 8)
function formatSet(set: WorkoutSet): string {
    const parts: string[] = [];
    if (set.weightKg != null) parts.push(`${set.weightKg} kg`);
    if (set.reps != null) parts.push(`× ${set.reps}`);
    if (set.durationSec != null) parts.push(`${set.durationSec}s`);
    if (set.rpe != null) parts.push(`· RPE ${set.rpe}`);
    return parts.join(' ') || '—';
}

export function WorkoutDetailSheet({ open, onOpenChange, workout }: WorkoutDetailSheetProps) {
    if (!workout) return null;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-lg p-0 flex flex-col">
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
                            {workout.exercises.length} exercises
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
                                            {MUSCLE_GROUP_LABELS[we.exercise.primaryMuscle]}
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
            </SheetContent>
        </Sheet>
    );
}
