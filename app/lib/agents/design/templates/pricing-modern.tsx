'use client';

/**
 * Template: Pricing Page Moderne
 *
 * Template complet pour page de tarification SaaS
 * Utilise la palette Aurora (Violet/Pink/Cyan)
 *
 * Dépendances: react, framer-motion, tailwindcss
 */

import { motion } from 'framer-motion';
import { useState } from 'react';

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  brand: {
    name: 'CloudPro',
    tagline: 'Tarifs simples et transparents',
  },
  header: {
    title: 'Choisissez le plan parfait',
    subtitle: 'Commencez gratuitement, évoluez quand vous êtes prêt. Pas de frais cachés.',
  },
  plans: [
    {
      name: 'Gratuit',
      description: 'Parfait pour découvrir',
      price: { monthly: 0, yearly: 0 },
      features: [
        { text: '3 projets', included: true },
        { text: '1 Go de stockage', included: true },
        { text: 'Support communauté', included: true },
        { text: 'Analytics basiques', included: true },
        { text: 'API Access', included: false },
        { text: 'Support prioritaire', included: false },
        { text: 'SSO', included: false },
      ],
      cta: 'Commencer gratuitement',
      highlighted: false,
    },
    {
      name: 'Pro',
      description: 'Pour les équipes en croissance',
      price: { monthly: 29, yearly: 24 },
      features: [
        { text: 'Projets illimités', included: true },
        { text: '100 Go de stockage', included: true },
        { text: 'Support email prioritaire', included: true },
        { text: 'Analytics avancés', included: true },
        { text: 'API Access complet', included: true },
        { text: 'Intégrations premium', included: true },
        { text: 'SSO', included: false },
      ],
      cta: "Démarrer l'essai gratuit",
      highlighted: true,
      badge: 'Populaire',
    },
    {
      name: 'Enterprise',
      description: 'Pour les grandes organisations',
      price: { monthly: 99, yearly: 79 },
      features: [
        { text: 'Tout de Pro', included: true },
        { text: 'Stockage illimité', included: true },
        { text: 'Support dédié 24/7', included: true },
        { text: 'Analytics personnalisés', included: true },
        { text: 'API illimité + Webhooks', included: true },
        { text: 'Toutes les intégrations', included: true },
        { text: 'SSO + SAML', included: true },
      ],
      cta: 'Contacter les ventes',
      highlighted: false,
    },
  ],
  comparison: {
    categories: [
      {
        name: 'Fonctionnalités principales',
        features: [
          { name: 'Projets', free: '3', pro: 'Illimité', enterprise: 'Illimité' },
          { name: 'Stockage', free: '1 Go', pro: '100 Go', enterprise: 'Illimité' },
          { name: "Membres d'équipe", free: '1', pro: '10', enterprise: 'Illimité' },
          { name: 'Historique', free: '7 jours', pro: '90 jours', enterprise: 'Illimité' },
        ],
      },
      {
        name: 'Collaboration',
        features: [
          { name: 'Partage de projets', free: true, pro: true, enterprise: true },
          { name: 'Commentaires', free: true, pro: true, enterprise: true },
          { name: 'Permissions avancées', free: false, pro: true, enterprise: true },
          { name: 'Audit logs', free: false, pro: false, enterprise: true },
        ],
      },
      {
        name: 'Support',
        features: [
          { name: 'Documentation', free: true, pro: true, enterprise: true },
          { name: 'Support email', free: false, pro: true, enterprise: true },
          { name: 'Chat en direct', free: false, pro: true, enterprise: true },
          { name: 'Account manager', free: false, pro: false, enterprise: true },
        ],
      },
    ],
  },
  faqs: [
    {
      question: 'Puis-je changer de plan à tout moment ?',
      answer:
        'Oui, vous pouvez passer à un plan supérieur ou inférieur à tout moment. Les changements prennent effet immédiatement et le prorata est calculé automatiquement.',
    },
    {
      question: 'Y a-t-il un engagement de durée ?',
      answer:
        'Non, tous nos plans sont sans engagement. Vous pouvez annuler à tout moment. Pour les plans annuels, un remboursement prorata est disponible.',
    },
    {
      question: 'Quels moyens de paiement acceptez-vous ?',
      answer:
        'Nous acceptons toutes les cartes de crédit principales (Visa, Mastercard, Amex), PayPal, et le virement bancaire pour les plans Enterprise.',
    },
    {
      question: "L'essai gratuit nécessite-t-il une carte de crédit ?",
      answer: "Non, l'essai de 14 jours est entièrement gratuit et ne nécessite aucune information de paiement.",
    },
    {
      question: 'Proposez-vous des réductions pour les startups ?',
      answer:
        'Oui ! Notre programme Startup offre 50% de réduction pendant la première année. Contactez-nous pour en savoir plus.',
    },
  ],
  testimonials: [
    {
      quote: 'CloudPro a transformé notre workflow. Le plan Pro offre tout ce dont nous avons besoin.',
      author: 'Marie Dupont',
      role: 'CTO, TechStartup',
      avatar: 'https://i.pravatar.cc/100?img=1',
    },
    {
      quote: 'Le rapport qualité-prix est imbattable. Support excellent et fonctionnalités top.',
      author: 'Jean Martin',
      role: 'Fondateur, AgenceXYZ',
      avatar: 'https://i.pravatar.cc/100?img=3',
    },
  ],
};

// ============================================================================
// COMPOSANTS
// ============================================================================

/**
 * Header avec toggle billing
 */
function Header() {
  return (
    <header className="py-6 px-6">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <a href="/" className="text-xl font-bold text-white">
          {config.brand.name}
          <span className="text-violet-400">.</span>
        </a>
        <nav className="hidden md:flex items-center gap-8">
          {['Produit', 'Tarifs', 'Docs', 'Blog'].map((link) => (
            <a key={link} href="#" className="text-sm text-slate-300 hover:text-white transition-colors">
              {link}
            </a>
          ))}
        </nav>
        <button className="px-4 py-2 bg-white text-slate-900 text-sm font-medium rounded-lg hover:bg-slate-100 transition-colors">
          Connexion
        </button>
      </div>
    </header>
  );
}

/**
 * Pricing Hero
 */
function PricingHero({ isYearly, setIsYearly }: { isYearly: boolean; setIsYearly: (v: boolean) => void }) {
  return (
    <section className="pt-16 pb-12 text-center">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto px-6">
        <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">{config.header.title}</h1>
        <p className="text-xl text-slate-400 mb-10">{config.header.subtitle}</p>

        {/* Billing Toggle */}
        <div className="inline-flex items-center gap-4 p-1 bg-slate-800 rounded-full">
          <button
            onClick={() => setIsYearly(false)}
            className={`px-6 py-2 text-sm font-medium rounded-full transition-all ${
              !isYearly ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
            }`}
          >
            Mensuel
          </button>
          <button
            onClick={() => setIsYearly(true)}
            className={`px-6 py-2 text-sm font-medium rounded-full transition-all ${
              isYearly ? 'bg-white text-slate-900' : 'text-slate-400 hover:text-white'
            }`}
          >
            Annuel
            <span className="ml-2 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 text-xs rounded-full">-20%</span>
          </button>
        </div>
      </motion.div>
    </section>
  );
}

/**
 * Pricing Card
 */
function PricingCard({ plan, isYearly, index }: { plan: (typeof config.plans)[0]; isYearly: boolean; index: number }) {
  const price = isYearly ? plan.price.yearly : plan.price.monthly;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className={`relative rounded-3xl p-8 ${
        plan.highlighted
          ? 'bg-gradient-to-b from-violet-600 to-violet-700 shadow-2xl shadow-violet-500/25 scale-105'
          : 'bg-slate-800 border border-slate-700'
      }`}
    >
      {/* Badge */}
      {plan.badge && (
        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
          <span className="px-4 py-1 bg-gradient-to-r from-amber-400 to-orange-400 text-slate-900 text-sm font-semibold rounded-full">
            {plan.badge}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="text-center mb-8">
        <h3 className="text-xl font-semibold text-white mb-2">{plan.name}</h3>
        <p className={plan.highlighted ? 'text-violet-200' : 'text-slate-400'}>{plan.description}</p>
      </div>

      {/* Price */}
      <div className="text-center mb-8">
        <div className="flex items-end justify-center gap-1">
          <span className="text-5xl font-bold text-white">{price}€</span>
          <span className={`text-lg ${plan.highlighted ? 'text-violet-200' : 'text-slate-400'}`}>/mois</span>
        </div>
        {isYearly && plan.price.monthly > 0 && (
          <p className="text-sm text-emerald-400 mt-2">
            Économisez {(plan.price.monthly - plan.price.yearly) * 12}€/an
          </p>
        )}
      </div>

      {/* Features */}
      <ul className="space-y-4 mb-8">
        {plan.features.map((feature) => (
          <li key={feature.text} className="flex items-center gap-3">
            {feature.included ? (
              <svg
                className={`w-5 h-5 ${plan.highlighted ? 'text-violet-200' : 'text-violet-400'}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <span
              className={`text-sm ${
                feature.included ? (plan.highlighted ? 'text-white' : 'text-slate-300') : 'text-slate-500'
              }`}
            >
              {feature.text}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        className={`w-full py-4 rounded-xl font-semibold transition-all ${
          plan.highlighted
            ? 'bg-white text-violet-600 hover:bg-slate-100'
            : 'bg-violet-600 text-white hover:bg-violet-500'
        }`}
      >
        {plan.cta}
      </button>
    </motion.div>
  );
}

/**
 * Pricing Cards Grid
 */
function PricingCards({ isYearly }: { isYearly: boolean }) {
  return (
    <section className="max-w-6xl mx-auto px-6 pb-20">
      <div className="grid md:grid-cols-3 gap-8 items-start">
        {config.plans.map((plan, index) => (
          <PricingCard key={plan.name} plan={plan} isYearly={isYearly} index={index} />
        ))}
      </div>
    </section>
  );
}

/**
 * Feature Comparison Table
 */
function ComparisonTable() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl font-bold text-white mb-4">Comparez les plans</h2>
        <p className="text-slate-400">Trouvez le plan qui correspond à vos besoins</p>
      </motion.div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-700">
              <th className="text-left py-4 px-4 text-slate-400 font-medium">Fonctionnalités</th>
              <th className="text-center py-4 px-4 text-white font-semibold">Gratuit</th>
              <th className="text-center py-4 px-4 text-violet-400 font-semibold">Pro</th>
              <th className="text-center py-4 px-4 text-white font-semibold">Enterprise</th>
            </tr>
          </thead>
          <tbody>
            {config.comparison.categories.map((category) => (
              <>
                <tr key={category.name}>
                  <td colSpan={4} className="pt-8 pb-4 px-4 text-sm font-semibold text-white bg-slate-800/50">
                    {category.name}
                  </td>
                </tr>
                {category.features.map((feature) => (
                  <tr key={feature.name} className="border-b border-slate-800">
                    <td className="py-4 px-4 text-sm text-slate-300">{feature.name}</td>
                    <td className="py-4 px-4 text-center">
                      {typeof feature.free === 'boolean' ? (
                        feature.free ? (
                          <svg className="w-5 h-5 text-emerald-400 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )
                      ) : (
                        <span className="text-sm text-slate-300">{feature.free}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center bg-violet-500/5">
                      {typeof feature.pro === 'boolean' ? (
                        feature.pro ? (
                          <svg className="w-5 h-5 text-emerald-400 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )
                      ) : (
                        <span className="text-sm text-violet-300 font-medium">{feature.pro}</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-center">
                      {typeof feature.enterprise === 'boolean' ? (
                        feature.enterprise ? (
                          <svg className="w-5 h-5 text-emerald-400 mx-auto" fill="currentColor" viewBox="0 0 20 20">
                            <path
                              fillRule="evenodd"
                              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )
                      ) : (
                        <span className="text-sm text-slate-300">{feature.enterprise}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Testimonials
 */
function Testimonials() {
  return (
    <section className="py-20 bg-slate-800/50">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl font-bold text-white mb-4">Ils nous font confiance</h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {config.testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.author}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="p-8 bg-slate-800 rounded-2xl border border-slate-700"
            >
              <p className="text-lg text-slate-300 mb-6">"{testimonial.quote}"</p>
              <div className="flex items-center gap-4">
                <img src={testimonial.avatar} alt={testimonial.author} className="w-12 h-12 rounded-full" />
                <div>
                  <p className="font-semibold text-white">{testimonial.author}</p>
                  <p className="text-sm text-slate-400">{testimonial.role}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * FAQ Section
 */
function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section className="max-w-3xl mx-auto px-6 py-20">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="text-center mb-12"
      >
        <h2 className="text-3xl font-bold text-white mb-4">Questions fréquentes</h2>
        <p className="text-slate-400">Tout ce que vous devez savoir sur nos tarifs</p>
      </motion.div>

      <div className="space-y-4">
        {config.faqs.map((faq, index) => (
          <motion.div
            key={faq.question}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.05 }}
            className="border border-slate-700 rounded-xl overflow-hidden"
          >
            <button
              onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-slate-800/50 transition-colors"
            >
              <span className="font-medium text-white">{faq.question}</span>
              <svg
                className={`w-5 h-5 text-slate-400 transition-transform ${openIndex === index ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {openIndex === index && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="px-6 pb-4"
              >
                <p className="text-slate-400">{faq.answer}</p>
              </motion.div>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/**
 * CTA Section
 */
function CTASection() {
  return (
    <section className="py-20">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="p-12 bg-gradient-to-br from-violet-600 to-pink-600 rounded-3xl"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Prêt à commencer ?</h2>
          <p className="text-violet-100 mb-8 max-w-xl mx-auto">
            Rejoignez plus de 10,000 équipes qui utilisent CloudPro pour construire l'avenir.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-4 bg-white text-violet-600 font-semibold rounded-xl hover:bg-slate-100 transition-colors">
              Démarrer gratuitement
            </button>
            <button className="px-8 py-4 bg-white/10 text-white font-semibold rounded-xl border border-white/20 hover:bg-white/20 transition-colors">
              Parler aux ventes
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * Footer
 */
function Footer() {
  return (
    <footer className="border-t border-slate-800 py-12">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-sm text-slate-500">© 2025 {config.brand.name}. Tous droits réservés.</p>
          <div className="flex items-center gap-6">
            {['Confidentialité', 'CGU', 'Cookies'].map((link) => (
              <a key={link} href="#" className="text-sm text-slate-500 hover:text-slate-300 transition-colors">
                {link}
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function PricingModern() {
  const [isYearly, setIsYearly] = useState(false);

  return (
    <div className="min-h-screen bg-slate-950">
      <Header />
      <PricingHero isYearly={isYearly} setIsYearly={setIsYearly} />
      <PricingCards isYearly={isYearly} />
      <ComparisonTable />
      <Testimonials />
      <FAQ />
      <CTASection />
      <Footer />
    </div>
  );
}
