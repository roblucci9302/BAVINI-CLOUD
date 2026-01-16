'use client';

import { memo, useState, useCallback, useRef, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'framer-motion';
import { connectorsStore, initiateOAuth, type ConnectorId } from '~/lib/stores/connectors';
import { classNames } from '~/utils/classNames';

interface ConnectorQuickLink {
  id: ConnectorId;
  name: string;
  icon: JSX.Element;
}

const QUICK_CONNECTORS: ConnectorQuickLink[] = [
  {
    id: 'github',
    name: 'GitHub',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M12 0C5.37 0 0 5.37 0 12C0 17.31 3.435 21.795 8.205 23.385C8.805 23.49 9.03 23.13 9.03 22.815C9.03 22.53 9.015 21.585 9.015 20.58C6 21.135 5.22 19.845 4.98 19.17C4.845 18.825 4.26 17.76 3.75 17.475C3.33 17.25 2.73 16.695 3.735 16.68C4.68 16.665 5.355 17.55 5.58 17.91C6.66 19.725 8.385 19.215 9.075 18.9C9.18 18.12 9.495 17.595 9.84 17.295C7.17 16.995 4.38 15.96 4.38 11.37C4.38 10.065 4.845 8.985 5.61 8.145C5.49 7.845 5.07 6.615 5.73 4.965C5.73 4.965 6.735 4.65 9.03 6.195C9.99 5.925 11.01 5.79 12.03 5.79C13.05 5.79 14.07 5.925 15.03 6.195C17.325 4.635 18.33 4.965 18.33 4.965C18.99 6.615 18.57 7.845 18.45 8.145C19.215 8.985 19.68 10.05 19.68 11.37C19.68 15.975 16.875 16.995 14.205 17.295C14.64 17.67 15.015 18.39 15.015 19.515C15.015 21.12 15 22.41 15 22.815C15 23.13 15.225 23.505 15.825 23.385C18.2072 22.5807 20.2772 21.0497 21.7437 19.0074C23.2101 16.965 23.9993 14.5143 24 12C24 5.37 18.63 0 12 0Z"
          fill="currentColor"
        />
      </svg>
    ),
  },
  {
    id: 'supabase',
    name: 'Supabase',
    icon: (
      <svg viewBox="0 0 109 113" fill="none" className="w-full h-full">
        <path
          d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z"
          fill="url(#supabase_gradient1)"
        />
        <path
          d="M63.7076 110.284C60.8481 113.885 55.0502 111.912 54.9813 107.314L53.9738 40.0627L99.1935 40.0627C107.384 40.0627 111.952 49.5228 106.859 55.9374L63.7076 110.284Z"
          fill="url(#supabase_gradient2)"
          fillOpacity="0.2"
        />
        <path
          d="M45.317 2.07103C48.1765 -1.53037 53.9745 0.442937 54.0434 5.041L54.4849 72.2922H9.83113C1.64038 72.2922 -2.92775 62.8321 2.1655 56.4175L45.317 2.07103Z"
          fill="#3ECF8E"
        />
        <defs>
          <linearGradient
            id="supabase_gradient1"
            x1="53.9738"
            y1="54.974"
            x2="94.1635"
            y2="71.8295"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#249361" />
            <stop offset="1" stopColor="#3ECF8E" />
          </linearGradient>
          <linearGradient
            id="supabase_gradient2"
            x1="36.1558"
            y1="30.578"
            x2="54.4844"
            y2="65.0806"
            gradientUnits="userSpaceOnUse"
          >
            <stop />
            <stop offset="1" stopOpacity="0" />
          </linearGradient>
        </defs>
      </svg>
    ),
  },
  {
    id: 'netlify',
    name: 'Netlify',
    icon: (
      <svg viewBox="0 0 256 256" fill="none" className="w-full h-full">
        <path
          d="M177.381 169.733L179.202 168.991L180.478 168.47L182.377 167.729L185.986 166.339V166.206L161.023 141.108H160.889L143.237 158.625L177.381 169.733Z"
          fill="#00C7B7"
        />
        <path
          d="M149.689 102.262L180.478 133.051L185.852 127.811V127.677L152.575 94.5343L149.689 102.262Z"
          fill="#00C7B7"
        />
        <path
          d="M108.515 154.968H108.382L91.0008 172.35L128.001 202.776L128.135 202.642L108.515 154.968Z"
          fill="#00C7B7"
        />
        <path
          d="M153.308 138.635L128.135 113.462L91.0008 80.3196L90.8674 80.453V80.5864L117.672 149.05L153.308 138.635Z"
          fill="#00C7B7"
        />
        <path d="M69.0008 97.0689V159.221L90.8674 80.453L69.1341 97.0689H69.0008Z" fill="#00C7B7" />
        <path d="M69.0008 159.221L128.001 202.642L91.1341 172.35L69.0008 159.221Z" fill="#00C7B7" />
        <path
          d="M185.986 127.677L186.12 127.811V166.206L186.253 166.073L220.13 132.196L185.986 127.677Z"
          fill="#00C7B7"
        />
        <path
          d="M128.001 53.2239L69.0008 97.0689L90.8674 80.453L128.135 113.462L149.689 102.262L152.575 94.5343L128.135 53.0905L128.001 53.2239Z"
          fill="#00C7B7"
        />
        <path
          d="M186.12 166.206V127.811L180.478 133.051L180.344 133.185L177.381 169.733L186.253 166.073L186.12 166.206Z"
          fill="#00C7B7"
        />
      </svg>
    ),
  },
  {
    id: 'figma',
    name: 'Figma',
    icon: (
      <svg viewBox="0 0 38 57" fill="none" className="w-full h-full">
        <path
          d="M19 28.5C19 25.9804 20.0009 23.5641 21.7825 21.7825C23.5641 20.0009 25.9804 19 28.5 19C31.0196 19 33.4359 20.0009 35.2175 21.7825C36.9991 23.5641 38 25.9804 38 28.5C38 31.0196 36.9991 33.4359 35.2175 35.2175C33.4359 36.9991 31.0196 38 28.5 38C25.9804 38 23.5641 36.9991 21.7825 35.2175C20.0009 33.4359 19 31.0196 19 28.5Z"
          fill="#1ABCFE"
        />
        <path
          d="M0 47.5C0 44.9804 1.00089 42.5641 2.78249 40.7825C4.56408 39.0009 6.98044 38 9.5 38H19V47.5C19 50.0196 17.9991 52.4359 16.2175 54.2175C14.4359 55.9991 12.0196 57 9.5 57C6.98044 57 4.56408 55.9991 2.78249 54.2175C1.00089 52.4359 0 50.0196 0 47.5Z"
          fill="#0ACF83"
        />
        <path
          d="M19 0V19H28.5C31.0196 19 33.4359 17.9991 35.2175 16.2175C36.9991 14.4359 38 12.0196 38 9.5C38 6.98044 36.9991 4.56408 35.2175 2.78249C33.4359 1.00089 31.0196 0 28.5 0H19Z"
          fill="#FF7262"
        />
        <path
          d="M0 9.5C0 12.0196 1.00089 14.4359 2.78249 16.2175C4.56408 17.9991 6.98044 19 9.5 19H19V0H9.5C6.98044 0 4.56408 1.00089 2.78249 2.78249C1.00089 4.56408 0 6.98044 0 9.5Z"
          fill="#F24E1E"
        />
        <path
          d="M0 28.5C0 31.0196 1.00089 33.4359 2.78249 35.2175C4.56408 36.9991 6.98044 38 9.5 38H19V19H9.5C6.98044 19 4.56408 20.0009 2.78249 21.7825C1.00089 23.5641 0 25.9804 0 28.5Z"
          fill="#A259FF"
        />
      </svg>
    ),
  },
];

interface PopoverProps {
  connector: ConnectorQuickLink;
  isConnected: boolean;
  onConnect: () => void;
  onClose: () => void;
}

const ConnectorPopover = memo(({ connector, isConnected, onConnect, onClose }: PopoverProps) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  // Keep ref updated without triggering effect re-run
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        onCloseRef.current();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <motion.div
      ref={popoverRef}
      initial={{ opacity: 0, y: -8, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.95 }}
      transition={{ duration: 0.15 }}
      className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50"
    >
      <div className="bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor rounded-lg shadow-lg p-3 min-w-[180px]">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6">{connector.icon}</div>
          <span className="font-medium text-bolt-elements-textPrimary">{connector.name}</span>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <div
            className={classNames(
              'w-2 h-2 rounded-full',
              isConnected ? 'bg-green-500' : 'bg-bolt-elements-textTertiary',
            )}
          />
          <span className="text-xs text-bolt-elements-textSecondary">{isConnected ? 'Connecté' : 'Non connecté'}</span>
        </div>

        {!isConnected && (
          <button
            onClick={onConnect}
            className="w-full px-3 py-1.5 text-sm font-medium text-white bg-accent-500 hover:bg-accent-600 rounded-md transition-colors"
          >
            Connecter
          </button>
        )}

        {isConnected && (
          <a
            href={`/settings/connectors`}
            className="block w-full px-3 py-1.5 text-sm text-center text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary border border-bolt-elements-borderColor rounded-md transition-colors"
          >
            Gérer
          </a>
        )}
      </div>
    </motion.div>
  );
});

export const ConnectorQuickLinks = memo(() => {
  const connectors = useStore(connectorsStore);
  const [activePopover, setActivePopover] = useState<ConnectorId | null>(null);

  const handleConnect = useCallback((id: ConnectorId) => {
    initiateOAuth(id);
    setActivePopover(null);
  }, []);

  const handleTogglePopover = useCallback((id: ConnectorId) => {
    setActivePopover((current) => (current === id ? null : id));
  }, []);

  const handleClosePopover = useCallback(() => {
    setActivePopover(null);
  }, []);

  return (
    <div className="flex items-center gap-1 ml-3 pl-3 border-l border-bolt-elements-borderColor">
      {QUICK_CONNECTORS.map((connector) => {
        const isConnected = connectors[connector.id]?.isConnected ?? false;

        return (
          <div key={connector.id} className="relative">
            <button
              onClick={() => handleTogglePopover(connector.id)}
              className={classNames(
                'relative w-7 h-7 p-1.5 rounded-md transition-all duration-200',
                '!bg-transparent !border-none',
                'hover:!bg-[var(--bolt-bg-hover,#1a1a1e)]',
                'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                {
                  '!bg-[var(--bolt-bg-hover,#1a1a1e)]': activePopover === connector.id,
                },
              )}
              title={`${connector.name}${isConnected ? ' (Connecté)' : ''}`}
            >
              <span className={classNames('w-full h-full block', isConnected ? 'opacity-100' : 'opacity-70 hover:opacity-100')}>
                {connector.icon}
              </span>
              {isConnected && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-bolt-elements-background-depth-2" />
              )}
            </button>

            <AnimatePresence>
              {activePopover === connector.id && (
                <ConnectorPopover
                  connector={connector}
                  isConnected={isConnected}
                  onConnect={() => handleConnect(connector.id)}
                  onClose={handleClosePopover}
                />
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
});
