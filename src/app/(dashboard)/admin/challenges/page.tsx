import { ComingSoonPage } from '@/components/shared/coming-soon-page';

export default function AdminChallengesPage() {
    return (
        <ComingSoonPage
            title="Challenges"
            description="Create gym-wide fitness challenges, set targets, track participation, and reward top performers."
            backHref="/admin"
            backLabel="Back to Dashboard"
        />
    );
}
