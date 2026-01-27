/**
 * Templates BAVINI - Prêts à l'emploi
 *
 * 10 templates complets avec design moderne 2025
 */

// Templates originaux
export { default as LandingModern } from './landing-modern';
export { default as DashboardModern } from './dashboard-modern';
export { default as PortfolioModern } from './portfolio-modern';

// Nouveaux templates
export { default as EcommerceModern } from './ecommerce-modern';
export { default as BlogModern } from './blog-modern';
export { default as PricingModern } from './pricing-modern';
export { default as AgencyModern } from './agency-modern';
export { default as DocsModern } from './docs-modern';
export { default as AuthModern, LoginPage, SignupPage, ForgotPasswordPage } from './auth-modern';
export { default as ErrorModern, Error404, MaintenancePage } from './error-modern';

/**
 * Métadonnées des templates disponibles
 *
 * autoLink: true = Template auto-sélectionné par keywords (structurels)
 * autoLink: false = Template accessible uniquement sur demande explicite (créatifs)
 */
export const TEMPLATES_METADATA = [
  {
    name: 'LandingModern',
    file: 'landing-modern.tsx',
    description: 'Landing page SaaS/Startup avec palette Aurora',
    palette: 'Aurora',
    sections: ['Navbar', 'Hero', 'Features', 'Pricing', 'Footer'],
    useCases: ['SaaS', 'Startup', 'Product launch', 'Marketing'],
    autoLink: false, // Créatif - design unique recommandé
  },
  {
    name: 'DashboardModern',
    file: 'dashboard-modern.tsx',
    description: 'Dashboard/Admin panel avec palette Midnight',
    palette: 'Midnight',
    sections: ['Sidebar', 'Header', 'Stats', 'Charts', 'Tables', 'Activity'],
    useCases: ['Admin', 'Analytics', 'CRM', 'Backoffice'],
    autoLink: true, // Structurel - auto-lié
  },
  {
    name: 'PortfolioModern',
    file: 'portfolio-modern.tsx',
    description: 'Portfolio créatif avec palette Obsidian',
    palette: 'Obsidian',
    sections: ['Navigation', 'Hero', 'Stats', 'Projects', 'Services', 'Skills', 'Testimonials', 'Contact'],
    useCases: ['Portfolio', 'Agence', 'Freelance', 'Creative'],
    autoLink: false, // Créatif - design unique recommandé
  },
  {
    name: 'EcommerceModern',
    file: 'ecommerce-modern.tsx',
    description: 'Boutique e-commerce avec palette Ember',
    palette: 'Ember',
    sections: ['Header', 'Hero Banner', 'Filters', 'Product Grid', 'Features', 'Newsletter', 'Footer'],
    useCases: ['E-commerce', 'Boutique', 'Marketplace', 'Retail'],
    autoLink: false, // Créatif - design unique recommandé
  },
  {
    name: 'BlogModern',
    file: 'blog-modern.tsx',
    description: 'Blog/Magazine avec palette Slate',
    palette: 'Slate',
    sections: ['Header', 'Featured Post', 'Categories', 'Posts Grid', 'Sidebar', 'Newsletter', 'Footer'],
    useCases: ['Blog', 'Magazine', 'News', 'Content'],
    autoLink: false, // Créatif - design unique recommandé
  },
  {
    name: 'PricingModern',
    file: 'pricing-modern.tsx',
    description: 'Page tarifs SaaS avec palette Aurora',
    palette: 'Aurora',
    sections: ['Header', 'Pricing Cards', 'Comparison Table', 'Testimonials', 'FAQ', 'CTA', 'Footer'],
    useCases: ['SaaS Pricing', 'Plans', 'Subscriptions', 'Enterprise'],
    autoLink: false, // Créatif - design unique recommandé
  },
  {
    name: 'AgencyModern',
    file: 'agency-modern.tsx',
    description: 'Page agence/services avec palette Rose',
    palette: 'Rose',
    sections: ['Navigation', 'Hero', 'Services', 'Projects', 'Process', 'Team', 'Testimonials', 'Contact', 'Footer'],
    useCases: ['Agency', 'Services', 'Consulting', 'Studio'],
    autoLink: false, // Créatif - design unique recommandé
  },
  {
    name: 'DocsModern',
    file: 'docs-modern.tsx',
    description: 'Documentation technique avec palette Midnight',
    palette: 'Midnight',
    sections: ['Header', 'Sidebar', 'Table of Contents', 'Content', 'Code Blocks', 'Navigation'],
    useCases: ['Documentation', 'API Docs', 'Knowledge Base', 'Technical'],
    autoLink: true, // Structurel - auto-lié
  },
  {
    name: 'AuthModern',
    file: 'auth-modern.tsx',
    description: 'Pages authentification avec palette Slate',
    palette: 'Slate',
    sections: ['Login', 'Signup', 'Forgot Password', 'Social Login'],
    useCases: ['Authentication', 'Login', 'Registration', 'User Onboarding'],
    autoLink: true, // Structurel - auto-lié
  },
  {
    name: 'ErrorModern',
    file: 'error-modern.tsx',
    description: 'Pages erreur créatives avec palette Neon',
    palette: 'Neon',
    sections: ['404', '500', '403', 'Maintenance'],
    useCases: ['Error Pages', '404', 'Maintenance', 'Server Error'],
    autoLink: true, // Structurel - auto-lié
  },
] as const;

/**
 * Récupère un template par son nom
 */
export function getTemplateByName(name: string) {
  return TEMPLATES_METADATA.find((t) => t.name.toLowerCase() === name.toLowerCase());
}

/**
 * Récupère les templates par cas d'usage
 *
 * NOTE: Ne retourne QUE les templates avec autoLink: true (structurels)
 * Les templates créatifs (autoLink: false) ne sont PAS retournés par cette fonction.
 */
export function getTemplatesByUseCase(useCase: string) {
  return TEMPLATES_METADATA.filter(
    (t) => t.autoLink === true && t.useCases.some((u) => u.toLowerCase().includes(useCase.toLowerCase()))
  );
}

/**
 * Récupère les templates par palette
 */
export function getTemplatesByPalette(palette: string) {
  return TEMPLATES_METADATA.filter((t) => t.palette.toLowerCase() === palette.toLowerCase());
}
