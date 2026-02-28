'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTRPC } from '@/trpc/client';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { CheckCircle2, UserCheck, Dumbbell } from 'lucide-react';
import { TRAINER_SPECIALTY_LABELS } from '@/lib/constants';
import type { TrainerSpecialty } from '@/generated/prisma/enums';

const FITNESS_GOALS = [
    'LOSE_WEIGHT', 'BUILD_MUSCLE', 'IMPROVE_ENDURANCE',
    'INCREASE_FLEXIBILITY', 'BUILD_STRENGTH',
    'IMPROVE_HEALTH', 'SPORT_PERFORMANCE', 'OTHER',
] as const;

const FITNESS_GOAL_LABELS: Record<(typeof FITNESS_GOALS)[number], string> = {
    LOSE_WEIGHT: 'Lose Weight',
    BUILD_MUSCLE: 'Build Muscle',
    IMPROVE_ENDURANCE: 'Improve Endurance',
    INCREASE_FLEXIBILITY: 'Increase Flexibility',
    BUILD_STRENGTH: 'Build Strength',
    IMPROVE_HEALTH: 'Improve Overall Health',
    SPORT_PERFORMANCE: 'Sport Performance',
    OTHER: 'Other',
};

const schema = z.object({
    dateOfBirth: z.string().optional(),
    gender: z.enum(['MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY']).optional(),
    heightCm: z.coerce.number().min(50).max(300).optional(),
    weightKg: z.coerce.number().min(20).max(500).optional(),
    fitnessGoals: z.array(z.enum(FITNESS_GOALS)).default([]),
});

type FormValues = z.infer<typeof schema>;

// Client profile completion page — includes assigned trainer card and body metrics form
export default function ClientProfilePage() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const { data: myProfile, isLoading: loadingProfile } = useQuery(trpc.profile.getMyClientProfile.queryOptions());
    const { data: myTrainer, isLoading: loadingTrainer } = useQuery(trpc.profile.getMyTrainer.queryOptions());

    const { register, handleSubmit, watch, setValue } = useForm<FormValues>({
        resolver: zodResolver(schema) as any,
        values: {
            dateOfBirth: myProfile?.dateOfBirth
                ? new Date(myProfile.dateOfBirth).toISOString().split('T')[0]
                : '',
            gender: (myProfile?.gender as FormValues['gender']) ?? undefined,
            heightCm: myProfile?.heightCm ?? undefined,
            weightKg: myProfile?.weightKg ?? undefined,
            fitnessGoals: (myProfile?.fitnessGoals ?? []) as (typeof FITNESS_GOALS)[number][],
        },
    });

    const fitnessGoals = watch('fitnessGoals');

    const update = useMutation(trpc.profile.updateClient.mutationOptions({
        onSuccess: () => {
            toast.success('Profile updated!');
            queryClient.invalidateQueries(trpc.profile.getMyClientProfile.queryFilter());
        },
        onError: (err: { message: string }) => toast.error(err.message),
    }));

    function toggleGoal(g: (typeof FITNESS_GOALS)[number]) {
        const current = fitnessGoals ?? [];
        setValue('fitnessGoals', current.includes(g) ? current.filter((x) => x !== g) : [...current, g]);
    }

    function onSubmit(values: FormValues) {
        update.mutate(values);
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center justify-between gap-4">
                <PageHeader title="My Profile" description="Set up your info so your trainer can personalize your plan" />
                {myProfile?.profileCompleted && (
                    <Badge className="gap-1 bg-green-500/10 text-green-400 border-green-500/20">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                    </Badge>
                )}
            </div>

            {/* Assigned trainer card */}
            {loadingTrainer ? (
                <Skeleton className="h-24 w-full rounded-xl" />
            ) : myTrainer ? (
                <Card className="border-primary/20 bg-primary/5">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <UserCheck className="h-4 w-4 text-primary" /> Your Trainer
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center gap-3">
                            <Avatar className="h-12 w-12 ring-2 ring-primary/20">
                                <AvatarImage src={myTrainer.image ?? undefined} />
                                <AvatarFallback>{myTrainer.name?.charAt(0)?.toUpperCase() ?? '?'}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                                <p className="font-semibold">{myTrainer.name ?? 'Your Trainer'}</p>
                                {myTrainer.bio && (
                                    <p className="text-xs text-muted-foreground line-clamp-1">{myTrainer.bio}</p>
                                )}
                                {myTrainer.experience && (
                                    <p className="text-xs text-muted-foreground">{myTrainer.experience} years experience</p>
                                )}
                                {myTrainer.specialties.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                        {myTrainer.specialties.slice(0, 4).map((s) => (
                                            <Badge key={s} variant="outline" className="text-xs py-0">
                                                {TRAINER_SPECIALTY_LABELS[s as TrainerSpecialty] ?? s}
                                            </Badge>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card className="border-dashed">
                    <CardContent className="flex items-center gap-3 py-4">
                        <Dumbbell className="h-7 w-7 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">No trainer assigned yet. An admin will assign one soon.</p>
                    </CardContent>
                </Card>
            )}

            {/* Profile form */}
            <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
                <Card>
                    <CardHeader><CardTitle className="text-base">Body Metrics</CardTitle></CardHeader>
                    <CardContent className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5 col-span-2 sm:col-span-1">
                            <Label htmlFor="dob">Date of Birth</Label>
                            <Input id="dob" type="date" {...register('dateOfBirth')} />
                        </div>
                        <div className="space-y-1.5 col-span-2 sm:col-span-1">
                            <Label htmlFor="gender">Gender</Label>
                            <select
                                id="gender"
                                {...register('gender')}
                                className="w-full h-9 px-3 rounded-md border bg-transparent text-sm"
                            >
                                <option value="">Prefer not to say</option>
                                <option value="MALE">Male</option>
                                <option value="FEMALE">Female</option>
                                <option value="NON_BINARY">Non-binary</option>
                                <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="height">Height (cm)</Label>
                            <Input id="height" type="number" min={50} max={300} placeholder="175" {...register('heightCm')} />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="weight">Weight (kg)</Label>
                            <Input id="weight" type="number" min={20} max={500} placeholder="70" {...register('weightKg')} />
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader><CardTitle className="text-base">Fitness Goals</CardTitle></CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {FITNESS_GOALS.map((g) => {
                                const active = fitnessGoals?.includes(g);
                                return (
                                    <button
                                        key={g}
                                        type="button"
                                        onClick={() => toggleGoal(g)}
                                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${active
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'border-border bg-transparent text-muted-foreground hover:border-primary/50'
                                            }`}
                                    >
                                        {FITNESS_GOAL_LABELS[g]}
                                    </button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                <Button type="submit" disabled={update.isPending} className="w-full sm:w-auto">
                    {update.isPending ? 'Saving…' : 'Save Profile'}
                </Button>
            </form>
        </div>
    );
}
