/**
 * =============================================================================
 * BAVINI CLOUD - Supabase Module
 * =============================================================================
 * Point d'entrée pour le module Supabase.
 * =============================================================================
 */

// Client
export { getSupabaseClient, supabase, isSupabaseConfigured, getSupabaseConfig } from './client';

// Types
export type {
  Database,
  Json,
  Profile,
  ProfileInsert,
  ProfileUpdate,
  Project,
  ProjectInsert,
  ProjectUpdate,
  ProjectFile,
  ProjectFileInsert,
  ProjectFileUpdate,
  BuildCache,
  BuildCacheInsert,
  ChatSession,
  ChatSessionInsert,
  ChatMessage,
  ChatMessageInsert,
} from './types';

// Helpers
export {
  // Projects
  createProject,
  getProject,
  getUserProjects,
  updateProject,
  deleteProject,
  // Files
  saveProjectFiles,
  getProjectFiles,
  deleteProjectFile,
  // Build Cache
  getBuildCache,
  saveBuildCache,
  clearBuildCache,
  // Storage
  uploadAsset,
  getAssetUrl,
  deleteAsset,
} from './helpers';
