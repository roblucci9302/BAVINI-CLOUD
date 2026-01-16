'use client';

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { CONNECTORS, connectorsStore } from '~/lib/stores/connectors';
import { ConnectorCard } from './ConnectorCard';
import { cubicEasingFn } from '~/utils/easings';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.15,
      ease: cubicEasingFn,
    },
  },
};

export const ConnectorsPanel = memo(() => {
  const connectors = useStore(connectorsStore);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Connecteurs</h2>

      <motion.div className="space-y-2" variants={containerVariants} initial="hidden" animate="visible">
        {CONNECTORS.map((connector) => (
          <motion.div key={connector.id} variants={itemVariants}>
            <ConnectorCard connector={connector} isConnected={connectors[connector.id]?.isConnected} />
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
});
