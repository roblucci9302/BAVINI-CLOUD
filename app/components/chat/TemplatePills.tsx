'use client';

import { useState } from 'react';
import { getMainTemplates, getAdditionalTemplates, hasTemplateFiles, type ProjectTemplate } from '~/lib/templates';
import { useTemplateLoader } from '~/lib/hooks';
import { classNames } from '~/utils/classNames';
import styles from './TemplatePills.module.scss';

interface TemplatePillsProps {
  onSelectTemplate: (prompt: string) => void;
}

/** Template ID to CSS variant class mapping */
const TEMPLATE_VARIANT_MAP: Record<string, string> = {
  'react-vite-ts': styles.react,
  'node-ts': styles.node,
  'next-ts': styles.next,
  'astro-ts': styles.astro,
  'express-ts': styles.express,
  'supabase-fullstack': styles.supabase,
};

/**
 * Map template ID to CSS variant class.
 * @param templateId - The template identifier
 * @returns CSS class name for the variant styling
 */
function getVariantClass(templateId: string): string {
  return TEMPLATE_VARIANT_MAP[templateId] || styles.react;
}

/**
 * Composant de sélection rapide de templates
 * Affiche des "pills" cliquables pour démarrer avec un template
 */
export function TemplatePills({ onSelectTemplate }: TemplatePillsProps) {
  const [showMore, setShowMore] = useState(false);
  const { loadTemplate, isLoading, error } = useTemplateLoader();

  const mainTemplates = getMainTemplates();
  const additionalTemplates = getAdditionalTemplates();

  const handleTemplateClick = async (template: ProjectTemplate) => {
    // Si le template a des fichiers pré-construits, les charger d'abord
    if (hasTemplateFiles(template)) {
      const loaded = await loadTemplate(template);

      if (loaded) {
        // Envoyer un message de bienvenue simple
        onSelectTemplate(`J'ai chargé le template ${template.name}. Comment puis-je vous aider à le personnaliser ?`);
        return;
      }
    }

    // Sinon, envoyer le prompt pour générer le code
    onSelectTemplate(template.prompt);
  };

  return (
    <div className="w-full max-w-2xl mx-auto mb-6">
      <p className="text-center text-sm text-white/70 dark:text-bolt-elements-textSecondary mb-3">Démarrer avec :</p>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="i-svg-spinners:90-ring-with-bg text-white dark:text-bolt-elements-loader-progress" />
          <span className="text-sm text-white/70 dark:text-bolt-elements-textSecondary">Chargement du template...</span>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center gap-2 mb-3 text-red-500">
          <div className="i-ph:warning-circle" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <div
        className={classNames('flex flex-wrap justify-center gap-3', { 'opacity-50 pointer-events-none': isLoading })}
      >
        {mainTemplates.map((template) => (
          <AnimatedTemplatePill
            key={template.id}
            template={template}
            onClick={() => handleTemplateClick(template)}
            disabled={isLoading}
          />
        ))}

        {!showMore && additionalTemplates.length > 0 && (
          <button
            onClick={() => setShowMore(true)}
            disabled={isLoading}
            className={classNames(
              'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200',
              'bg-white/85 dark:bg-bolt-elements-background-depth-2 hover:bg-white dark:hover:bg-bolt-elements-background-depth-3',
              'border border-white/40 dark:border-bolt-elements-borderColor hover:border-white/60 dark:hover:border-bolt-elements-borderColorHover',
              'text-gray-700 dark:text-bolt-elements-textSecondary hover:text-gray-900 dark:hover:text-bolt-elements-textPrimary',
              'shadow-lg dark:shadow-none',
            )}
          >
            + Plus
          </button>
        )}

        {showMore &&
          additionalTemplates.map((template) => (
            <AnimatedTemplatePill
              key={template.id}
              template={template}
              onClick={() => handleTemplateClick(template)}
              disabled={isLoading}
            />
          ))}

        {showMore && (
          <button
            onClick={() => setShowMore(false)}
            disabled={isLoading}
            className={classNames(
              'px-4 py-2 rounded-full text-sm font-medium transition-all duration-200',
              'bg-white/85 dark:bg-bolt-elements-background-depth-2 hover:bg-white dark:hover:bg-bolt-elements-background-depth-3',
              'border border-white/40 dark:border-bolt-elements-borderColor hover:border-white/60 dark:hover:border-bolt-elements-borderColorHover',
              'text-gray-500 dark:text-bolt-elements-textTertiary hover:text-gray-700 dark:hover:text-bolt-elements-textSecondary',
              'shadow-lg dark:shadow-none',
            )}
          >
            Moins
          </button>
        )}
      </div>
    </div>
  );
}

interface AnimatedTemplatePillProps {
  template: ProjectTemplate;
  onClick: () => void;
  disabled?: boolean;
}

/**
 * Animated template pill with Uiverse-style effects
 */
function AnimatedTemplatePill({ template, onClick, disabled }: AnimatedTemplatePillProps) {
  const variantClass = getVariantClass(template.id);

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={classNames(styles.templatePill, variantClass, { [styles.disabled]: disabled })}
      title={template.description}
    >
      <div className={styles.wrapper}>
        {/* Animated circles */}
        <div className={classNames(styles.circle, styles.circle1)} />
        <div className={classNames(styles.circle, styles.circle2)} />
        <div className={classNames(styles.circle, styles.circle3)} />
        <div className={classNames(styles.circle, styles.circle4)} />
        <div className={classNames(styles.circle, styles.circle5)} />
        <div className={classNames(styles.circle, styles.circle6)} />
        <div className={classNames(styles.circle, styles.circle7)} />
        <div className={classNames(styles.circle, styles.circle8)} />
        <div className={classNames(styles.circle, styles.circle9)} />
        <div className={classNames(styles.circle, styles.circle10)} />
        <div className={classNames(styles.circle, styles.circle11)} />
        <div className={classNames(styles.circle, styles.circle12)} />

        {/* Content */}
        <span className={styles.icon}>{template.icon}</span>
        <span className={styles.label}>{template.name}</span>
      </div>
    </button>
  );
}
