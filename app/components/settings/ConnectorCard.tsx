'use client';

import { memo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'react-toastify';
import {
  type ConnectorConfig,
  connectConnector,
  disconnectConnector,
  isOAuthConnector,
  initiateOAuth,
  disconnectOAuthConnector,
} from '~/lib/stores/connectors';
import { validateConnector, hasValidator } from '~/lib/connectors';
import { cn } from '~/lib/utils';
import { cubicEasingFn } from '~/utils/easings';
import { ConnectorIcon } from './ConnectorIcon';
// BAVINI UI Components
import { Button } from '~/components/ui/Button';
import { Input } from '~/components/ui/Input';
import { Label } from '~/components/ui/Label';
import { Spinner } from '~/components/ui/Spinner';

const transition = { duration: 0.2, ease: cubicEasingFn };

interface ConnectorCardProps {
  connector: ConnectorConfig;
  isConnected?: boolean;
}

export const ConnectorCard = memo(({ connector, isConnected = false }: ConnectorCardProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isOAuthLoading, setIsOAuthLoading] = useState(false);

  const isOAuth = isOAuthConnector(connector.id);

  const handleToggle = () => {
    if (isConnected) {
      if (isOAuth) {
        disconnectOAuthConnector(connector.id);
      } else {
        disconnectConnector(connector.id);
      }

      toast.info(`${connector.name} déconnecté`);
    } else if (isOAuth) {
      handleOAuthConnect();
    } else {
      setValidationError(null);
      setIsExpanded(!isExpanded);
    }
  };

  const handleOAuthConnect = () => {
    setIsOAuthLoading(true);
    toast.info(`Redirection vers ${connector.name}...`);
    initiateOAuth(connector.id);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setValidationError(null);

    const missingFields = connector.fields
      .filter((field) => field.required && !formData[field.key])
      .map((field) => field.label);

    if (missingFields.length > 0) {
      setValidationError(`Champs requis: ${missingFields.join(', ')}`);
      setIsSubmitting(false);

      return;
    }

    const result = await validateConnector(connector.id, formData);

    if (!result.success) {
      setValidationError(result.error || 'Échec de la connexion');
      setIsSubmitting(false);

      return;
    }

    connectConnector(connector.id, formData);
    setIsExpanded(false);
    setIsSubmitting(false);

    const hasApiValidation = hasValidator(connector.id);
    toast.success(hasApiValidation ? `${connector.name} connecté` : `${connector.name} configuré`);
  };

  const handleInputChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden transition-colors',
        isConnected
          ? 'border-green-500/30 bg-green-500/5'
          : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-3',
      )}
    >
      <div
        className="flex items-center gap-3 p-3 cursor-pointer hover:bg-bolt-elements-background-depth-2 transition-colors"
        onClick={handleToggle}
      >
        <ConnectorIcon icon={connector.icon} className="w-6 h-6" />

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <h3 className="text-sm font-medium text-bolt-elements-textPrimary">{connector.name}</h3>
          {isConnected && <span className="w-1.5 h-1.5 rounded-full bg-green-400" />}
        </div>

        <button
          className={cn(
            'px-2.5 py-1 text-xs rounded-md transition-colors flex items-center gap-1.5',
            isConnected
              ? 'text-bolt-elements-textTertiary hover:text-red-400'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
          )}
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          disabled={isOAuthLoading}
        >
          {isOAuthLoading ? (
            <Spinner size="sm" />
          ) : isConnected ? (
            <span className="i-ph:sign-out text-sm" />
          ) : (
            <span className="i-ph:sign-in text-sm" />
          )}
        </button>
      </div>

      <AnimatePresence>
        {!isOAuth && isExpanded && !isConnected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={transition}
          >
            <form onSubmit={handleSubmit} className="p-3 pt-0 space-y-3">
              <div className="border-t border-bolt-elements-borderColor pt-3 space-y-2">
                {connector.fields.map((field) => {
                  const inputId = `connector-${connector.id}-${field.key}`;
                  return (
                    <div key={field.key} className="space-y-1">
                      <Label htmlFor={inputId} className="text-xs">
                        {field.label}
                        {field.required && <span className="text-red-400 ml-0.5">*</span>}
                      </Label>
                      <Input
                        id={inputId}
                        type={field.type === 'password' ? 'password' : 'text'}
                        value={formData[field.key] || ''}
                        onChange={(e) => handleInputChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                        className="h-8 text-sm"
                        required={field.required}
                      />
                    </div>
                  );
                })}
              </div>

              <AnimatePresence>
                {validationError && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-md"
                    role="alert"
                    aria-live="assertive"
                  >
                    <span className="i-ph:warning-circle text-red-400 text-sm" aria-hidden="true" />
                    <span className="text-xs text-red-400">{validationError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex gap-2 justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsExpanded(false)}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isSubmitting}
                  isLoading={isSubmitting}
                >
                  Connecter
                </Button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});
