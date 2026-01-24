/**
 * Route d'inscription
 * DISABLED: Auth system temporarily disabled for development
 */

import type { MetaFunction } from '@remix-run/react';
import { redirect } from '@remix-run/cloudflare';
// import { AuthForm } from '~/components/auth/AuthForm';

export const meta: MetaFunction = () => {
  return [
    { title: 'Créer un compte - BAVINI' },
    { name: 'description', content: 'Créez votre compte BAVINI gratuit' },
  ];
};

// DISABLED: Redirect to home while auth is disabled
export const loader = () => redirect('/');

export default function SignupPage() {
  // DISABLED: Auth form temporarily disabled
  // return <AuthForm mode="signup" />;
  return null;
}
