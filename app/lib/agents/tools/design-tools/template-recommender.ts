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
 * Mapping des mots-clés vers les templates STRUCTURELS uniquement
 *
 * Les templates créatifs (LandingModern, EcommerceModern, PortfolioModern,
 * BlogModern, PricingModern, AgencyModern) ne sont PAS auto-liés.
 * Ils restent accessibles manuellement si demandés explicitement.
 */
const KEYWORD_TO_TEMPLATE: Record<string, string> = {
  // Dashboard - Template structurel
  dashboard: 'DashboardModern',
  admin: 'DashboardModern',
  backoffice: 'DashboardModern',
  analytics: 'DashboardModern',
  'tableau de bord': 'DashboardModern',
  crm: 'DashboardModern',
  gestion: 'DashboardModern',

  // Docs - Template structurel
  doc: 'DocsModern',
  documentation: 'DocsModern',
  api: 'DocsModern',
  guide: 'DocsModern',
  tutorial: 'DocsModern',
  knowledge: 'DocsModern',
  wiki: 'DocsModern',

  // Auth - Template structurel
  auth: 'AuthModern',
  login: 'AuthModern',
  connexion: 'AuthModern',
  signup: 'AuthModern',
  inscription: 'AuthModern',
  register: 'AuthModern',
  password: 'AuthModern',

  // Error - Template structurel
  error: 'ErrorModern',
  erreur: 'ErrorModern',
  '404': 'ErrorModern',
  '500': 'ErrorModern',
  maintenance: 'ErrorModern',
  'not found': 'ErrorModern',
};

/**
 * Recommande le template le plus adapté selon le cas d'usage
 *
 * IMPORTANT: Ne retourne QUE des templates STRUCTURELS (autoLink: true)
 * - Dashboard, Docs, Auth, Error
 *
 * Pour les projets CRÉATIFS (landing, e-commerce, portfolio, blog, pricing, agency),
 * cette fonction retourne null → l'IA doit créer un design unique.
 */
export function recommendTemplate(useCase: string): (typeof TEMPLATES_METADATA)[number] | null {
  const useCaseLower = useCase.toLowerCase();

  // Chercher le premier mot-clé qui correspond (UNIQUEMENT structurels)
  for (const [keyword, templateName] of Object.entries(KEYWORD_TO_TEMPLATE)) {
    if (useCaseLower.includes(keyword)) {
      const template = TEMPLATES_METADATA.find((t) => t.name === templateName);
      // Double vérification: ne retourner que si autoLink est true
      if (template && template.autoLink === true) {
        return template;
      }
    }
  }

  // Fallback: getTemplatesByUseCase ne retourne QUE les templates autoLink: true
  const matches = getTemplatesByUseCase(useCase);
  if (matches.length > 0) {
    return matches[0];
  }

  // Aucun template structurel trouvé → l'IA doit créer un design unique
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
