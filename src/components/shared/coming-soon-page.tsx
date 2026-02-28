import Link from 'next/link';
import { Construction } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ComingSoonPageProps {
    title: string;
    description?: string;
    backHref?: string;
    backLabel?: string;
}

// Placeholder page shown for nav items that aren't implemented yet
export function ComingSoonPage({
    title,
    description = 'This feature is being built and will be available in a future sprint.',
    backHref = '..',
    backLabel = 'Go Back',
}: ComingSoonPageProps) {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-6">
            <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/10 blur-2xl scale-150" />
                <div className="relative h-20 w-20 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Construction className="h-9 w-9 text-primary" />
                </div>
            </div>

            <div className="space-y-2 max-w-sm">
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <p className="text-muted-foreground text-sm leading-relaxed">{description}</p>
            </div>

            <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-primary/20 bg-primary/5 text-primary">
                    <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                    </span>
                    Coming Soon
                </span>
            </div>

            <Button variant="outline" asChild>
                <Link href={backHref}>{backLabel}</Link>
            </Button>
        </div>
    );
}
