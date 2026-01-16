/**
 * Schémas de validation Zod pour les formulaires
 */

import { z } from 'zod';

/**
 * Schéma de validation pour la connexion
 */
export const loginSchema = z.object({
  email: z.string().min(1, "L'email est requis").email("Format d'email invalide"),
  password: z.string().min(1, 'Le mot de passe est requis'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Schéma de validation pour l'inscription
 */
export const registerSchema = z
  .object({
    fullName: z.string().optional(),
    email: z.string().min(1, "L'email est requis").email("Format d'email invalide"),
    password: z
      .string()
      .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre',
      ),
    confirmPassword: z.string().min(1, 'La confirmation du mot de passe est requise'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirmPassword'],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Schéma de validation pour le profil
 */
export const profileSchema = z.object({
  fullName: z.string().max(100, 'Le nom ne peut pas dépasser 100 caractères').optional(),
  bio: z.string().max(500, 'La bio ne peut pas dépasser 500 caractères').optional(),
  website: z.string().url('URL invalide').optional().or(z.literal('')),
});

export type ProfileFormData = z.infer<typeof profileSchema>;

/**
 * Helper pour extraire les erreurs Zod en format lisible
 */
export function formatZodErrors(error: z.ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  error.errors.forEach((err) => {
    if (err.path.length > 0) {
      errors[err.path[0] as string] = err.message;
    }
  });

  return errors;
}
