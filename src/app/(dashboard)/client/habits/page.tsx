import { ComingSoonPage } from '@/components/shared/coming-soon-page';

export default function ClientHabitsPage() {
    return (
        <ComingSoonPage
            title="Habits"
            description="Track daily habits, build streaks, and stay consistent with your healthy routines outside of the gym."
            backHref="/client"
            backLabel="Back to Dashboard"
        />
    );
}
