/**
 * =============================================================================
 * BAVINI CLOUD - Supabase Helpers
 * =============================================================================
 * Fonctions utilitaires pour les opérations courantes avec Supabase.
 * =============================================================================
 */

import { getSupabaseClient } from './client';
import type {
  Project,
  ProjectInsert,
  ProjectUpdate,
  ProjectFile,
  ProjectFileInsert,
  BuildCache,
  BuildCacheInsert,
} from './types';

// =============================================================================
// PROJECTS
// =============================================================================

/**
 * Create a new project
 */
export async function createProject(project: ProjectInsert): Promise<Project> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.from('projects').insert(project).select().single();

  if (error) {
    throw new Error(`Failed to create project: ${error.message}`);
  }

  return data;
}

/**
 * Get a project by ID
 */
export async function getProject(projectId: string): Promise<Project | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found
    }

    throw new Error(`Failed to get project: ${error.message}`);
  }

  return data;
}

/**
 * Get all projects for a user
 */
export async function getUserProjects(userId: string): Promise<Project[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('user_id', userId)
    .neq('status', 'deleted')
    .order('updated_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to get user projects: ${error.message}`);
  }

  return data || [];
}

/**
 * Update a project
 */
export async function updateProject(projectId: string, updates: ProjectUpdate): Promise<Project> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', projectId)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update project: ${error.message}`);
  }

  return data;
}

/**
 * Soft delete a project (set status to 'deleted')
 */
export async function deleteProject(projectId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('projects')
    .update({ status: 'deleted' })
    .eq('id', projectId);

  if (error) {
    throw new Error(`Failed to delete project: ${error.message}`);
  }
}

// =============================================================================
// PROJECT FILES
// =============================================================================

/**
 * Save multiple project files (upsert)
 */
export async function saveProjectFiles(
  projectId: string,
  files: Map<string, string>,
): Promise<void> {
  const supabase = getSupabaseClient();

  const fileRecords: ProjectFileInsert[] = Array.from(files.entries()).map(([path, content]) => ({
    project_id: projectId,
    path,
    name: path.split('/').pop() || path,
    content,
    size_bytes: new TextEncoder().encode(content).length,
    is_directory: false,
  }));

  const { error } = await supabase.from('project_files').upsert(fileRecords, {
    onConflict: 'project_id,path',
  });

  if (error) {
    throw new Error(`Failed to save project files: ${error.message}`);
  }
}

/**
 * Get all files for a project
 */
export async function getProjectFiles(projectId: string): Promise<ProjectFile[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .order('path');

  if (error) {
    throw new Error(`Failed to get project files: ${error.message}`);
  }

  return data || [];
}

/**
 * Delete a project file
 */
export async function deleteProjectFile(projectId: string, path: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase
    .from('project_files')
    .delete()
    .eq('project_id', projectId)
    .eq('path', path);

  if (error) {
    throw new Error(`Failed to delete project file: ${error.message}`);
  }
}

// =============================================================================
// BUILD CACHE
// =============================================================================

/**
 * Get cached build by key
 */
export async function getBuildCache(
  projectId: string,
  cacheKey: string,
): Promise<BuildCache | null> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('build_cache')
    .select('*')
    .eq('project_id', projectId)
    .eq('cache_key', cacheKey)
    .gt('expires_at', new Date().toISOString())
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      return null; // Not found or expired
    }

    throw new Error(`Failed to get build cache: ${error.message}`);
  }

  return data;
}

/**
 * Save build to cache
 */
export async function saveBuildCache(cache: BuildCacheInsert): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from('build_cache').upsert(cache, {
    onConflict: 'project_id,cache_key',
  });

  if (error) {
    throw new Error(`Failed to save build cache: ${error.message}`);
  }
}

/**
 * Clear all cache for a project
 */
export async function clearBuildCache(projectId: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.from('build_cache').delete().eq('project_id', projectId);

  if (error) {
    throw new Error(`Failed to clear build cache: ${error.message}`);
  }
}

// =============================================================================
// STORAGE (Assets)
// =============================================================================

/**
 * Upload an asset to storage
 */
export async function uploadAsset(
  userId: string,
  projectId: string,
  fileName: string,
  file: File | Blob,
): Promise<string> {
  const supabase = getSupabaseClient();

  const path = `${userId}/${projectId}/${fileName}`;

  const { error } = await supabase.storage.from('project-assets').upload(path, file, {
    upsert: true,
  });

  if (error) {
    throw new Error(`Failed to upload asset: ${error.message}`);
  }

  return path;
}

/**
 * Get public URL for an asset
 */
export function getAssetUrl(path: string): string {
  const supabase = getSupabaseClient();

  const { data } = supabase.storage.from('project-assets').getPublicUrl(path);

  return data.publicUrl;
}

/**
 * Delete an asset from storage
 */
export async function deleteAsset(path: string): Promise<void> {
  const supabase = getSupabaseClient();

  const { error } = await supabase.storage.from('project-assets').remove([path]);

  if (error) {
    throw new Error(`Failed to delete asset: ${error.message}`);
  }
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Generate a slug from a project name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);
}

/**
 * Generate a cache key from file content
 */
export function generateCacheKey(entryPoint: string, files: Map<string, string>): string {
  const content = Array.from(files.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, content]) => `${path}:${content}`)
    .join('|');

  // Simple hash
  let hash = 0;

  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  return `${entryPoint}:${Math.abs(hash).toString(16)}`;
}
