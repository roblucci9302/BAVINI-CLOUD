-- ==============================================================================
-- BAVINI CLOUD - Storage Buckets Configuration
-- ==============================================================================
-- Run this AFTER 002_rls_policies.sql
-- ==============================================================================

-- Create storage bucket for project assets (images, binaries, etc.)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-assets',
  'project-assets',
  false,
  52428800, -- 50MB max file size
  ARRAY[
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'application/pdf',
    'application/zip',
    'font/woff',
    'font/woff2',
    'font/ttf',
    'font/otf'
  ]
) ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for user avatars
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true, -- Public bucket for avatars
  5242880, -- 5MB max
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp']
) ON CONFLICT (id) DO NOTHING;

-- ==============================================================================
-- STORAGE POLICIES - Project Assets
-- ==============================================================================

CREATE POLICY "Users can upload assets to their projects"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'project-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view assets of their projects"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'project-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update assets of their projects"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'project-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete assets of their projects"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'project-assets'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ==============================================================================
-- STORAGE POLICIES - Avatars
-- ==============================================================================

CREATE POLICY "Anyone can view avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
