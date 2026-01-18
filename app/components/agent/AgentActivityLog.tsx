'use client';

/**
 * Historique des activités des agents
 *
 * Affiche un log en temps réel de toutes les actions des agents,
 * leur statut, et le résultat de chaque opération.
 */

import React, { memo, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { systemLogsStore, agentStatsStore, clearSystemLogs, type LogEntry } from '~/lib/stores/agents';
import type { AgentType, LogLevel } from '~/lib/agents/types';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

interface AgentActivityLogProps {
  /** Le panneau est-il ouvert ? */
  isOpen: boolean;

  /** Callback pour fermer */
  onClose: () => void;

  /** Nombre max de logs à afficher */
  maxLogs?: number;

  /** Auto-scroll vers le bas ? */
  autoScroll?: boolean;
}

interface LogItemProps {
  log: LogEntry;
}

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

/**
 * Formate un timestamp en heure locale
 */
function formatTime(date: Date): string {
  return date.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/**
 * Obtient la couleur du niveau de log.
 */
function getLogLevelColor(level: LogLevel): string {
  switch (level) {
    case 'debug':
      return 'text-gray-400';
    case 'info':
      return 'text-blue-400';
    case 'warn':
      return 'text-yellow-400';
    case 'error':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
}

/**
 * Obtient l'icône du niveau de log
 */
function getLogLevelIcon(level: LogLevel): string {
  switch (level) {
    case 'debug':
      return 'i-ph:bug';
    case 'info':
      return 'i-ph:info';
    case 'warn':
      return 'i-ph:warning';
    case 'error':
      return 'i-ph:x-circle';
    default:
      return 'i-ph:circle';
  }
}

/**
 * Obtient l'icône de l'agent
 */
function getAgentIcon(agent: AgentType): string {
  const icons: Record<AgentType, string> = {
    orchestrator: 'i-ph:brain',
    explore: 'i-ph:magnifying-glass',
    coder: 'i-ph:code',
    builder: 'i-ph:hammer',
    tester: 'i-ph:test-tube',
    deployer: 'i-ph:rocket-launch',
    reviewer: 'i-ph:eye',
    fixer: 'i-ph:wrench',
    architect: 'i-ph:blueprint',
  };
  return icons[agent] || 'i-ph:robot';
}

/**
 * Obtient la couleur de l'agent
 */
function getAgentColor(agent: AgentType): string {
  const colors: Record<AgentType, string> = {
    orchestrator: 'text-purple-400',
    explore: 'text-cyan-400',
    coder: 'text-green-400',
    builder: 'text-orange-400',
    tester: 'text-yellow-400',
    deployer: 'text-pink-400',
    reviewer: 'text-blue-400',
    fixer: 'text-red-400',
    architect: 'text-indigo-400',
  };
  return colors[agent] || 'text-gray-400';
}

/*
 * ============================================================================
 * COMPONENTS
 * ============================================================================
 */

/**
 * Item de log individuel
 */
const LogItem = memo(({ log }: LogItemProps) => {
  const levelColor = getLogLevelColor(log.level);
  const levelIcon = getLogLevelIcon(log.level);
  const agentIcon = log.agentName ? getAgentIcon(log.agentName) : '';
  const agentColor = log.agentName ? getAgentColor(log.agentName) : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-2 py-2 px-3 hover:bg-bolt-elements-background-depth-3 transition-colors text-sm"
    >
      {/* Timestamp */}
      <span className="text-xs text-bolt-elements-textTertiary font-mono w-16 flex-shrink-0">
        {formatTime(log.timestamp)}
      </span>

      {/* Level icon */}
      <div className={classNames(levelIcon, levelColor, 'text-base flex-shrink-0')} />

      {/* Agent badge */}
      {log.agentName && (
        <div
          className={classNames('flex items-center gap-1 px-1.5 py-0.5 rounded text-xs', agentColor, 'bg-current/10')}
        >
          <div className={classNames(agentIcon, 'text-xs')} />
          <span className="capitalize">{log.agentName}</span>
        </div>
      )}

      {/* Message */}
      <span className="text-bolt-elements-textPrimary flex-1 break-words">{log.message}</span>

      {/* Task ID if present */}
      {log.taskId && <span className="text-xs text-bolt-elements-textTertiary font-mono">#{log.taskId.slice(-6)}</span>}
    </motion.div>
  );
});

LogItem.displayName = 'LogItem';

/**
 * Statistiques des agents
 */
const AgentStats = memo(() => {
  const stats = useStore(agentStatsStore);

  return (
    <div className="grid grid-cols-4 gap-2 px-4 py-3 border-b border-[var(--bolt-glass-border)]">
      {/* Total Agents */}
      <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-bolt-elements-background-depth-3/50">
        <div className="i-ph:robot text-lg text-bolt-elements-textSecondary" />
        <span className="text-lg font-semibold text-bolt-elements-textPrimary">{stats.totalAgents}</span>
        <span className="text-[10px] text-bolt-elements-textTertiary uppercase tracking-wide">Agents</span>
      </div>

      {/* Active */}
      <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-green-500/10">
        <div className="relative">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          {stats.busyAgents > 0 && (
            <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-500 animate-ping opacity-75" />
          )}
        </div>
        <span className="text-lg font-semibold text-green-400">{stats.busyAgents}</span>
        <span className="text-[10px] text-green-400/70 uppercase tracking-wide">Actifs</span>
      </div>

      {/* Completed */}
      <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-bolt-elements-background-depth-3/50">
        <div className="i-ph:check-circle text-lg text-bolt-elements-icon-success" />
        <span className="text-lg font-semibold text-bolt-elements-textPrimary">{stats.completedTasks}</span>
        <span className="text-[10px] text-bolt-elements-textTertiary uppercase tracking-wide">Tâches</span>
      </div>

      {/* Pending or Failed */}
      {stats.failedTasks > 0 ? (
        <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-red-500/10">
          <div className="i-ph:x-circle text-lg text-red-400" />
          <span className="text-lg font-semibold text-red-400">{stats.failedTasks}</span>
          <span className="text-[10px] text-red-400/70 uppercase tracking-wide">Échecs</span>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-bolt-elements-background-depth-3/50">
          <div className="i-ph:clock text-lg text-bolt-elements-textSecondary" />
          <span className="text-lg font-semibold text-bolt-elements-textPrimary">{stats.pendingTasks}</span>
          <span className="text-[10px] text-bolt-elements-textTertiary uppercase tracking-wide">Attente</span>
        </div>
      )}
    </div>
  );
});

AgentStats.displayName = 'AgentStats';

/**
 * Filtres de logs
 */
const LogFilters = memo(
  ({
    selectedLevel,
    selectedAgent,
    onLevelChange,
    onAgentChange,
  }: {
    selectedLevel: LogLevel | 'all';
    selectedAgent: AgentType | 'all';
    onLevelChange: (level: LogLevel | 'all') => void;
    onAgentChange: (agent: AgentType | 'all') => void;
  }) => {
    const levels: Array<LogLevel | 'all'> = ['all', 'debug', 'info', 'warn', 'error'];
    const agents: Array<AgentType | 'all'> = [
      'all',
      'orchestrator',
      'explore',
      'coder',
      'builder',
      'tester',
      'deployer',
      'reviewer',
      'fixer',
    ];

    const selectClassName = classNames(
      'text-xs px-2.5 py-1.5 rounded-lg',
      'bg-bolt-elements-background-depth-3/80 backdrop-blur-sm',
      'border border-bolt-elements-borderColor',
      'text-bolt-elements-textPrimary',
      'hover:border-accent-500/50 focus:border-accent-500 focus:ring-1 focus:ring-accent-500/30',
      'transition-all duration-200',
      'cursor-pointer appearance-none',
      'pr-7 bg-no-repeat bg-right',
    );

    return (
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--bolt-glass-border)]">
        <div className="flex items-center gap-1.5 text-xs text-bolt-elements-textSecondary">
          <div className="i-ph:funnel text-sm" />
          <span>Filtrer</span>
        </div>

        <div className="relative">
          <select
            value={selectedLevel}
            onChange={(e) => onLevelChange(e.target.value as LogLevel | 'all')}
            className={selectClassName}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundSize: '1.25rem',
              backgroundPosition: 'right 0.25rem center',
            }}
          >
            {levels.map((level) => (
              <option key={level} value={level}>
                {level === 'all' ? 'Tous niveaux' : level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div className="relative">
          <select
            value={selectedAgent}
            onChange={(e) => onAgentChange(e.target.value as AgentType | 'all')}
            className={selectClassName}
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
              backgroundSize: '1.25rem',
              backgroundPosition: 'right 0.25rem center',
            }}
          >
            {agents.map((agent) => (
              <option key={agent} value={agent}>
                {agent === 'all' ? 'Tous agents' : agent.charAt(0).toUpperCase() + agent.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  },
);

LogFilters.displayName = 'LogFilters';

/*
 * ============================================================================
 * MAIN COMPONENT
 * ============================================================================
 */

export const AgentActivityLog = memo(({ isOpen, onClose, maxLogs = 100, autoScroll = true }: AgentActivityLogProps) => {
  const logs = useStore(systemLogsStore);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const [selectedLevel, setSelectedLevel] = React.useState<LogLevel | 'all'>('all');
  const [selectedAgent, setSelectedAgent] = React.useState<AgentType | 'all'>('all');

  // Filter logs
  const filteredLogs = React.useMemo(() => {
    let filtered = logs;

    if (selectedLevel !== 'all') {
      filtered = filtered.filter((log) => log.level === selectedLevel);
    }

    if (selectedAgent !== 'all') {
      filtered = filtered.filter((log) => log.agentName === selectedAgent);
    }

    return filtered.slice(-maxLogs);
  }, [logs, selectedLevel, selectedAgent, maxLogs]);

  const clearLogs = useCallback(() => {
    clearSystemLogs();
  }, []);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 300 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 300 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="fixed right-0 top-0 bottom-0 w-96 z-40 flex flex-col bg-[var(--bolt-glass-background-elevated)] backdrop-blur-[var(--bolt-glass-blur-strong)] border-l border-[var(--bolt-glass-border)] shadow-[var(--bolt-glass-shadow)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-[var(--bolt-glass-border)]">
            <div className="flex items-center gap-2.5">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-500/10">
                <div className="i-ph:list-bullets text-lg text-accent-500" />
              </div>
              <h3 className="font-semibold text-bolt-elements-textPrimary">Activité des Agents</h3>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-bolt-elements-background-depth-3 transition-all duration-200 active:scale-95"
              aria-label="Fermer"
            >
              <div className="i-ph:x text-bolt-elements-textSecondary" />
            </button>
          </div>

          {/* Stats */}
          <AgentStats />

          {/* Filters */}
          <LogFilters
            selectedLevel={selectedLevel}
            selectedAgent={selectedAgent}
            onLevelChange={setSelectedLevel}
            onAgentChange={setSelectedAgent}
          />

          {/* Logs list */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto divide-y divide-bolt-elements-borderColor/50">
            {filteredLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-bolt-elements-textTertiary">
                <div className="i-ph:clipboard-text text-4xl mb-2" />
                <p className="text-sm">Aucune activité</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredLogs.map((log, index) => (
                  <LogItem key={`${log.timestamp.getTime()}-${index}`} log={log} />
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[var(--bolt-glass-border)] text-xs">
            <span className="text-bolt-elements-textTertiary">
              {filteredLogs.length} entrée{filteredLogs.length > 1 ? 's' : ''}
            </span>
            <button
              onClick={clearLogs}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 transition-all duration-200 active:scale-95"
            >
              <div className="i-ph:trash text-sm" />
              <span>Effacer</span>
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

AgentActivityLog.displayName = 'AgentActivityLog';
