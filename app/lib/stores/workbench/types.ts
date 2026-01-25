/**
 * =============================================================================
 * BAVINI CLOUD - Workbench Store Types
 * =============================================================================
 * Type definitions for the workbench store.
 *
 * @module lib/stores/workbench/types
 * =============================================================================
 */

import type { MapStore } from 'nanostores';

/**
 * Type for the browser action runner instance.
 */
export type ActionRunnerType = {
  actions: MapStore<Record<string, { status: string; abort: () => void }>>;
  addAction: (data: unknown) => void;
  runAction: (data: unknown) => void;
  setBuildTrigger?: (trigger: () => void) => void;
};

/**
 * State of an artifact in the workbench.
 */
export interface ArtifactState {
  id: string;
  title: string;
  closed: boolean;
  runner: ActionRunnerType;
}

/**
 * Partial artifact state for updates.
 */
export type ArtifactUpdateState = Pick<ArtifactState, 'title' | 'closed'>;

/**
 * Map store type for artifacts.
 */
export type Artifacts = MapStore<Record<string, ArtifactState>>;

/**
 * View types available in the workbench.
 */
export type WorkbenchViewType = 'code' | 'preview';
