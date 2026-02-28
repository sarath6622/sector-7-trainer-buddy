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
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2 } from 'lucide-react';
import { TRAINER_SPECIALTY_LABELS } from '@/lib/constants';
import type { TrainerSpecialty } from '@/generated/prisma/enums';

const SPECIALTIES = [
    'WEIGHT_LOSS', 'MUSCLE_GAIN', 'POWERLIFTING', 'CROSSFIT',
    'YOGA', 'REHABILITATION', 'NUTRITION', 'CARDIO',
    'FLEXIBILITY', 'SPORTS_PERFORMANCE',
] as const;

const schema = z.object({
    bio: z.string().max(2000).optional(),
    specialties: z.array(z.enum(SPECIALTIES)).default([]),
    certifications: z.array(z.string()).default([]),
    experience: z.coerce.number().int().min(0).max(50).optional(),
    certInput: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

// Trainer profile completion and editing form — sets profileCompleted on submit
export default function TrainerProfilePage() {
    const trpc = useTRPC();
    const queryClient = useQueryClient();

    const { data: profile, isLoading } = useQuery(trpc.trainer.getMyProfile.queryOptions());

    const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormValues>({
        resolver: zodResolver(schema) as any,
        values: {
            bio: profile?.bio ?? '',
            specialties: (profile?.specialties ?? []) as (typeof SPECIALTIES)[number][],
            certifications: profile?.certifications ?? [],
            experience: profile?.experience ?? undefined,
            certInput: '',
        },
    });

    const specialties = watch('specialties');
    const certifications = watch('certifications');
    const certInput = watch('certInput');

    const update = useMutation(trpc.trainer.updateProfile.mutationOptions({
        onSuccess: () => {
            toast.success('Profile updated!');
            queryClient.invalidateQueries(trpc.trainer.getMyProfile.queryFilter());
        },
        onError: (err: { message: string }) => toast.error(err.message),
    }));

    function toggleSpecialty(s: (typeof SPECIALTIES)[number]) {
        const current = specialties ?? [];
        setValue(
            'specialties',
            current.includes(s) ? current.filter((x) => x !== s) : [...current, s],
        );
    }

    function addCert() {
        if (!certInput?.trim()) return;
        setValue('certifications', [...(certifications ?? []), certInput.trim()]);
        setValue('certInput', '');
    }

    function removeCert(idx: number) {
        setValue('certifications', (certifications ?? []).filter((_, i) => i !== idx));
    }

    function onSubmit(values: FormValues) {
        const { certInput: _ci, ...rest } = values;
        update.mutate(rest);
    }

    if (isLoading) {
        return (
            <div className="space-y-6">
                <PageHeader title="My Profile" description="Complete your trainer profile" />
                <Skeleton className="h-64 w-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div className="flex items-center justify-between gap-4">
                <PageHeader title="My Profile" description="Complete your profile so clients can find you" />
                {profile?.profileCompleted && (
                    <Badge className="gap-1 bg-green-500/10 text-green-400 border-green-500/20">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Complete
                    </Badge>
                )}
            </div>

            <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-6">
                {/* Bio */}
                <Card>
                    <CardHeader><CardTitle className="text-base">About You</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="bio">Bio</Label>
                            <Textarea
                                id="bio"
                                placeholder="Tell clients about your training philosophy and background…"
                                rows={4}
                                {...register('bio')}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="experience">Years of Experience</Label>
                            <Input id="experience" type="number" min={0} max={50} placeholder="e.g. 5" {...register('experience')} />
                        </div>
                    </CardContent>
                </Card>

                {/* Specialties */}
                <Card>
                    <CardHeader><CardTitle className="text-base">Specialties</CardTitle></CardHeader>
                    <CardContent>
                        <div className="flex flex-wrap gap-2">
                            {SPECIALTIES.map((s) => {
                                const active = specialties?.includes(s);
                                return (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => toggleSpecialty(s)}
                                        className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${active
                                                ? 'border-primary bg-primary text-primary-foreground'
                                                : 'border-border bg-transparent text-muted-foreground hover:border-primary/50'
                                            }`}
                                    >
                                        {TRAINER_SPECIALTY_LABELS[s as TrainerSpecialty]}
                                    </button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Certifications */}
                <Card>
                    <CardHeader><CardTitle className="text-base">Certifications</CardTitle></CardHeader>
                    <CardContent className="space-y-3">
                        <div className="flex gap-2">
                            <Input
                                placeholder="e.g. NASM-CPT, ACE, CSCS…"
                                {...register('certInput')}
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCert())}
                            />
                            <Button type="button" variant="outline" onClick={addCert}>Add</Button>
                        </div>
                        {certifications && certifications.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                                {certifications.map((c, i) => (
                                    <Badge key={i} variant="secondary" className="gap-1 pr-1">
                                        {c}
                                        <button
                                            type="button"
                                            onClick={() => removeCert(i)}
                                            className="ml-1 text-muted-foreground hover:text-foreground"
                                        >×</button>
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Button type="submit" disabled={update.isPending} className="w-full sm:w-auto">
                    {update.isPending ? 'Saving…' : 'Save Profile'}
                </Button>
            </form>
        </div>
    );
}
