'use client';

/**
 * Template: Agency Moderne
 *
 * Template complet pour agence/services
 * Utilise la palette Rose (Rose moderne et élégant)
 *
 * Dépendances: react, framer-motion, tailwindcss
 */

import { motion, useScroll, useTransform } from 'framer-motion';
import { useState, useRef } from 'react';

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  brand: {
    name: 'Studio Créatif',
    tagline: 'Design · Développement · Stratégie',
  },
  stats: [
    { value: '150+', label: 'Projets livrés' },
    { value: '50+', label: 'Clients fidèles' },
    { value: '12', label: 'Experts créatifs' },
    { value: '8', label: "Années d'expérience" },
  ],
  services: [
    {
      icon: '🎨',
      title: 'Design UI/UX',
      description: 'Interfaces élégantes et expériences utilisateur mémorables qui convertissent.',
      features: ['Wireframes', 'Prototypes', 'Design Systems', 'User Research'],
    },
    {
      icon: '💻',
      title: 'Développement Web',
      description: 'Sites et applications performants avec les technologies les plus modernes.',
      features: ['React / Next.js', 'Node.js', 'E-commerce', 'CMS'],
    },
    {
      icon: '📱',
      title: 'Applications Mobile',
      description: 'Apps natives et cross-platform qui offrent une expérience exceptionnelle.',
      features: ['iOS', 'Android', 'React Native', 'Flutter'],
    },
    {
      icon: '🚀',
      title: 'Stratégie Digitale',
      description: 'Accompagnement stratégique pour maximiser votre présence en ligne.',
      features: ['Branding', 'SEO/SEA', 'Growth', 'Analytics'],
    },
  ],
  projects: [
    {
      title: 'Nova Bank',
      category: 'Fintech',
      image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=800&h=600&fit=crop',
      color: '#ec4899',
    },
    {
      title: 'Eco Market',
      category: 'E-commerce',
      image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=800&h=600&fit=crop',
      color: '#22c55e',
    },
    {
      title: 'Zen App',
      category: 'Mobile App',
      image: 'https://images.unsplash.com/photo-1512941937669-90a1b58e7e9c?w=800&h=600&fit=crop',
      color: '#6366f1',
    },
    {
      title: 'Urban Café',
      category: 'Branding',
      image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800&h=600&fit=crop',
      color: '#f59e0b',
    },
  ],
  team: [
    {
      name: 'Marie Laurent',
      role: 'Directrice Créative',
      avatar: 'https://i.pravatar.cc/200?img=5',
      social: { twitter: '#', linkedin: '#' },
    },
    {
      name: 'Thomas Martin',
      role: 'Lead Developer',
      avatar: 'https://i.pravatar.cc/200?img=12',
      social: { twitter: '#', linkedin: '#' },
    },
    {
      name: 'Sophie Bernard',
      role: 'UX Designer',
      avatar: 'https://i.pravatar.cc/200?img=9',
      social: { twitter: '#', linkedin: '#' },
    },
    {
      name: 'Lucas Petit',
      role: 'Motion Designer',
      avatar: 'https://i.pravatar.cc/200?img=8',
      social: { twitter: '#', linkedin: '#' },
    },
  ],
  testimonials: [
    {
      quote:
        "Studio Créatif a parfaitement compris notre vision et l'a transformée en une expérience digitale exceptionnelle.",
      author: 'Claire Dubois',
      role: 'CEO, Nova Bank',
      avatar: 'https://i.pravatar.cc/100?img=1',
    },
    {
      quote: 'Professionnalisme, créativité et réactivité. Nous recommandons sans hésitation.',
      author: 'Pierre Moreau',
      role: 'Fondateur, Eco Market',
      avatar: 'https://i.pravatar.cc/100?img=3',
    },
  ],
  clients: ['Google', 'Spotify', 'Airbnb', 'Stripe', 'Notion', 'Figma'],
  process: [
    { step: '01', title: 'Découverte', description: 'Compréhension de vos besoins et objectifs' },
    { step: '02', title: 'Stratégie', description: 'Définition de la roadmap et des solutions' },
    { step: '03', title: 'Création', description: 'Design et développement itératifs' },
    { step: '04', title: 'Lancement', description: 'Mise en production et accompagnement' },
  ],
};

// ============================================================================
// COMPOSANTS
// ============================================================================

/**
 * Navigation
 */
function Navigation() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <motion.nav
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed top-0 left-0 right-0 z-50 px-6 py-4"
    >
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between px-6 py-4 bg-white/80 backdrop-blur-xl rounded-2xl shadow-lg shadow-black/5">
          <a href="/" className="text-xl font-bold text-gray-900">
            {config.brand.name.split(' ')[0]}
            <span className="text-pink-500">.</span>
          </a>

          <div className="hidden md:flex items-center gap-8">
            {['Services', 'Projets', 'Équipe', 'Contact'].map((link) => (
              <a
                key={link}
                href={`#${link.toLowerCase()}`}
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                {link}
              </a>
            ))}
          </div>

          <button className="hidden md:block px-5 py-2.5 bg-pink-500 text-white text-sm font-medium rounded-full hover:bg-pink-600 transition-colors">
            Démarrer un projet
          </button>

          <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </motion.nav>
  );
}

/**
 * Hero Section
 */
function HeroSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], ['0%', '30%']);

  return (
    <section
      ref={ref}
      className="relative min-h-screen flex items-center justify-center overflow-hidden bg-gradient-to-br from-pink-50 via-white to-rose-50"
    >
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-20 left-20 w-72 h-72 bg-pink-200 rounded-full blur-3xl" />
        <div className="absolute bottom-20 right-20 w-96 h-96 bg-rose-200 rounded-full blur-3xl" />
      </div>

      <motion.div style={{ y }} className="relative z-10 max-w-6xl mx-auto px-6 pt-32 pb-20 text-center">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-pink-100 text-pink-600 text-sm font-medium rounded-full mb-8">
            <span className="w-2 h-2 bg-pink-500 rounded-full animate-pulse" />
            Disponible pour nouveaux projets
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-5xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight"
        >
          Nous créons des
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-pink-500 via-rose-500 to-pink-600">
            expériences digitales
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto"
        >
          {config.brand.tagline}. Une équipe passionnée qui transforme vos idées en produits digitaux exceptionnels.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <a
            href="#contact"
            className="px-8 py-4 bg-gray-900 text-white font-semibold rounded-full hover:bg-gray-800 transition-colors"
          >
            Discutons de votre projet
          </a>
          <a
            href="#projets"
            className="px-8 py-4 bg-white text-gray-900 font-semibold rounded-full border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            Voir nos réalisations
          </a>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-8 mt-20 pt-12 border-t border-gray-200"
        >
          {config.stats.map((stat) => (
            <div key={stat.label}>
              <div className="text-4xl font-bold text-gray-900 mb-1">{stat.value}</div>
              <div className="text-sm text-gray-500">{stat.label}</div>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

/**
 * Services Section
 */
function ServicesSection() {
  return (
    <section id="services" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-pink-500 text-sm font-medium">Nos services</span>
          <h2 className="text-4xl font-bold text-gray-900 mt-2 mb-4">Ce que nous faisons de mieux</h2>
          <p className="text-gray-500 max-w-2xl mx-auto">
            Une expertise complète pour donner vie à vos projets digitaux les plus ambitieux.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {config.services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group p-8 bg-gray-50 rounded-3xl hover:bg-gradient-to-br hover:from-pink-50 hover:to-rose-50 transition-all duration-300"
            >
              <span className="text-4xl mb-6 block">{service.icon}</span>
              <h3 className="text-xl font-bold text-gray-900 mb-3">{service.title}</h3>
              <p className="text-gray-500 mb-6">{service.description}</p>
              <div className="flex flex-wrap gap-2">
                {service.features.map((feature) => (
                  <span key={feature} className="px-3 py-1 bg-white text-gray-600 text-sm rounded-full">
                    {feature}
                  </span>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Projects Section
 */
function ProjectsSection() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <section id="projets" className="py-24 bg-gray-50">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="flex items-end justify-between mb-12"
        >
          <div>
            <span className="text-pink-500 text-sm font-medium">Portfolio</span>
            <h2 className="text-4xl font-bold text-gray-900 mt-2">Projets récents</h2>
          </div>
          <a href="#" className="hidden md:flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors">
            Tous les projets
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {config.projects.map((project, index) => (
            <motion.article
              key={project.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="group relative rounded-3xl overflow-hidden cursor-pointer"
            >
              <div className="aspect-[4/3]">
                <motion.img
                  src={project.image}
                  alt={project.title}
                  className="w-full h-full object-cover"
                  animate={{ scale: hoveredIndex === index ? 1.05 : 1 }}
                  transition={{ duration: 0.6 }}
                />
              </div>

              {/* Overlay */}
              <div
                className="absolute inset-0 opacity-80 transition-opacity"
                style={{
                  background: `linear-gradient(to top, ${project.color}, transparent)`,
                }}
              />

              {/* Content */}
              <div className="absolute inset-0 flex flex-col justify-end p-8">
                <span className="text-white/80 text-sm mb-2">{project.category}</span>
                <h3 className="text-2xl font-bold text-white">{project.title}</h3>
              </div>

              {/* Arrow */}
              <motion.div
                className="absolute top-6 right-6 w-12 h-12 bg-white rounded-full flex items-center justify-center"
                initial={{ scale: 0, opacity: 0 }}
                animate={{
                  scale: hoveredIndex === index ? 1 : 0,
                  opacity: hoveredIndex === index ? 1 : 0,
                }}
                transition={{ duration: 0.3 }}
              >
                <svg className="w-5 h-5 text-gray-900 -rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </motion.div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Process Section
 */
function ProcessSection() {
  return (
    <section className="py-24 bg-gray-900">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-pink-400 text-sm font-medium">Notre approche</span>
          <h2 className="text-4xl font-bold text-white mt-2">Un processus éprouvé</h2>
        </motion.div>

        <div className="grid md:grid-cols-4 gap-8">
          {config.process.map((item, index) => (
            <motion.div
              key={item.step}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-5xl font-bold text-pink-500/20 mb-4">{item.step}</div>
              <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
              <p className="text-gray-400 text-sm">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Team Section
 */
function TeamSection() {
  return (
    <section id="équipe" className="py-24 bg-white">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-pink-500 text-sm font-medium">L'équipe</span>
          <h2 className="text-4xl font-bold text-gray-900 mt-2 mb-4">Les talents derrière vos projets</h2>
        </motion.div>

        <div className="grid md:grid-cols-4 gap-8">
          {config.team.map((member, index) => (
            <motion.div
              key={member.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group text-center"
            >
              <div className="relative mb-6 overflow-hidden rounded-2xl">
                <img
                  src={member.avatar}
                  alt={member.name}
                  className="w-full aspect-square object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-pink-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <h3 className="font-semibold text-gray-900">{member.name}</h3>
              <p className="text-sm text-gray-500">{member.role}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Testimonials Section
 */
function TestimonialsSection() {
  return (
    <section className="py-24 bg-pink-50">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="text-pink-500 text-sm font-medium">Témoignages</span>
          <h2 className="text-4xl font-bold text-gray-900 mt-2">Ce que disent nos clients</h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {config.testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.author}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="p-8 bg-white rounded-3xl shadow-sm"
            >
              <p className="text-gray-600 mb-6 leading-relaxed">"{testimonial.quote}"</p>
              <div className="flex items-center gap-4">
                <img src={testimonial.avatar} alt={testimonial.author} className="w-12 h-12 rounded-full" />
                <div>
                  <p className="font-semibold text-gray-900">{testimonial.author}</p>
                  <p className="text-sm text-gray-500">{testimonial.role}</p>
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
 * Contact Section
 */
function ContactSection() {
  return (
    <section id="contact" className="py-24 bg-white">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <span className="text-pink-500 text-sm font-medium">Contact</span>
          <h2 className="text-4xl font-bold text-gray-900 mt-2 mb-4">Parlons de votre projet</h2>
          <p className="text-gray-500">Remplissez le formulaire et nous vous recontacterons sous 24h.</p>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="space-y-6"
        >
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nom</label>
              <input
                type="text"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-pink-500 transition-colors"
                placeholder="Votre nom"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
              <input
                type="email"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-pink-500 transition-colors"
                placeholder="vous@exemple.com"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Type de projet</label>
            <select className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-pink-500 transition-colors">
              <option>Site web</option>
              <option>Application mobile</option>
              <option>E-commerce</option>
              <option>Branding</option>
              <option>Autre</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
            <textarea
              rows={5}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:border-pink-500 transition-colors resize-none"
              placeholder="Décrivez votre projet..."
            />
          </div>

          <button
            type="submit"
            className="w-full py-4 bg-pink-500 text-white font-semibold rounded-xl hover:bg-pink-600 transition-colors"
          >
            Envoyer le message
          </button>
        </motion.form>
      </div>
    </section>
  );
}

/**
 * Footer
 */
function Footer() {
  return (
    <footer className="py-12 bg-gray-900">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <a href="/" className="text-xl font-bold text-white">
              {config.brand.name.split(' ')[0]}
              <span className="text-pink-500">.</span>
            </a>
            <p className="text-gray-400 text-sm mt-1">{config.brand.tagline}</p>
          </div>

          <div className="flex items-center gap-6">
            {['Twitter', 'LinkedIn', 'Instagram', 'Dribbble'].map((social) => (
              <a key={social} href="#" className="text-gray-400 hover:text-white transition-colors text-sm">
                {social}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-800 text-center">
          <p className="text-sm text-gray-500">© 2025 {config.brand.name}. Tous droits réservés.</p>
        </div>
      </div>
    </footer>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function AgencyModern() {
  return (
    <div className="min-h-screen bg-white">
      <Navigation />
      <HeroSection />
      <ServicesSection />
      <ProjectsSection />
      <ProcessSection />
      <TeamSection />
      <TestimonialsSection />
      <ContactSection />
      <Footer />
    </div>
  );
}
