'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTRPC } from '@/trpc/client';
import { toast } from 'sonner';
import { Plus, Trash2, CheckCircle2, Dumbbell } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MUSCLE_GROUP_LABELS } from '@/lib/constants';
import type { MuscleGroup } from '@/generated/prisma/enums';

const setSchema = z.object({
    setNumber: z.number(),
    reps: z.coerce.number().min(0).optional(),
    weightKg: z.coerce.number().min(0).optional(),
    rpe: z.coerce.number().min(1).max(10).optional(),
    durationSec: z.coerce.number().min(0).optional(),
    isWarmup: z.boolean().default(false),
    isDropSet: z.boolean().default(false),
});

const exerciseSchema = z.object({
    exerciseId: z.string(),
    orderIndex: z.number(),
    notes: z.string().optional(),
    sets: z.array(setSchema).min(1),
    exerciseName: z.string(),
    primaryMuscle: z.string(),
});

const logSchema = z.object({
    title: z.string().optional(),
    notes: z.string().optional(),
    durationMin: z.coerce.number().min(1).optional(),
    exercises: z.array(exerciseSchema).min(1, 'Add at least one exercise'),
});

type LogFormValues = z.infer<typeof logSchema>;

interface AssignedExercise {
    id: string;
    orderIndex: number;
    notes?: string | null;
    sets: Array<{ setNumber: number; reps?: number | null; weightKg?: number | null }>;
    exercise: { id: string; name: string; primaryMuscle: MuscleGroup };
}

interface WorkoutLoggerProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    // When provided, re-uses assigned workout exercises as targets (complete flow)
    assignedWorkout?: {
        id: string;
        title?: string | null;
        exercises: AssignedExercise[];
    };
    onSuccess?: () => void;
}

// Client-facing active workout session logger — supports both self-log and completing an assigned workout
export function WorkoutLogger({ open, onOpenChange, assignedWorkout, onSuccess }: WorkoutLoggerProps) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [exerciseSearch, setExerciseSearch] = useState('');
    const isCompleting = !!assignedWorkout;

    const { data: exerciseData } = useQuery(
        trpc.exercise.list.queryOptions({ search: exerciseSearch, limit: 20 }),
        // Only fetch when the sheet is open and this is a self-log (not completing assigned)
    );

    const log = useMutation(trpc.workout.log.mutationOptions({
        onSuccess: () => {
            toast.success('Workout logged!');
            queryClient.invalidateQueries(trpc.workout.list.queryFilter());
            queryClient.invalidateQueries(trpc.workout.getStats.queryFilter());
            onSuccess?.();
            onOpenChange(false);
            reset();
        },
        onError: (err: { message: string }) => toast.error(err.message),
    }));

    const complete = useMutation(trpc.workout.complete.mutationOptions({
        onSuccess: () => {
            toast.success('Workout completed! 🔥');
            queryClient.invalidateQueries(trpc.workout.list.queryFilter());
            queryClient.invalidateQueries(trpc.workout.getStats.queryFilter());
            onSuccess?.();
            onOpenChange(false);
            reset();
        },
        onError: (err: { message: string }) => toast.error(err.message),
    }));

    const defaultExercises = assignedWorkout?.exercises.map((we) => ({
        exerciseId: we.exercise.id,
        orderIndex: we.orderIndex,
        notes: we.notes ?? '',
        exerciseName: we.exercise.name,
        primaryMuscle: we.exercise.primaryMuscle as string,
        sets: we.sets.map((s) => ({
            setNumber: s.setNumber,
            reps: s.reps ?? undefined,
            weightKg: s.weightKg ?? undefined,
            isWarmup: false as boolean,
            isDropSet: false as boolean,
        })),
    })) ?? [];

    const { register, control, handleSubmit, reset, formState: { errors } } = useForm<LogFormValues>({
        resolver: zodResolver(logSchema) as any,
        defaultValues: {
            title: assignedWorkout?.title ?? '',
            exercises: defaultExercises,
        },
    });

    const { fields: exerciseFields, append, remove } = useFieldArray({ control, name: 'exercises' });

    function addExercise(ex: { id: string; name: string; primaryMuscle: MuscleGroup }) {
        append({
            exerciseId: ex.id,
            orderIndex: exerciseFields.length,
            notes: '',
            exerciseName: ex.name,
            primaryMuscle: ex.primaryMuscle as string,
            sets: [{ setNumber: 1, reps: 10, weightKg: 0, isWarmup: false, isDropSet: false }],
        });
    }

    function onSubmit(values: LogFormValues) {
        // Strip display-only fields before sending to server
        const exercises = values.exercises.map(({ exerciseName: _n, primaryMuscle: _m, ...rest }) => rest);

        if (isCompleting && assignedWorkout) {
            complete.mutate({ id: assignedWorkout.id, durationMin: values.durationMin, notes: values.notes, exercises });
        } else {
            log.mutate({ title: values.title, notes: values.notes, durationMin: values.durationMin, exercises });
        }
    }

    const isPending = log.isPending || complete.isPending;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
                <SheetHeader className="px-6 pt-6 pb-4">
                    <SheetTitle>{isCompleting ? 'Log Assigned Workout' : 'Log Workout'}</SheetTitle>
                    <SheetDescription>
                        {isCompleting ? 'Enter the actual sets and reps you performed.' : 'Record your session set by set.'}
                    </SheetDescription>
                </SheetHeader>

                <ScrollArea className="flex-1 px-6">
                    <form id="workout-logger-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-6 pb-6">
                        <div className="grid grid-cols-2 gap-3">
                            {!isCompleting && (
                                <div className="space-y-1.5 col-span-2">
                                    <Label htmlFor="log-title">Title (optional)</Label>
                                    <Input id="log-title" placeholder="e.g. Morning Push" {...register('title')} />
                                </div>
                            )}
                            <div className="space-y-1.5">
                                <Label htmlFor="log-duration">Duration (min)</Label>
                                <Input id="log-duration" type="number" placeholder="45" {...register('durationMin')} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="log-notes">Notes</Label>
                                <Input id="log-notes" placeholder="How did it feel?" {...register('notes')} />
                            </div>
                        </div>

                        <Separator />

                        {/* Exercise picker — only for self-log */}
                        {!isCompleting && (
                            <div className="space-y-3">
                                <Label>Add Exercises</Label>
                                <Input
                                    placeholder="Search exercises…"
                                    value={exerciseSearch}
                                    onChange={(e) => setExerciseSearch(e.target.value)}
                                />
                                <div className="grid gap-1 max-h-36 overflow-y-auto rounded-md border p-2">
                                    {exerciseData?.exercises.map((ex) => (
                                        <button
                                            key={ex.id}
                                            type="button"
                                            onClick={() => addExercise({ id: ex.id, name: ex.name, primaryMuscle: ex.primaryMuscle })}
                                            className="flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
                                        >
                                            <Dumbbell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                            <span className="flex-1 truncate">{ex.name}</span>
                                            <span className="text-xs text-muted-foreground">{MUSCLE_GROUP_LABELS[ex.primaryMuscle]}</span>
                                            <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <Separator />

                        {/* Set-by-set entry */}
                        <div className="space-y-5">
                            {exerciseFields.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-4">Add exercises above to start logging.</p>
                            )}
                            {exerciseFields.map((field, exIdx) => (
                                <div key={field.id} className="border rounded-lg p-4 space-y-3">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <p className="font-medium text-sm">{field.exerciseName}</p>
                                            <p className="text-xs text-muted-foreground">
                                                {field.primaryMuscle in MUSCLE_GROUP_LABELS
                                                    ? MUSCLE_GROUP_LABELS[field.primaryMuscle as MuscleGroup]
                                                    : field.primaryMuscle}
                                            </p>
                                        </div>
                                        {!isCompleting && (
                                            <Button type="button" variant="ghost" size="sm" onClick={() => remove(exIdx)} className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive">
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                    <LoggerSetsEditor control={control} exIdx={exIdx} register={register} />
                                </div>
                            ))}
                        </div>

                        {errors.exercises && (
                            <p className="text-xs text-destructive">Add at least one exercise to log.</p>
                        )}
                    </form>
                </ScrollArea>

                <SheetFooter className="px-6 py-4 border-t">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button
                        id="finish-workout-btn"
                        form="workout-logger-form"
                        type="submit"
                        disabled={isPending}
                        className="gap-2"
                    >
                        <CheckCircle2 className={cn('h-4 w-4', isPending && 'animate-spin')} />
                        {isPending ? 'Saving…' : isCompleting ? 'Complete Workout' : 'Finish & Log'}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

function LoggerSetsEditor({ control, exIdx, register }: { control: any; exIdx: number; register: any }) {
    const { fields, append, remove } = useFieldArray({ control, name: `exercises.${exIdx}.sets` as const });

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-4 text-xs text-muted-foreground font-medium px-1">
                <span>Set</span><span>Reps</span><span>kg</span><span>RPE</span>
            </div>
            {fields.map((set, sIdx) => (
                <div key={set.id} className="grid grid-cols-4 gap-1.5 items-center">
                    <span className="text-xs text-muted-foreground pl-1 font-medium">{sIdx + 1}</span>
                    <Input type="number" className="h-8 text-xs" placeholder="10" {...register(`exercises.${exIdx}.sets.${sIdx}.reps`)} />
                    <Input type="number" className="h-8 text-xs" placeholder="0" {...register(`exercises.${exIdx}.sets.${sIdx}.weightKg`)} />
                    <div className="flex items-center gap-1">
                        <Input type="number" className="h-8 text-xs" placeholder="—" {...register(`exercises.${exIdx}.sets.${sIdx}.rpe`)} />
                        {fields.length > 1 && (
                            <button type="button" onClick={() => remove(sIdx)} className="text-muted-foreground hover:text-destructive transition-colors">
                                <Trash2 className="h-3 w-3" />
                            </button>
                        )}
                    </div>
                </div>
            ))}
            <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-muted-foreground gap-1"
                onClick={() => append({ setNumber: fields.length + 1, isWarmup: false, isDropSet: false })}
            >
                <Plus className="h-3 w-3" /> Add Set
            </Button>
        </div>
    );
}
