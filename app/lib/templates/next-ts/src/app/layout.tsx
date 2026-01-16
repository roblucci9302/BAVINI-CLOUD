import type { Metadata } from 'next';
import './globals.css';

// Configuration SEO complète
export const metadata: Metadata = {
  // Base URL pour les URLs absolues
  metadataBase: new URL('https://example.com'),

  // Titre avec template
  title: {
    default: 'Mon Application',
    template: '%s | Mon Application',
  },

  // Description
  description: 'Application Next.js 14 avec TypeScript - Créée avec BAVINI',

  // Mots-clés
  keywords: ['Next.js', 'React', 'TypeScript', 'Application Web'],

  // Auteur
  authors: [{ name: 'BAVINI' }],

  // Open Graph pour les réseaux sociaux
  openGraph: {
    title: 'Mon Application',
    description: 'Application Next.js 14 avec TypeScript - Créée avec BAVINI',
    url: 'https://example.com',
    siteName: 'Mon Application',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Mon Application',
      },
    ],
    locale: 'fr_FR',
    type: 'website',
  },

  // Twitter Card
  twitter: {
    card: 'summary_large_image',
    title: 'Mon Application',
    description: 'Application Next.js 14 avec TypeScript - Créée avec BAVINI',
    images: ['/og-image.png'],
  },

  // Robots
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // Icônes
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
