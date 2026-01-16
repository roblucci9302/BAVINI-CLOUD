/**
 * Page d'accueil publique
 */

import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Zap, Database } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export function Home() {
  const { user } = useAuth();

  return (
    <div className="bg-white">
      {/* Hero Section */}
      <div className="relative isolate px-6 pt-14 lg:px-8">
        <div className="mx-auto max-w-2xl py-32 sm:py-48 lg:py-56">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-6xl">Bienvenue sur MonApp</h1>
            <p className="mt-6 text-lg leading-8 text-gray-600">
              Une application full-stack moderne construite avec React et Supabase. Authentification, base de données,
              et plus encore.
            </p>
            <div className="mt-10 flex items-center justify-center gap-x-6">
              {user ? (
                <Link
                  to="/dashboard"
                  className="rounded-md bg-primary-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                >
                  Accéder au Dashboard
                  <ArrowRight className="inline-block ml-2 h-4 w-4" />
                </Link>
              ) : (
                <>
                  <Link
                    to="/register"
                    className="rounded-md bg-primary-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600"
                  >
                    Commencer gratuitement
                  </Link>
                  <Link to="/login" className="text-sm font-semibold leading-6 text-gray-900">
                    Se connecter <span aria-hidden="true">→</span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="py-24 sm:py-32 bg-gray-50">
        <div className="mx-auto max-w-7xl px-6 lg:px-8">
          <div className="mx-auto max-w-2xl lg:text-center">
            <h2 className="text-base font-semibold leading-7 text-primary-600">Déployez plus vite</h2>
            <p className="mt-2 text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Tout ce dont vous avez besoin
            </p>
          </div>
          <div className="mx-auto mt-16 max-w-2xl sm:mt-20 lg:mt-24 lg:max-w-4xl">
            <dl className="grid max-w-xl grid-cols-1 gap-x-8 gap-y-10 lg:max-w-none lg:grid-cols-3 lg:gap-y-16">
              <div className="relative pl-16">
                <dt className="text-base font-semibold leading-7 text-gray-900">
                  <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600">
                    <Shield className="h-6 w-6 text-white" />
                  </div>
                  Authentification sécurisée
                </dt>
                <dd className="mt-2 text-base leading-7 text-gray-600">
                  Authentification complète avec Supabase Auth. Email, mot de passe, et OAuth.
                </dd>
              </div>
              <div className="relative pl-16">
                <dt className="text-base font-semibold leading-7 text-gray-900">
                  <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600">
                    <Database className="h-6 w-6 text-white" />
                  </div>
                  Base de données PostgreSQL
                </dt>
                <dd className="mt-2 text-base leading-7 text-gray-600">
                  Base de données PostgreSQL avec Row Level Security pour sécuriser vos données.
                </dd>
              </div>
              <div className="relative pl-16">
                <dt className="text-base font-semibold leading-7 text-gray-900">
                  <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600">
                    <Zap className="h-6 w-6 text-white" />
                  </div>
                  Rapide et moderne
                </dt>
                <dd className="mt-2 text-base leading-7 text-gray-600">
                  React, TypeScript, Tailwind CSS. Build rapide avec Vite.
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
