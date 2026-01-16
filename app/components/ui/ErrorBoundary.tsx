'use client';

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { IconButton } from './IconButton';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ErrorBoundary');

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component to catch and handle React errors gracefully.
 * Prevents the entire app from crashing when a component throws an error.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    logger.error('Caught error:', error);
    logger.error('Error info:', errorInfo);

    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full p-8 bg-bolt-elements-background-depth-1">
          <div className="max-w-md text-center">
            <div className="i-ph:warning-circle text-6xl text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-bolt-elements-textPrimary mb-2">Une erreur est survenue</h2>
            <p className="text-bolt-elements-textSecondary mb-4">
              Quelque chose s'est mal passé. Vous pouvez réessayer ou recharger la page.
            </p>
            {this.state.error && (
              <details className="mb-4 text-left">
                <summary className="cursor-pointer text-sm text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary">
                  Détails de l'erreur
                </summary>
                <pre className="mt-2 p-3 bg-bolt-elements-background-depth-2 rounded-lg text-xs text-red-400 overflow-auto max-h-32">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-bolt-elements-button-secondary-background text-bolt-elements-button-secondary-text rounded-lg hover:bg-bolt-elements-button-secondary-backgroundHover transition-colors"
              >
                Réessayer
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 bg-bolt-elements-button-primary-background text-bolt-elements-button-primary-text rounded-lg hover:bg-bolt-elements-button-primary-backgroundHover transition-colors"
              >
                Recharger la page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Minimal error fallback for smaller components.
 */
export function MinimalErrorFallback({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500">
      <div className="i-ph:warning text-lg" />
      <span className="text-sm">Erreur de chargement</span>
      {onRetry && <IconButton icon="i-ph:arrow-clockwise" title="Réessayer" onClick={onRetry} className="ml-auto" />}
    </div>
  );
}
