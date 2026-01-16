/**
 * Re-export des types partagés pour le système de chargement des templates
 * Source unique: ~/lib/templates/types.ts
 */

export type {
  TemplateFile,
  TemplateMetadata,
  TemplateFilesResponse,
  TemplateErrorResponse,
} from '~/lib/templates/types';

export { IGNORED_EXTENSIONS, BINARY_EXTENSIONS } from '~/lib/templates/types';
