/**
 * Route de connexion
 * DISABLED: Auth system temporarily disabled for development
 */

import type { MetaFunction } from '@remix-run/react';
import { redirect } from '@remix-run/cloudflare';
// import { AuthForm } from '~/components/auth/AuthForm';

export const meta: MetaFunction = () => {
  return [
    { title: 'Connexion - BAVINI' },
    { name: 'description', content: 'Connectez-vous à BAVINI' },
  ];
};

// DISABLED: Redirect to home while auth is disabled
export const loader = () => redirect('/');

export default function LoginPage() {
  // DISABLED: Auth form temporarily disabled
  // return <AuthForm mode="login" />;
  return null;
}
