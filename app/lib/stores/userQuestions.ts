/**
 * Store pour gérer les questions posées à l'utilisateur par les agents
 *
 * Permet aux agents d'utiliser l'outil ask_user_question et d'afficher
 * les questions dans l'UI pour que l'utilisateur puisse répondre.
 *
 * @module stores/userQuestions
 */

import { atom, computed } from 'nanostores';
import type { UserQuestion, UserAnswer } from '~/lib/agents/tools/interaction-tools';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Question en attente de réponse
 */
export interface PendingQuestion {
  /** ID unique de la demande */
  id: string;

  /** Questions à poser */
  questions: UserQuestion[];

  /** Timestamp de création */
  createdAt: Date;

  /** Callback pour résoudre la promesse */
  resolve: (answers: UserAnswer[]) => void;

  /** Callback pour rejeter la promesse */
  reject: (error: Error) => void;
}

/**
 * État du store
 */
export interface UserQuestionsState {
  /** Question courante en attente */
  pending: PendingQuestion | null;

  /** Historique des questions/réponses */
  history: Array<{
    questions: UserQuestion[];
    answers: UserAnswer[];
    timestamp: Date;
  }>;
}

/*
 * ============================================================================
 * STORES
 * ============================================================================
 */

/**
 * Store principal
 */
export const userQuestionsStore = atom<UserQuestionsState>({
  pending: null,
  history: [],
});

/**
 * Store pour l'état d'ouverture du modal
 */
export const questionModalOpenStore = atom<boolean>(false);

/*
 * ============================================================================
 * COMPUTED
 * ============================================================================
 */

/**
 * Questions en attente
 */
export const pendingQuestions = computed(userQuestionsStore, (state) => state.pending?.questions ?? null);

/**
 * Y a-t-il une question en attente ?
 */
export const hasPendingQuestion = computed(userQuestionsStore, (state) => state.pending !== null);

/*
 * ============================================================================
 * ACTIONS
 * ============================================================================
 */

let questionIdCounter = 0;

/**
 * Poser des questions à l'utilisateur
 * Retourne une promesse qui sera résolue avec les réponses
 */
export function askUserQuestions(questions: UserQuestion[]): Promise<UserAnswer[]> {
  return new Promise((resolve, reject) => {
    const id = `question-${++questionIdCounter}-${Date.now()}`;

    const pending: PendingQuestion = {
      id,
      questions,
      createdAt: new Date(),
      resolve,
      reject,
    };

    userQuestionsStore.set({
      ...userQuestionsStore.get(),
      pending,
    });

    // Ouvrir le modal automatiquement
    questionModalOpenStore.set(true);
  });
}

/**
 * Soumettre les réponses de l'utilisateur
 */
export function submitAnswers(answers: UserAnswer[]): void {
  const state = userQuestionsStore.get();

  if (!state.pending) {
    console.warn('No pending question to answer');
    return;
  }

  // Résoudre la promesse
  state.pending.resolve(answers);

  // Ajouter à l'historique et nettoyer
  userQuestionsStore.set({
    pending: null,
    history: [
      ...state.history,
      {
        questions: state.pending.questions,
        answers,
        timestamp: new Date(),
      },
    ],
  });

  // Fermer le modal
  questionModalOpenStore.set(false);
}

/**
 * Annuler la question en cours
 */
export function cancelQuestion(): void {
  const state = userQuestionsStore.get();

  if (!state.pending) {
    return;
  }

  // Rejeter la promesse
  state.pending.reject(new Error('User cancelled'));

  // Nettoyer
  userQuestionsStore.set({
    ...state,
    pending: null,
  });

  // Fermer le modal
  questionModalOpenStore.set(false);
}

/**
 * Fermer le modal sans annuler (garde la question en attente)
 */
export function closeQuestionModal(): void {
  questionModalOpenStore.set(false);
}

/**
 * Ouvrir le modal (si question en attente)
 */
export function openQuestionModal(): void {
  const state = userQuestionsStore.get();

  if (state.pending) {
    questionModalOpenStore.set(true);
  }
}

/**
 * Réinitialiser le store
 */
export function resetUserQuestions(): void {
  const state = userQuestionsStore.get();

  if (state.pending) {
    state.pending.reject(new Error('Store reset'));
  }

  userQuestionsStore.set({
    pending: null,
    history: [],
  });
  questionModalOpenStore.set(false);
}

/**
 * Créer le callback pour l'outil ask_user_question
 */
export function createAskUserCallback(): (questions: UserQuestion[]) => Promise<UserAnswer[]> {
  return askUserQuestions;
}
