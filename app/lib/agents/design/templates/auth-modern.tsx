'use client';

/**
 * Template: Pages d'Authentification Modernes
 *
 * Templates pour Login, Signup, Forgot Password
 * Utilise la palette Slate (Gris neutre élégant)
 *
 * Dépendances: react, framer-motion, tailwindcss
 */

import { motion } from 'framer-motion';
import { useState } from 'react';

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  brand: {
    name: 'YourApp',
    logo: '🔐',
  },
  social: [
    { name: 'Google', icon: 'G' },
    { name: 'GitHub', icon: '⌘' },
    { name: 'Apple', icon: '' },
  ],
  features: [
    { icon: '🔒', text: 'Connexion sécurisée SSL' },
    { icon: '🛡️', text: '2FA disponible' },
    { icon: '🌐', text: 'SSO entreprise' },
  ],
};

// ============================================================================
// COMPOSANTS PARTAGÉS
// ============================================================================

/**
 * Layout d'authentification avec split screen
 */
function AuthLayout({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="min-h-screen flex">
      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 bg-gray-900 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900" />
          <div className="absolute top-1/4 -left-20 w-80 h-80 bg-gray-700/30 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 -right-20 w-96 h-96 bg-gray-600/20 rounded-full blur-3xl" />
        </div>

        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          {/* Logo */}
          <div>
            <a href="/" className="inline-flex items-center gap-2 text-white">
              <span className="text-2xl">{config.brand.logo}</span>
              <span className="text-xl font-bold">{config.brand.name}</span>
            </a>
          </div>

          {/* Content */}
          <div className="max-w-md">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <h1 className="text-4xl font-bold text-white mb-4">Bienvenue sur {config.brand.name}</h1>
              <p className="text-gray-400 text-lg mb-8">
                La plateforme tout-en-un pour gérer vos projets et collaborer avec votre équipe.
              </p>

              {/* Features */}
              <div className="space-y-4">
                {config.features.map((feature) => (
                  <div key={feature.text} className="flex items-center gap-3">
                    <span className="text-xl">{feature.icon}</span>
                    <span className="text-gray-300">{feature.text}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>

          {/* Testimonial */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="p-6 bg-gray-800/50 backdrop-blur-sm rounded-2xl"
          >
            <p className="text-gray-300 mb-4">
              "{config.brand.name} a révolutionné notre façon de travailler. L'interface est intuitive et les
              fonctionnalités sont exactement ce dont nous avions besoin."
            </p>
            <div className="flex items-center gap-3">
              <img src="https://i.pravatar.cc/40?img=1" alt="User" className="w-10 h-10 rounded-full" />
              <div>
                <p className="text-sm font-medium text-white">Marie Laurent</p>
                <p className="text-xs text-gray-400">CEO, TechCorp</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-white">
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8 text-center">
            <a href="/" className="inline-flex items-center gap-2">
              <span className="text-2xl">{config.brand.logo}</span>
              <span className="text-xl font-bold text-gray-900">{config.brand.name}</span>
            </a>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">{title}</h2>
            <p className="text-gray-500">{subtitle}</p>
          </div>

          {children}
        </motion.div>
      </div>
    </div>
  );
}

/**
 * Social Login Buttons
 */
function SocialLogins() {
  return (
    <div className="space-y-3">
      {config.social.map((provider) => (
        <button
          key={provider.name}
          className="w-full flex items-center justify-center gap-3 px-4 py-3 border border-gray-200 rounded-xl text-gray-700 font-medium hover:bg-gray-50 hover:border-gray-300 transition-all"
        >
          <span className="w-5 h-5 flex items-center justify-center text-lg">{provider.icon}</span>
          Continuer avec {provider.name}
        </button>
      ))}
    </div>
  );
}

/**
 * Divider
 */
function Divider() {
  return (
    <div className="flex items-center gap-4 my-6">
      <div className="flex-1 h-px bg-gray-200" />
      <span className="text-sm text-gray-400">ou</span>
      <div className="flex-1 h-px bg-gray-200" />
    </div>
  );
}

/**
 * Input Field
 */
function InputField({
  label,
  type,
  placeholder,
  icon,
}: {
  label: string;
  type: string;
  placeholder: string;
  icon?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className={`relative transition-all ${focused ? 'scale-[1.02]' : ''}`}>
        {icon && <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">{icon}</div>}
        <input
          type={type}
          placeholder={placeholder}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className={`w-full px-4 py-3 ${icon ? 'pl-11' : ''} border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-all`}
        />
      </div>
    </div>
  );
}

// ============================================================================
// PAGE LOGIN
// ============================================================================

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <AuthLayout title="Connexion" subtitle="Entrez vos identifiants pour accéder à votre compte">
      <SocialLogins />
      <Divider />

      <form className="space-y-4">
        <InputField
          label="Email"
          type="email"
          placeholder="vous@exemple.com"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          }
        />

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-gray-700">Mot de passe</label>
            <a href="#forgot" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Mot de passe oublié ?
            </a>
          </div>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              className="w-full px-4 py-3 pl-11 pr-11 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                  />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              )}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="remember"
            className="w-4 h-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
          />
          <label htmlFor="remember" className="text-sm text-gray-600">
            Se souvenir de moi
          </label>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors"
        >
          Se connecter
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Pas encore de compte ?{' '}
        <a href="#signup" className="text-gray-900 font-medium hover:underline">
          Créer un compte
        </a>
      </p>
    </AuthLayout>
  );
}

// ============================================================================
// PAGE SIGNUP
// ============================================================================

export function SignupPage() {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <AuthLayout title="Créer un compte" subtitle="Commencez votre essai gratuit de 14 jours">
      <SocialLogins />
      <Divider />

      <form className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <InputField label="Prénom" type="text" placeholder="Jean" />
          <InputField label="Nom" type="text" placeholder="Dupont" />
        </div>

        <InputField
          label="Email"
          type="email"
          placeholder="vous@exemple.com"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          }
        />

        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">Mot de passe</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Min. 8 caractères"
              className="w-full px-4 py-3 pr-11 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:border-gray-900 focus:ring-1 focus:ring-gray-900 transition-all"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPassword ? '🙈' : '👁️'}
            </button>
          </div>
          {/* Password Strength */}
          <div className="flex gap-1">
            <div className="flex-1 h-1 bg-emerald-500 rounded-full" />
            <div className="flex-1 h-1 bg-emerald-500 rounded-full" />
            <div className="flex-1 h-1 bg-emerald-500 rounded-full" />
            <div className="flex-1 h-1 bg-gray-200 rounded-full" />
          </div>
          <p className="text-xs text-gray-400">Mot de passe fort</p>
        </div>

        <div className="flex items-start gap-2">
          <input
            type="checkbox"
            id="terms"
            className="w-4 h-4 mt-0.5 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
          />
          <label htmlFor="terms" className="text-sm text-gray-600">
            J'accepte les{' '}
            <a href="#" className="text-gray-900 hover:underline">
              conditions d'utilisation
            </a>{' '}
            et la{' '}
            <a href="#" className="text-gray-900 hover:underline">
              politique de confidentialité
            </a>
          </label>
        </div>

        <button
          type="submit"
          className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors"
        >
          Créer mon compte
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        Déjà un compte ?{' '}
        <a href="#login" className="text-gray-900 font-medium hover:underline">
          Se connecter
        </a>
      </p>
    </AuthLayout>
  );
}

// ============================================================================
// PAGE FORGOT PASSWORD
// ============================================================================

export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);

  if (submitted) {
    return (
      <AuthLayout title="Vérifiez votre email" subtitle="Nous vous avons envoyé un lien de réinitialisation">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-center">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <p className="text-gray-600 mb-6">
            Si un compte existe avec cette adresse email, vous recevrez un lien pour réinitialiser votre mot de passe.
          </p>
          <button onClick={() => setSubmitted(false)} className="text-gray-900 font-medium hover:underline">
            ← Retour à la connexion
          </button>
        </motion.div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Mot de passe oublié ?" subtitle="Entrez votre email pour recevoir un lien de réinitialisation">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
      >
        <InputField
          label="Email"
          type="email"
          placeholder="vous@exemple.com"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          }
        />

        <button
          type="submit"
          className="w-full py-3 bg-gray-900 text-white font-semibold rounded-xl hover:bg-gray-800 transition-colors"
        >
          Envoyer le lien
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        <a href="#login" className="text-gray-900 font-medium hover:underline">
          ← Retour à la connexion
        </a>
      </p>
    </AuthLayout>
  );
}

// ============================================================================
// PAGE PRINCIPALE (démo avec tabs)
// ============================================================================

export default function AuthModern() {
  const [activeTab, setActiveTab] = useState<'login' | 'signup' | 'forgot'>('login');

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Demo Tab Switcher */}
      <div className="fixed top-4 right-4 z-50 bg-white rounded-xl shadow-lg p-1 flex gap-1">
        {[
          { id: 'login', label: 'Login' },
          { id: 'signup', label: 'Signup' },
          { id: 'forgot', label: 'Forgot' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as typeof activeTab)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
              activeTab === tab.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Pages */}
      {activeTab === 'login' && <LoginPage />}
      {activeTab === 'signup' && <SignupPage />}
      {activeTab === 'forgot' && <ForgotPasswordPage />}
    </div>
  );
}
