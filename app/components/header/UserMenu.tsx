/**
 * Menu utilisateur dans le header
 * Affiche les infos utilisateur, compteur de requêtes et bouton déconnexion
 */

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from '@remix-run/react';
import { useStore } from '@nanostores/react';
import {
  userProfileStore,
  remainingRequestsStore,
  dailyRequestLimitStore,
  signOut,
} from '~/lib/stores/auth';
import { isSupabaseConfigured } from '~/lib/supabase/client';

export const UserMenu = memo(function UserMenu() {
  const navigate = useNavigate();
  const profile = useStore(userProfileStore);
  const remainingRequests = useStore(remainingRequestsStore);
  const dailyLimit = useStore(dailyRequestLimitStore);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    navigate('/');
  }, [navigate]);

  // Don't render if Supabase not configured
  if (!isSupabaseConfigured()) {
    return null;
  }

  // Don't render if no user
  if (!profile) {
    return null;
  }

  const initials = profile.name
    ? profile.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : profile.email[0].toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-700/50 transition-colors"
      >
        {/* Requests counter */}
        <div className="flex items-center gap-1 text-xs">
          <span className={remainingRequests > 5 ? 'text-green-400' : remainingRequests > 0 ? 'text-yellow-400' : 'text-red-400'}>
            {remainingRequests}/{dailyLimit}
          </span>
          <span className="text-gray-500">req</span>
        </div>

        {/* Avatar */}
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt={profile.name || profile.email}
            className="w-8 h-8 rounded-full"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-sm font-medium">
            {initials}
          </div>
        )}

        {/* Dropdown arrow */}
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-gray-800 rounded-lg shadow-xl border border-gray-700 py-2 z-50">
          {/* User info */}
          <div className="px-4 py-3 border-b border-gray-700">
            <p className="text-white font-medium truncate">
              {profile.name || 'Utilisateur'}
            </p>
            <p className="text-gray-400 text-sm truncate">
              {profile.email}
            </p>
          </div>

          {/* Usage stats */}
          <div className="px-4 py-3 border-b border-gray-700">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-400 text-sm">Requêtes aujourd'hui</span>
              <span className="text-white text-sm font-medium">
                {dailyLimit - remainingRequests}/{dailyLimit}
              </span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all ${
                  remainingRequests > 5
                    ? 'bg-green-500'
                    : remainingRequests > 0
                      ? 'bg-yellow-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${((dailyLimit - remainingRequests) / dailyLimit) * 100}%` }}
              />
            </div>
            {remainingRequests === 0 && (
              <p className="text-red-400 text-xs mt-2">
                Limite atteinte. Réessayez demain.
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="px-2 py-2">
            <button
              onClick={handleSignOut}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-gray-300 hover:bg-gray-700 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Se déconnecter
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
