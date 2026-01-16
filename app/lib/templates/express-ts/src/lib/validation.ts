import { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';

/**
 * Middleware de validation avec Zod
 * Valide le body, query ou params selon le schéma fourni
 */
export function validate<T extends z.ZodSchema>(schema: T, source: 'body' | 'query' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return res.status(400).json({
        error: {
          message: 'Données invalides',
          details: result.error.flatten().fieldErrors,
        },
      });
    }

    req[source] = result.data;
    next();
  };
}

// Schémas communs réutilisables
export const schemas = {
  id: z.object({
    id: z.string().uuid('ID invalide'),
  }),
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};
