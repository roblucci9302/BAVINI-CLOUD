import { describe, it, expect, beforeEach } from 'vitest';
import { chatStore, pendingBatchStore, approvalModalOpenStore } from './chat';

describe('chatStore', () => {
  beforeEach(() => {
    // reset store to initial state
    chatStore.set({
      started: false,
      aborted: false,
      showChat: true,
      mode: 'agent',
      controlMode: 'strict',
      awaitingAgentApproval: false,
    });

    // Also reset the separate stores
    pendingBatchStore.set(null);
    approvalModalOpenStore.set(false);
  });

  describe('initial state', () => {
    it('should have started as false by default', () => {
      expect(chatStore.get().started).toBe(false);
    });

    it('should have aborted as false by default', () => {
      expect(chatStore.get().aborted).toBe(false);
    });

    it('should have showChat as true by default', () => {
      expect(chatStore.get().showChat).toBe(true);
    });

    it('should have controlMode as strict by default', () => {
      expect(chatStore.get().controlMode).toBe('strict');
    });
  });

  describe('setKey', () => {
    it('should update started state', () => {
      chatStore.setKey('started', true);

      expect(chatStore.get().started).toBe(true);
    });

    it('should update aborted state', () => {
      chatStore.setKey('aborted', true);

      expect(chatStore.get().aborted).toBe(true);
    });

    it('should update showChat state', () => {
      chatStore.setKey('showChat', false);

      expect(chatStore.get().showChat).toBe(false);
    });

    it('should preserve other keys when updating one key', () => {
      chatStore.setKey('started', true);

      expect(chatStore.get()).toEqual({
        started: true,
        aborted: false,
        showChat: true,
        mode: 'agent',
        controlMode: 'strict',
        awaitingAgentApproval: false,
      });
    });
  });

  describe('set', () => {
    it('should replace entire state', () => {
      chatStore.set({
        started: true,
        aborted: true,
        showChat: false,
        mode: 'agent',
        controlMode: 'moderate',
        awaitingAgentApproval: true,
      });

      expect(chatStore.get()).toEqual({
        started: true,
        aborted: true,
        showChat: false,
        mode: 'agent',
        controlMode: 'moderate',
        awaitingAgentApproval: true,
      });
    });
  });

  describe('subscribe', () => {
    it('should notify subscribers on state change', () => {
      const updates: boolean[] = [];

      const unsubscribe = chatStore.subscribe((state) => {
        updates.push(state.started);
      });

      chatStore.setKey('started', true);
      chatStore.setKey('started', false);

      unsubscribe();

      // first call is immediate with current value, then two updates
      expect(updates).toEqual([false, true, false]);
    });

    it('should stop notifying after unsubscribe', () => {
      const updates: boolean[] = [];

      const unsubscribe = chatStore.subscribe((state) => {
        updates.push(state.started);
      });

      chatStore.setKey('started', true);
      unsubscribe();
      chatStore.setKey('started', false);

      expect(updates).toEqual([false, true]);
    });
  });
});
