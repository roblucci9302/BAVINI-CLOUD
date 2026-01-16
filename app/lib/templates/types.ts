/**
 * Types partagés pour le système de chargement des templates
 * Ces types sont utilisés à la fois côté client et serveur
 */

/**
 * Représente un fichier dans un template
 */
export interface TemplateFile {
  /** Chemin relatif du fichier (ex: "src/App.tsx") */
  path: string;

  /** Contenu du fichier */
  content: string;
}

/**
 * Métadonnées d'un template
 */
export interface TemplateMetadata {
  /** Identifiant unique du template */
  id: string;

  /** Nom affiché */
  name: string;

  /** Description du template */
  description: string;

  /** Nombre total de fichiers */
  totalFiles: number;

  /** Taille totale en octets */
  totalSize: number;
}

/**
 * Réponse de l'API de chargement de template (succès)
 */
export interface TemplateFilesResponse {
  /** Succès de l'opération (toujours true pour ce type) */
  success: true;

  /** Métadonnées du template */
  metadata: TemplateMetadata;

  /** Liste des fichiers du template */
  files: TemplateFile[];
}

/**
 * Réponse d'erreur de l'API
 */
export interface TemplateErrorResponse {
  success: false;
  error: string;
  code: 'NOT_FOUND' | 'NO_FILES' | 'READ_ERROR' | 'INVALID_ID';
}

/**
 * Extensions de fichiers à ignorer lors du chargement
 */
export const IGNORED_EXTENSIONS = ['.DS_Store', '.gitkeep', '.git', 'node_modules', 'dist', 'build', '.cache'];

/**
 * Extensions de fichiers binaires (à encoder en base64 si nécessaire)
 */
export const BINARY_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.eot'];
