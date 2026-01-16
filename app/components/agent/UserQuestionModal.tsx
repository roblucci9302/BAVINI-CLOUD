'use client';

/**
 * Modal pour afficher les questions des agents à l'utilisateur
 *
 * Supporte:
 * - Questions multiples (1-4)
 * - Sélection simple ou multiple (multiSelect)
 * - Header/label pour chaque question
 * - Réponse personnalisée "Autre"
 */

import { memo, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import type { UserQuestion, UserAnswer, QuestionOption } from '~/lib/agents/tools/interaction-tools';
import { userQuestionsStore, questionModalOpenStore, submitAnswers, cancelQuestion } from '~/lib/stores/userQuestions';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

interface QuestionCardProps {
  question: UserQuestion;
  index: number;
  selected: string[];
  customAnswer: string;
  onSelectOption: (label: string) => void;
  onCustomAnswerChange: (value: string) => void;
}

/*
 * ============================================================================
 * HELPER COMPONENTS
 * ============================================================================
 */

/**
 * Option de réponse (radio ou checkbox)
 */
const OptionItem = memo(
  ({
    option,
    isSelected,
    isMulti,
    onSelect,
  }: {
    option: QuestionOption;
    isSelected: boolean;
    isMulti: boolean;
    onSelect: () => void;
  }) => {
    return (
      <button
        onClick={onSelect}
        className={classNames(
          'w-full text-left p-3 rounded-lg border transition-all',
          isSelected
            ? 'border-accent-500 bg-accent-500/10'
            : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:border-accent-400/50',
        )}
      >
        <div className="flex items-start gap-3">
          {/* Checkbox/Radio indicator */}
          <div
            className={classNames(
              'mt-0.5 w-5 h-5 flex-shrink-0 flex items-center justify-center border-2 transition-colors',
              isMulti ? 'rounded' : 'rounded-full',
              isSelected ? 'bg-accent-500 border-accent-500' : 'border-bolt-elements-borderColor',
            )}
          >
            {isSelected && (
              <div className={classNames(isMulti ? 'i-ph:check' : 'i-ph:circle-fill', 'text-white text-xs')} />
            )}
          </div>

          {/* Label and description */}
          <div className="flex-1 min-w-0">
            <span
              className={classNames(
                'text-sm font-medium',
                isSelected ? 'text-accent-400' : 'text-bolt-elements-textPrimary',
              )}
            >
              {option.label}
            </span>
            {option.description && (
              <p className="text-xs text-bolt-elements-textSecondary mt-0.5">{option.description}</p>
            )}
          </div>
        </div>
      </button>
    );
  },
);

OptionItem.displayName = 'OptionItem';

/**
 * Carte de question individuelle
 */
const QuestionCard = memo(
  ({ question, index, selected, customAnswer, onSelectOption, onCustomAnswerChange }: QuestionCardProps) => {
    const [showCustomInput, setShowCustomInput] = useState(false);

    const handleSelectOption = (label: string) => {
      if (label === '__custom__') {
        setShowCustomInput(true);
        onSelectOption('__custom__');
      } else {
        onSelectOption(label);
      }
    };

    const isCustomSelected = selected.includes('__custom__');

    return (
      <div className="space-y-3">
        {/* Header chip */}
        {question.header && (
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-accent-500/20 text-accent-400 border border-accent-500/30">
              {question.header.slice(0, 12)}
            </span>
            {question.multiSelect && (
              <span className="text-xs text-bolt-elements-textTertiary">(Plusieurs choix possibles)</span>
            )}
          </div>
        )}

        {/* Question text */}
        <p className="text-sm text-bolt-elements-textPrimary font-medium">{question.question}</p>

        {/* Options */}
        <div className="space-y-2">
          {question.options.map((option) => (
            <OptionItem
              key={option.label}
              option={option}
              isSelected={selected.includes(option.label)}
              isMulti={question.multiSelect ?? false}
              onSelect={() => handleSelectOption(option.label)}
            />
          ))}

          {/* Option "Autre" */}
          {question.allowCustom !== false && (
            <OptionItem
              option={{ label: 'Autre', description: 'Fournir une réponse personnalisée' }}
              isSelected={isCustomSelected}
              isMulti={question.multiSelect ?? false}
              onSelect={() => handleSelectOption('__custom__')}
            />
          )}
        </div>

        {/* Custom input */}
        <AnimatePresence>
          {(showCustomInput || isCustomSelected) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <textarea
                value={customAnswer}
                onChange={(e) => onCustomAnswerChange(e.target.value)}
                placeholder="Votre réponse..."
                className="w-full p-3 text-sm rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor focus:border-accent-500 focus:outline-none resize-none"
                rows={3}
                autoFocus
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  },
);

QuestionCard.displayName = 'QuestionCard';

/*
 * ============================================================================
 * MAIN COMPONENT
 * ============================================================================
 */

export const UserQuestionModal = memo(() => {
  const state = useStore(userQuestionsStore);
  const isOpen = useStore(questionModalOpenStore);

  // State for answers
  const [answers, setAnswers] = useState<Map<number, { selected: string[]; customAnswer: string }>>(new Map());

  // Reset answers when questions change
  useEffect(() => {
    if (state.pending?.questions) {
      const initialAnswers = new Map<number, { selected: string[]; customAnswer: string }>();
      state.pending.questions.forEach((_, index) => {
        initialAnswers.set(index, { selected: [], customAnswer: '' });
      });
      setAnswers(initialAnswers);
    }
  }, [state.pending?.id]);

  const handleSelectOption = useCallback(
    (questionIndex: number, label: string) => {
      setAnswers((prev) => {
        const next = new Map(prev);
        const current = next.get(questionIndex) || { selected: [], customAnswer: '' };
        const question = state.pending?.questions[questionIndex];

        if (!question) {
          return prev;
        }

        let newSelected: string[];

        if (question.multiSelect) {
          // Multi-select: toggle
          if (current.selected.includes(label)) {
            newSelected = current.selected.filter((l) => l !== label);
          } else {
            newSelected = [...current.selected, label];
          }
        } else {
          // Single select: replace
          newSelected = [label];
        }

        next.set(questionIndex, { ...current, selected: newSelected });

        return next;
      });
    },
    [state.pending?.questions],
  );

  const handleCustomAnswerChange = useCallback((questionIndex: number, value: string) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      const current = next.get(questionIndex) || { selected: [], customAnswer: '' };
      next.set(questionIndex, { ...current, customAnswer: value });

      return next;
    });
  }, []);

  const handleSubmit = useCallback(() => {
    if (!state.pending?.questions) {
      return;
    }

    const userAnswers: UserAnswer[] = state.pending.questions.map((question, index) => {
      const answer = answers.get(index) || { selected: [], customAnswer: '' };

      // Filter out __custom__ marker and use actual selection
      const selected = answer.selected.filter((s) => s !== '__custom__');

      return {
        question: question.question,
        selected: selected.length > 0 ? selected : answer.customAnswer ? ['Autre'] : [],
        customAnswer: answer.customAnswer || undefined,
        answeredAt: new Date(),
      };
    });

    submitAnswers(userAnswers);
  }, [state.pending?.questions, answers]);

  const handleCancel = useCallback(() => {
    cancelQuestion();
  }, []);

  // Check if can submit (at least one answer per question)
  const canSubmit =
    state.pending?.questions.every((_, index) => {
      const answer = answers.get(index);
      return answer && (answer.selected.length > 0 || answer.customAnswer.trim() !== '');
    }) ?? false;

  if (!isOpen || !state.pending) {
    return null;
  }

  const { questions } = state.pending;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={handleCancel}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          className="w-full max-w-lg max-h-[85vh] bg-bolt-elements-background-depth-1 rounded-xl shadow-2xl border border-bolt-elements-borderColor overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
            <div className="p-2 rounded-lg bg-accent-500/20">
              <div className="i-ph:question text-accent-400 text-lg" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">
                {questions.length === 1 ? 'Question' : `${questions.length} Questions`}
              </h2>
              <p className="text-sm text-bolt-elements-textSecondary">L'agent a besoin de votre avis</p>
            </div>
            <button
              onClick={handleCancel}
              className="p-2 rounded-lg hover:bg-bolt-elements-background-depth-3 transition-colors"
            >
              <div className="i-ph:x text-bolt-elements-textSecondary" />
            </button>
          </div>

          {/* Questions */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {questions.map((question, index) => {
              const answer = answers.get(index) || { selected: [], customAnswer: '' };
              return (
                <QuestionCard
                  key={index}
                  question={question}
                  index={index}
                  selected={answer.selected}
                  customAnswer={answer.customAnswer}
                  onSelectOption={(label) => handleSelectOption(index, label)}
                  onCustomAnswerChange={(value) => handleCustomAnswerChange(index, value)}
                />
              );
            })}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 px-5 py-4 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg border border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:bg-bolt-elements-background-depth-3 transition-colors"
            >
              Annuler
            </button>

            <span className="flex-1" />

            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={classNames(
                'px-4 py-2 rounded-lg transition-colors flex items-center gap-2',
                canSubmit
                  ? 'bg-accent-500 text-white hover:bg-accent-600'
                  : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary cursor-not-allowed',
              )}
            >
              <div className="i-ph:paper-plane-right" />
              Envoyer
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

UserQuestionModal.displayName = 'UserQuestionModal';

export default UserQuestionModal;
