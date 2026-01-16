/**
 * Tests pour SQLValidator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SQLValidator, createSQLValidator } from './SQLValidator';

describe('SQLValidator', () => {
  let validator: SQLValidator;

  beforeEach(() => {
    validator = createSQLValidator();
  });

  describe('validate', () => {
    describe('SQL valide', () => {
      it('devrait valider un CREATE TABLE simple', async () => {
        const sql = `
          CREATE TABLE users (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            email text NOT NULL UNIQUE,
            name text,
            created_at timestamptz DEFAULT now()
          );
        `;

        const result = await validator.validate(sql);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
        expect(result.securityIssues).toHaveLength(0);
      });

      it('devrait valider un ALTER TABLE', async () => {
        const sql = `ALTER TABLE users ADD COLUMN age int4;`;

        const result = await validator.validate(sql);

        expect(result.isValid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('devrait valider un CREATE INDEX', async () => {
        const sql = `CREATE INDEX idx_users_email ON users (email);`;

        const result = await validator.validate(sql);

        expect(result.isValid).toBe(true);
      });

      it('devrait valider un INSERT', async () => {
        const sql = `INSERT INTO users (email, name) VALUES ('test@example.com', 'Test User');`;

        const result = await validator.validate(sql);

        expect(result.isValid).toBe(true);
      });
    });

    describe('Mots-clés interdits', () => {
      it('devrait rejeter DROP DATABASE', async () => {
        const sql = `DROP DATABASE production;`;

        const result = await validator.validate(sql);

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.code === 'FORBIDDEN_KEYWORD')).toBe(true);
        expect(result.securityIssues.some((i) => i.type === 'forbidden_keyword')).toBe(true);
      });

      it('devrait rejeter DROP SCHEMA', async () => {
        const sql = `DROP SCHEMA public CASCADE;`;

        const result = await validator.validate(sql);

        expect(result.isValid).toBe(false);
        expect(result.errors.some((e) => e.code === 'FORBIDDEN_KEYWORD')).toBe(true);
      });

      it('devrait rejeter TRUNCATE par défaut', async () => {
        const sql = `TRUNCATE TABLE users;`;

        const result = await validator.validate(sql);

        expect(result.errors.some((e) => e.code === 'TRUNCATE_NOT_ALLOWED')).toBe(true);
      });

      it('devrait autoriser TRUNCATE si configuré', async () => {
        const permissiveValidator = createSQLValidator({ allowTruncate: true });
        const sql = `TRUNCATE TABLE users;`;

        const result = await permissiveValidator.validate(sql);

        expect(result.errors.some((e) => e.code === 'TRUNCATE_NOT_ALLOWED')).toBe(false);
      });

      it('devrait rejeter ALTER SYSTEM', async () => {
        const sql = `ALTER SYSTEM SET max_connections = 200;`;

        const result = await validator.validate(sql);

        expect(result.isValid).toBe(false);
      });
    });

    describe("Détection d'injection SQL", () => {
      it('devrait détecter UNION SELECT', async () => {
        const sql = `SELECT * FROM users WHERE id = 1 UNION SELECT * FROM admin_users;`;

        const result = await validator.validate(sql);

        expect(result.securityIssues.some((i) => i.type === 'injection')).toBe(true);
      });

      it('devrait détecter les commentaires avec DROP', async () => {
        const sql = `SELECT * FROM users; -- DROP TABLE users;`;

        const result = await validator.validate(sql);

        expect(result.securityIssues.length).toBeGreaterThan(0);
      });

      it('devrait détecter les points-virgules multiples suspects', async () => {
        const sql = `SELECT * FROM users; DELETE FROM users;`;

        const result = await validator.validate(sql);

        expect(result.securityIssues.some((i) => i.type === 'injection')).toBe(true);
      });
    });

    describe('Validation syntaxique', () => {
      it('devrait détecter les parenthèses non équilibrées', async () => {
        const sql = `CREATE TABLE users (id uuid PRIMARY KEY;`;

        const result = await validator.validate(sql);

        expect(result.errors.some((e) => e.code === 'UNBALANCED_PARENTHESES')).toBe(true);
      });

      it('devrait détecter une table vide', async () => {
        const sql = `CREATE TABLE empty_table ();`;

        const result = await validator.validate(sql);

        expect(result.errors.some((e) => e.code === 'EMPTY_TABLE')).toBe(true);
      });

      it('devrait détecter un ALTER sans action', async () => {
        const sql = `ALTER TABLE users;`;

        const result = await validator.validate(sql);

        expect(result.errors.some((e) => e.code === 'EMPTY_ALTER')).toBe(true);
      });

      it('devrait détecter les guillemets non appariés', async () => {
        const sql = `INSERT INTO users (name) VALUES ('test);`;

        const result = await validator.validate(sql);

        expect(result.warnings.some((w) => w.code === 'UNMATCHED_QUOTES')).toBe(true);
      });
    });

    describe('Bonnes pratiques', () => {
      it('devrait avertir sur SELECT *', async () => {
        const strictValidator = createSQLValidator({ strictMode: true });
        const sql = `SELECT * FROM users;`;

        const result = await strictValidator.validate(sql);

        expect(result.warnings.some((w) => w.code === 'SELECT_STAR')).toBe(true);
      });

      it('devrait avertir sur DELETE sans WHERE', async () => {
        const sql = `DELETE FROM users;`;

        const result = await validator.validate(sql);

        expect(result.warnings.some((w) => w.code === 'DELETE_WITHOUT_WHERE')).toBe(true);
      });

      it('devrait avertir sur UPDATE sans WHERE', async () => {
        const sql = `UPDATE users SET active = false;`;

        const result = await validator.validate(sql);

        expect(result.warnings.some((w) => w.code === 'UPDATE_WITHOUT_WHERE')).toBe(true);
      });

      it('devrait suggérer CURRENT_TIMESTAMP au lieu de NOW()', async () => {
        const sql = `INSERT INTO users (created_at) VALUES (now());`;

        const result = await validator.validate(sql);

        expect(result.warnings.some((w) => w.code === 'USE_CURRENT_TIMESTAMP')).toBe(true);
      });
    });

    describe('Validation des identifiants', () => {
      it('devrait rejeter les mots réservés comme identifiants', async () => {
        const sql = `CREATE TABLE select (id uuid);`;

        const result = await validator.validate(sql);

        expect(result.errors.some((e) => e.code === 'RESERVED_KEYWORD_AS_IDENTIFIER')).toBe(true);
      });

      it('devrait avertir sur les identifiants non snake_case', async () => {
        const sql = `CREATE TABLE UserAccounts (userId uuid);`;

        const result = await validator.validate(sql);

        expect(result.warnings.some((w) => w.code === 'NAMING_CONVENTION')).toBe(true);
      });

      it('devrait rejeter les identifiants trop longs', async () => {
        const longName = 'a'.repeat(64);
        const sql = `CREATE TABLE ${longName} (id uuid);`;

        const result = await validator.validate(sql);

        expect(result.errors.some((e) => e.code === 'IDENTIFIER_TOO_LONG')).toBe(true);
      });
    });

    describe('Sanitization', () => {
      it('devrait retirer les commentaires sur une ligne', async () => {
        const sql = `
          SELECT * FROM users; -- Commentaire
        `;

        const result = await validator.validate(sql);

        expect(result.sanitizedSQL).not.toContain('--');
        expect(result.sanitizedSQL).not.toContain('Commentaire');
      });

      it('devrait retirer les commentaires multi-lignes', async () => {
        const sql = `
          SELECT * FROM users /* Ceci est un
          commentaire multi-ligne */;
        `;

        const result = await validator.validate(sql);

        expect(result.sanitizedSQL).not.toContain('/*');
        expect(result.sanitizedSQL).not.toContain('*/');
      });

      it('devrait normaliser les espaces', async () => {
        const sql = `
          SELECT    *   FROM   users;
        `;

        const result = await validator.validate(sql);

        expect(result.sanitizedSQL).not.toContain('  ');
        expect(result.sanitizedSQL).toBe('SELECT * FROM users;');
      });
    });

    describe('Longueur maximale', () => {
      it('devrait rejeter les requêtes trop longues', async () => {
        const shortValidator = createSQLValidator({ maxQueryLength: 50 });
        const sql = 'SELECT * FROM users WHERE id = 1 AND name = "test" AND email = "test@test.com"';

        const result = await shortValidator.validate(sql);

        expect(result.errors.some((e) => e.code === 'SQL_TOO_LONG')).toBe(true);
      });
    });
  });

  describe('validateMigration', () => {
    it('devrait valider une migration réversible', async () => {
      const up = `CREATE TABLE users (id uuid PRIMARY KEY);`;
      const down = `DROP TABLE IF EXISTS users;`;

      const result = await validator.validateMigration(up, down);

      expect(result.isValid).toBe(true);
      expect(result.isReversible).toBe(true);
    });

    it('devrait détecter une migration non réversible', async () => {
      const up = `CREATE TABLE users (id uuid PRIMARY KEY);`;
      const down = `SELECT 1;`;

      const result = await validator.validateMigration(up, down);

      expect(result.isReversible).toBe(false);
    });

    it('devrait valider les colonnes ajoutées/supprimées', async () => {
      const up = `ALTER TABLE users ADD COLUMN email text;`;
      const down = `ALTER TABLE users DROP COLUMN email;`;

      const result = await validator.validateMigration(up, down);

      expect(result.isValid).toBe(true);
      expect(result.isReversible).toBe(true);
    });

    it('devrait rejeter si UP contient des mots-clés interdits', async () => {
      const up = `DROP DATABASE production;`;
      const down = `SELECT 1;`;

      const result = await validator.validateMigration(up, down);

      expect(result.isValid).toBe(false);
      expect(result.upValidation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('createSQLValidator factory', () => {
    it('devrait créer un validateur avec options par défaut', () => {
      const validator = createSQLValidator();

      expect(validator).toBeInstanceOf(SQLValidator);
    });

    it('devrait créer un validateur avec options personnalisées', () => {
      const validator = createSQLValidator({
        strictMode: false,
        allowTruncate: true,
        maxQueryLength: 50000,
      });

      expect(validator).toBeInstanceOf(SQLValidator);
    });
  });
});
