import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function HomePage() {
  const session = await auth();

  if (session?.user) {
    redirect(`/${session.user.role.toLowerCase()}`);
  }

  redirect('/login');
}
