/**
 * Service de chargement des templates
 * Utilise import.meta.glob pour charger les fichiers au build time (compatible Cloudflare)
 */

import { getTemplateById } from '~/lib/templates';
import type { TemplateFile, TemplateFilesResponse, TemplateErrorResponse, TemplateMetadata } from './types';
import { IGNORED_EXTENSIONS } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('template-loader');

/**
 * Import de tous les fichiers templates au build time avec leur contenu
 * Le pattern ?raw permet d'obtenir le contenu brut du fichier
 */
const templateFiles = import.meta.glob<string>('/app/lib/templates/*/**/*', {
  query: '?raw',
  import: 'default',
  eager: true,
});

/**
 * Filtre les chemins à ignorer
 */
function shouldIgnorePath(path: string): boolean {
  return IGNORED_EXTENSIONS.some((ext) => path.includes(ext));
}

/**
 * Extrait le templateDir et le chemin relatif depuis un chemin complet
 * @example "/app/lib/templates/supabase-fullstack/src/App.tsx" -> { templateDir: "supabase-fullstack", relativePath: "src/App.tsx" }
 */
function parseTemplatePath(fullPath: string): { templateDir: string; relativePath: string } | null {
  const match = fullPath.match(/\/app\/lib\/templates\/([^/]+)\/(.+)$/);

  if (!match) {
    return null;
  }

  return {
    templateDir: match[1],
    relativePath: match[2],
  };
}

/**
 * Récupère tous les fichiers d'un template par son ID
 */
export function getTemplateFiles(templateId: string): TemplateFile[] {
  const template = getTemplateById(templateId);

  if (!template || !template.templateDir) {
    logger.warn(`Template "${templateId}" not found or has no templateDir`);
    return [];
  }

  const files: TemplateFile[] = [];
  const templateDir = template.templateDir;

  for (const [fullPath, content] of Object.entries(templateFiles)) {
    const parsed = parseTemplatePath(fullPath);

    if (!parsed || parsed.templateDir !== templateDir) {
      continue;
    }

    if (shouldIgnorePath(parsed.relativePath)) {
      continue;
    }

    files.push({
      path: parsed.relativePath,
      content: content as string,
    });
  }

  logger.info(`Loaded ${files.length} files for template "${templateId}"`);

  return files;
}

/**
 * Récupère les métadonnées d'un template
 */
export function getTemplateMetadata(templateId: string): TemplateMetadata | null {
  const template = getTemplateById(templateId);

  if (!template) {
    return null;
  }

  const files = getTemplateFiles(templateId);
  const totalSize = files.reduce((acc, file) => acc + file.content.length, 0);

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    totalFiles: files.length,
    totalSize,
  };
}

/**
 * Charge un template complet (métadonnées + fichiers)
 * Retourne une réponse formatée pour l'API
 */
export function loadTemplate(templateId: string): TemplateFilesResponse | TemplateErrorResponse {
  const template = getTemplateById(templateId);

  // Vérifier que le template existe
  if (!template) {
    logger.error(`Template "${templateId}" not found`);
    return {
      success: false,
      error: `Template "${templateId}" not found`,
      code: 'NOT_FOUND',
    };
  }

  // Vérifier que le template a un templateDir
  if (!template.templateDir) {
    logger.error(`Template "${templateId}" has no pre-built files`);
    return {
      success: false,
      error: `Template "${templateId}" has no pre-built files (no templateDir)`,
      code: 'NO_FILES',
    };
  }

  // Charger les fichiers
  const files = getTemplateFiles(templateId);

  if (files.length === 0) {
    logger.error(`No files found for template "${templateId}"`);
    return {
      success: false,
      error: `No files found for template "${templateId}"`,
      code: 'READ_ERROR',
    };
  }

  // Calculer les métadonnées
  const totalSize = files.reduce((acc, file) => acc + file.content.length, 0);

  const metadata: TemplateMetadata = {
    id: template.id,
    name: template.name,
    description: template.description,
    totalFiles: files.length,
    totalSize,
  };

  logger.info(`Template "${templateId}" loaded successfully: ${files.length} files, ${totalSize} bytes`);

  return {
    success: true,
    metadata,
    files,
  };
}

/**
 * Liste tous les templates disponibles avec leurs métadonnées
 */
export function listAvailableTemplates(): TemplateMetadata[] {
  const templates: TemplateMetadata[] = [];

  // Extraire les templateDirs uniques
  const templateDirs = new Set<string>();

  for (const fullPath of Object.keys(templateFiles)) {
    const parsed = parseTemplatePath(fullPath);

    if (parsed) {
      templateDirs.add(parsed.templateDir);
    }
  }

  // Obtenir les métadonnées pour chaque templateDir
  for (const dir of templateDirs) {
    const metadata = getTemplateMetadata(dir);

    if (metadata) {
      templates.push(metadata);
    }
  }

  return templates;
}
