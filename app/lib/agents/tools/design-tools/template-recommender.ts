/**
 * =============================================================================
 * BAVINI CLOUD - Template Recommender
 * =============================================================================
 * Functions for recommending design templates based on use case.
 *
 * @module lib/agents/tools/design-tools/template-recommender
 * =============================================================================
 */

import { TEMPLATES_METADATA, getTemplatesByUseCase } from '../../design/templates';

/**
 * Mapping des mots-clés vers les templates
 */
const KEYWORD_TO_TEMPLATE: Record<string, string> = {
  // E-commerce
  shop: 'EcommerceModern',
  store: 'EcommerceModern',
  boutique: 'EcommerceModern',
  'e-commerce': 'EcommerceModern',
  ecommerce: 'EcommerceModern',
  marketplace: 'EcommerceModern',
  produit: 'EcommerceModern',
  product: 'EcommerceModern',
  vente: 'EcommerceModern',
  panier: 'EcommerceModern',
  cart: 'EcommerceModern',

  // Landing
  landing: 'LandingModern',
  saas: 'LandingModern',
  startup: 'LandingModern',
  marketing: 'LandingModern',
  launch: 'LandingModern',
  accueil: 'LandingModern',
  home: 'LandingModern',

  // Dashboard
  dashboard: 'DashboardModern',
  admin: 'DashboardModern',
  backoffice: 'DashboardModern',
  analytics: 'DashboardModern',
  'tableau de bord': 'DashboardModern',
  crm: 'DashboardModern',
  gestion: 'DashboardModern',

  // Portfolio
  portfolio: 'PortfolioModern',
  cv: 'PortfolioModern',
  resume: 'PortfolioModern',
  freelance: 'PortfolioModern',
  personnel: 'PortfolioModern',
  personal: 'PortfolioModern',
  créatif: 'PortfolioModern',
  creative: 'PortfolioModern',

  // Blog
  blog: 'BlogModern',
  article: 'BlogModern',
  magazine: 'BlogModern',
  news: 'BlogModern',
  actualité: 'BlogModern',
  journal: 'BlogModern',
  content: 'BlogModern',

  // Pricing
  pricing: 'PricingModern',
  tarif: 'PricingModern',
  prix: 'PricingModern',
  plan: 'PricingModern',
  subscription: 'PricingModern',
  abonnement: 'PricingModern',

  // Agency
  agency: 'AgencyModern',
  agence: 'AgencyModern',
  service: 'AgencyModern',
  consulting: 'AgencyModern',
  studio: 'AgencyModern',
  équipe: 'AgencyModern',
  team: 'AgencyModern',

  // Docs
  doc: 'DocsModern',
  documentation: 'DocsModern',
  api: 'DocsModern',
  guide: 'DocsModern',
  tutorial: 'DocsModern',
  knowledge: 'DocsModern',
  wiki: 'DocsModern',

  // Auth
  auth: 'AuthModern',
  login: 'AuthModern',
  connexion: 'AuthModern',
  signup: 'AuthModern',
  inscription: 'AuthModern',
  register: 'AuthModern',
  password: 'AuthModern',

  // Error
  error: 'ErrorModern',
  erreur: 'ErrorModern',
  '404': 'ErrorModern',
  '500': 'ErrorModern',
  maintenance: 'ErrorModern',
  'not found': 'ErrorModern',
};

/**
 * Recommande le template le plus adapté selon le cas d'usage
 */
export function recommendTemplate(useCase: string): (typeof TEMPLATES_METADATA)[number] | null {
  const useCaseLower = useCase.toLowerCase();

  // Chercher le premier mot-clé qui correspond
  for (const [keyword, templateName] of Object.entries(KEYWORD_TO_TEMPLATE)) {
    if (useCaseLower.includes(keyword)) {
      return TEMPLATES_METADATA.find((t) => t.name === templateName) || null;
    }
  }

  // Essayer avec getTemplatesByUseCase
  const matches = getTemplatesByUseCase(useCase);
  if (matches.length > 0) {
    return matches[0];
  }

  return null;
}

/**
 * Get all available template names
 */
export function getAvailableTemplateNames(): string[] {
  return TEMPLATES_METADATA.map((t) => t.name);
}

/**
 * Get template metadata by name
 */
export function getTemplateMetadata(name: string): (typeof TEMPLATES_METADATA)[number] | undefined {
  return TEMPLATES_METADATA.find((t) => t.name.toLowerCase() === name.toLowerCase());
}
