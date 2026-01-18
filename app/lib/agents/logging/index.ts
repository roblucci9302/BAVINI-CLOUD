/**
 * Module de logging pour les agents BAVINI
 *
 * @module agents/logging
 */

export {
  // Types
  type AuditEntryType,
  type AuditOutcome,
  type AuditEntry,
  type AuditEntryInput,
  type AuditQueryFilter,
  type AuditQueryOptions,
  type AuditStats,
  type AuditStorage,
  type AuditLoggerConfig,
  // Configuration
  DEFAULT_AUDIT_CONFIG,
  // Classes
  AuditLogger,
  MemoryAuditStorage,
  // Factory et singleton
  createAuditLogger,
  getGlobalAuditLogger,
  initializeGlobalAuditLogger,
  resetGlobalAuditLogger,
  // Alias pratique
  auditLogger,
} from './audit-logger';
