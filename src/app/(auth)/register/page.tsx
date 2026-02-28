import { RegisterForm } from '@/components/auth/register-form';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Create Account - Sector 7' };

export default function RegisterPage() {
  return <RegisterForm />;
}
