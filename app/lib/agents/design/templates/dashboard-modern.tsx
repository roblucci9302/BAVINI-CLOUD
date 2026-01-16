'use client';

/**
 * Template: Dashboard Moderne
 *
 * Template complet pour dashboard/admin panel
 * Utilise la palette Midnight et des composants data-driven
 *
 * Dépendances: react, framer-motion, tailwindcss
 */

import { motion } from 'framer-motion';
import { useState } from 'react';

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  user: {
    name: 'Jean Dupont',
    email: 'jean@example.com',
    avatar: 'https://i.pravatar.cc/100?img=8',
    role: 'Admin',
  },
  stats: [
    { label: 'Revenus', value: '€45,231', change: '+20.1%', trend: 'up', icon: '💰' },
    { label: 'Utilisateurs', value: '2,350', change: '+15.3%', trend: 'up', icon: '👥' },
    { label: 'Commandes', value: '1,247', change: '+8.2%', trend: 'up', icon: '📦' },
    { label: 'Taux conversion', value: '3.2%', change: '-2.1%', trend: 'down', icon: '📈' },
  ],
  navigation: [
    { icon: '🏠', label: 'Dashboard', active: true },
    { icon: '📊', label: 'Analytics', active: false },
    { icon: '👥', label: 'Utilisateurs', active: false },
    { icon: '📦', label: 'Produits', active: false },
    { icon: '💳', label: 'Paiements', active: false },
    { icon: '⚙️', label: 'Paramètres', active: false },
  ],
  recentOrders: [
    { id: '#3210', customer: 'Marie Claire', status: 'Livré', amount: '€125.00', date: 'Il y a 2h' },
    { id: '#3209', customer: 'Pierre Martin', status: 'En cours', amount: '€89.00', date: 'Il y a 3h' },
    { id: '#3208', customer: 'Sophie Bernard', status: 'En attente', amount: '€254.00', date: 'Il y a 5h' },
    { id: '#3207', customer: 'Lucas Petit', status: 'Livré', amount: '€175.00', date: 'Hier' },
    { id: '#3206', customer: 'Emma Roux', status: 'Livré', amount: '€312.00', date: 'Hier' },
  ],
};

// ============================================================================
// COMPOSANTS
// ============================================================================

/**
 * Sidebar navigation
 */
function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 border-r border-slate-800 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white">
          Dashboard<span className="text-blue-400">.</span>
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {config.navigation.map((item) => (
          <a
            key={item.label}
            href="#"
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
              item.active ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <span className="text-xl">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
          </a>
        ))}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50">
          <img src={config.user.avatar} alt={config.user.name} className="w-10 h-10 rounded-full" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{config.user.name}</p>
            <p className="text-xs text-slate-400 truncate">{config.user.email}</p>
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * Header avec search et notifications
 */
function Header() {
  return (
    <header className="h-16 bg-slate-900/50 backdrop-blur-xl border-b border-slate-800 flex items-center justify-between px-6">
      {/* Search */}
      <div className="relative w-96">
        <input
          type="text"
          placeholder="Rechercher..."
          className="w-full px-4 py-2 pl-10 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
        />
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button className="relative p-2 text-slate-400 hover:text-white transition-colors">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <img
          src={config.user.avatar}
          alt={config.user.name}
          className="w-8 h-8 rounded-full border-2 border-slate-700"
        />
      </div>
    </header>
  );
}

/**
 * Stat Card avec animation
 */
function StatCard({ stat, index }: { stat: (typeof config.stats)[0]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-slate-700 transition-colors"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-2xl">{stat.icon}</span>
        <span
          className={`text-sm font-medium px-2 py-1 rounded-full ${
            stat.trend === 'up' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
          }`}
        >
          {stat.change}
        </span>
      </div>
      <p className="text-3xl font-bold text-white mb-1">{stat.value}</p>
      <p className="text-sm text-slate-400">{stat.label}</p>
    </motion.div>
  );
}

/**
 * Chart placeholder (simulated)
 */
function ChartCard() {
  const bars = [40, 65, 45, 80, 55, 70, 60, 75, 50, 85, 65, 90];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="bg-slate-900 border border-slate-800 rounded-2xl p-6"
    >
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-white">Revenus mensuels</h3>
        <select className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1 text-sm text-slate-300">
          <option>Cette année</option>
          <option>Année dernière</option>
        </select>
      </div>

      {/* Simulated bar chart */}
      <div className="flex items-end gap-2 h-48">
        {bars.map((height, i) => (
          <motion.div
            key={i}
            initial={{ height: 0 }}
            animate={{ height: `${height}%` }}
            transition={{ delay: 0.5 + i * 0.05 }}
            className="flex-1 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-md hover:from-blue-500 hover:to-blue-300 transition-colors cursor-pointer"
          />
        ))}
      </div>

      <div className="flex justify-between mt-4 text-xs text-slate-500">
        {['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'].map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
    </motion.div>
  );
}

/**
 * Recent Orders Table
 */
function RecentOrders() {
  const statusColors: Record<string, string> = {
    Livré: 'bg-emerald-500/20 text-emerald-400',
    'En cours': 'bg-blue-500/20 text-blue-400',
    'En attente': 'bg-amber-500/20 text-amber-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="bg-slate-900 border border-slate-800 rounded-2xl"
    >
      <div className="p-6 border-b border-slate-800">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Commandes récentes</h3>
          <a href="#" className="text-sm text-blue-400 hover:text-blue-300">
            Voir tout →
          </a>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-800">
              <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Commande
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Client
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Statut
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Montant
              </th>
              <th className="px-6 py-4 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {config.recentOrders.map((order) => (
              <tr key={order.id} className="hover:bg-slate-800/50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{order.id}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{order.customer}</td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[order.status]}`}>
                    {order.status}
                  </span>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-white font-medium">{order.amount}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-400">{order.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

/**
 * Activity Feed
 */
function ActivityFeed() {
  const activities = [
    { icon: '🎉', text: 'Nouvelle vente de €125.00', time: 'Il y a 2 min' },
    { icon: '👤', text: 'Nouvel utilisateur inscrit', time: 'Il y a 15 min' },
    { icon: '📦', text: 'Commande #3210 expédiée', time: 'Il y a 1h' },
    { icon: '⭐', text: 'Nouveau commentaire 5 étoiles', time: 'Il y a 2h' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="bg-slate-900 border border-slate-800 rounded-2xl p-6"
    >
      <h3 className="text-lg font-semibold text-white mb-6">Activité récente</h3>

      <div className="space-y-4">
        {activities.map((activity, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="text-xl">{activity.icon}</span>
            <div className="flex-1">
              <p className="text-sm text-slate-300">{activity.text}</p>
              <p className="text-xs text-slate-500">{activity.time}</p>
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function DashboardModern() {
  return (
    <div className="min-h-screen bg-slate-950">
      <Sidebar />

      <div className="ml-64">
        <Header />

        <main className="p-6">
          {/* Page Title */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white">Bonjour, {config.user.name.split(' ')[0]} 👋</h1>
            <p className="text-slate-400">Voici un aperçu de vos performances aujourd'hui.</p>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            {config.stats.map((stat, i) => (
              <StatCard key={stat.label} stat={stat} index={i} />
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            <div className="lg:col-span-2">
              <ChartCard />
            </div>
            <ActivityFeed />
          </div>

          {/* Recent Orders */}
          <RecentOrders />
        </main>
      </div>
    </div>
  );
}
