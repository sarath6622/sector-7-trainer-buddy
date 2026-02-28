'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
    Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTRPC } from '@/trpc/client';
import { trpcClient } from '@/trpc/client';
import { toast } from 'sonner';
import { Plus, Trash2, Dumbbell } from 'lucide-react';

const setSchema = z.object({
    setNumber: z.number(),
    reps: z.coerce.number().min(0).optional(),
    weightKg: z.coerce.number().min(0).optional(),
    rpe: z.coerce.number().min(1).max(10).optional(),
    isWarmup: z.boolean().default(false),
    isDropSet: z.boolean().default(false),
});

const exerciseSchema = z.object({
    exerciseId: z.string().min(1, 'Select an exercise'),
    orderIndex: z.number(),
    notes: z.string().optional(),
    sets: z.array(setSchema).min(1, 'Add at least one set'),
});

const assignSchema = z.object({
    clientId: z.string().min(1),
    title: z.string().min(1, 'Title is required'),
    notes: z.string().optional(),
    scheduledAt: z.string().optional(),
    exercises: z.array(exerciseSchema).min(1, 'Add at least one exercise'),
});

type AssignFormValues = z.infer<typeof assignSchema>;

interface AssignWorkoutFormProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    defaultClientId?: string;
    onSuccess?: () => void;
}

// Trainer-facing form for building and assigning a workout template to a specific client
export function AssignWorkoutForm({ open, onOpenChange, defaultClientId, onSuccess }: AssignWorkoutFormProps) {
    const trpc = useTRPC();
    const queryClient = useQueryClient();
    const [exerciseSearch, setExerciseSearch] = useState('');

    const { data: exerciseData } = useQuery(
        trpc.exercise.list.queryOptions({ search: exerciseSearch, limit: 20 }),
    );

    const assign = useMutation(trpc.workout.assign.mutationOptions({
        onSuccess: () => {
            toast.success('Workout assigned successfully');
            queryClient.invalidateQueries(trpc.workout.getTrainerOverview.queryFilter());
            onSuccess?.();
            onOpenChange(false);
            reset();
        },
        onError: (err: { message: string }) => toast.error(err.message),
    }));

    const { register, control, handleSubmit, reset, formState: { errors } } = useForm<AssignFormValues>({
        resolver: zodResolver(assignSchema) as any,
        defaultValues: {
            clientId: defaultClientId ?? '',
            title: '',
            exercises: [],
        },
    });

    const { fields: exerciseFields, append: appendExercise, remove: removeExercise } = useFieldArray({
        control,
        name: 'exercises',
    });

    function addExercise(exerciseId: string) {
        appendExercise({
            exerciseId,
            orderIndex: exerciseFields.length,
            notes: '',
            sets: [{ setNumber: 1, reps: 10, weightKg: 0, isWarmup: false, isDropSet: false }],
        });
    }

    function onSubmit(values: AssignFormValues) {
        assign.mutate(values);
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
                <SheetHeader className="px-6 pt-6 pb-4">
                    <SheetTitle>Assign Workout</SheetTitle>
                    <SheetDescription>Build a workout and assign it to a client.</SheetDescription>
                </SheetHeader>

                <ScrollArea className="flex-1 px-6">
                    <form id="assign-workout-form" onSubmit={handleSubmit(onSubmit as any)} className="space-y-6 pb-6">
                        {/* Workout meta */}
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <Label htmlFor="workout-title">Workout Title</Label>
                                <Input id="workout-title" placeholder="e.g. Push Day A" {...register('title')} />
                                {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="scheduled-at">Scheduled Date (optional)</Label>
                                <Input id="scheduled-at" type="datetime-local" {...register('scheduledAt')} />
                            </div>
                            <div className="space-y-1.5">
                                <Label htmlFor="workout-notes">Notes (optional)</Label>
                                <Input id="workout-notes" placeholder="Coach instructions…" {...register('notes')} />
                            </div>
                        </div>

                        <Separator />

                        {/* Exercise picker */}
                        <div className="space-y-3">
                            <Label>Exercise Library</Label>
                            <Input
                                placeholder="Search exercises…"
                                value={exerciseSearch}
                                onChange={(e) => setExerciseSearch(e.target.value)}
                            />
                            <div className="grid grid-cols-1 gap-1 max-h-40 overflow-y-auto rounded-md border p-2">
                                {exerciseData?.exercises.map((ex) => (
                                    <button
                                        key={ex.id}
                                        type="button"
                                        onClick={() => addExercise(ex.id)}
                                        className="flex items-center gap-2 text-left text-sm px-2 py-1.5 rounded hover:bg-muted transition-colors"
                                    >
                                        <Dumbbell className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                        <span className="flex-1 truncate">{ex.name}</span>
                                        <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                                    </button>
                                ))}
                                {exerciseData?.exercises.length === 0 && (
                                    <p className="text-xs text-muted-foreground text-center py-2">No exercises found</p>
                                )}
                            </div>
                        </div>

                        <Separator />

                        {/* Added exercises */}
                        {exerciseFields.length > 0 && (
                            <div className="space-y-4">
                                <Label>Added Exercises ({exerciseFields.length})</Label>
                                {exerciseFields.map((field, exIdx) => {
                                    const exercise = exerciseData?.exercises.find((e) => e.id === field.exerciseId);
                                    return (
                                        <div key={field.id} className="border rounded-lg p-4 space-y-3">
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-medium">{exercise?.name ?? 'Exercise'}</p>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeExercise(exIdx)}
                                                    className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                            <SetsEditor control={control} exIdx={exIdx} register={register} />
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {errors.exercises && (
                            <p className="text-xs text-destructive">Add at least one exercise.</p>
                        )}
                    </form>
                </ScrollArea>

                <SheetFooter className="px-6 py-4 border-t">
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button form="assign-workout-form" type="submit" disabled={assign.isPending}>
                        {assign.isPending ? 'Assigning…' : 'Assign Workout'}
                    </Button>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
}

// Inline set editor to keep the parent component clean
function SetsEditor({ control, exIdx, register }: { control: any; exIdx: number; register: any }) {
    const { fields, append, remove } = useFieldArray({ control, name: `exercises.${exIdx}.sets` as const });

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-4 text-xs text-muted-foreground font-medium px-1">
                <span>Set</span><span>Reps</span><span>kg</span><span>RPE</span>
            </div>
            {fields.map((set, sIdx) => (
                <div key={set.id} className="grid grid-cols-4 gap-1 items-center">
                    <span className="text-xs text-muted-foreground pl-1">{sIdx + 1}</span>
                    <Input type="number" className="h-7 text-xs" {...register(`exercises.${exIdx}.sets.${sIdx}.reps`)} placeholder="10" />
                    <Input type="number" className="h-7 text-xs" {...register(`exercises.${exIdx}.sets.${sIdx}.weightKg`)} placeholder="0" />
                    <div className="flex items-center gap-1">
                        <Input type="number" className="h-7 text-xs" {...register(`exercises.${exIdx}.sets.${sIdx}.rpe`)} placeholder="—" />
                        {fields.length > 1 && (
                            <button type="button" onClick={() => remove(sIdx)} className="text-muted-foreground hover:text-destructive">
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
                className="h-6 text-xs text-muted-foreground"
                onClick={() => append({ setNumber: fields.length + 1, reps: 10, weightKg: 0, isWarmup: false, isDropSet: false })}
            >
                <Plus className="h-3 w-3 mr-1" /> Add Set
            </Button>
        </div>
    );
}
