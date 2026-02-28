import { LoginForm } from '@/components/auth/login-form';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Sign In - Sector 7' };

export default function LoginPage() {
  return <LoginForm />;
}
