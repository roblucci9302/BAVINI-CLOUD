'use client';

/**
 * Template: Portfolio Créatif
 *
 * Template complet pour portfolio personnel/agence
 * Utilise la palette Obsidian (luxe) avec effets visuels avancés
 *
 * Dépendances: react, framer-motion, tailwindcss
 */

import { motion, useScroll, useTransform } from 'framer-motion';
import { useState, useRef } from 'react';

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  personal: {
    name: 'Alex Martin',
    title: 'Designer & Développeur Créatif',
    tagline: 'Je crée des expériences digitales mémorables',
    avatar: 'https://i.pravatar.cc/200?img=12',
    email: 'alex@portfolio.com',
    location: 'Paris, France',
  },
  stats: [
    { value: '8+', label: "Années d'expérience" },
    { value: '150+', label: 'Projets livrés' },
    { value: '50+', label: 'Clients satisfaits' },
    { value: '12', label: 'Récompenses' },
  ],
  skills: [
    { name: 'Design UI/UX', level: 95 },
    { name: 'React / Next.js', level: 90 },
    { name: 'Motion Design', level: 85 },
    { name: 'Branding', level: 80 },
  ],
  projects: [
    {
      id: 1,
      title: 'Nova Finance',
      category: 'Fintech',
      description: 'Application bancaire nouvelle génération avec interface intuitive',
      image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&h=600&fit=crop',
      tags: ['UI/UX', 'Mobile', 'React Native'],
      color: '#6366f1',
    },
    {
      id: 2,
      title: 'Artisan Coffee',
      category: 'E-commerce',
      description: 'Plateforme e-commerce premium pour torréfacteur artisanal',
      image: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&h=600&fit=crop',
      tags: ['Branding', 'Web', 'Shopify'],
      color: '#f59e0b',
    },
    {
      id: 3,
      title: 'Zen Space',
      category: 'Wellness',
      description: 'Application de méditation avec expérience immersive',
      image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=800&h=600&fit=crop',
      tags: ['Mobile', 'Animation', 'iOS'],
      color: '#10b981',
    },
    {
      id: 4,
      title: 'Urban Mobility',
      category: 'Transport',
      description: 'Dashboard de gestion de flotte véhicules électriques',
      image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&h=600&fit=crop',
      tags: ['Dashboard', 'Data Viz', 'B2B'],
      color: '#ec4899',
    },
  ],
  testimonials: [
    {
      quote:
        'Alex a transformé notre vision en une expérience utilisateur exceptionnelle. Son attention aux détails est remarquable.',
      author: 'Sophie Laurent',
      role: 'CEO, Nova Finance',
      avatar: 'https://i.pravatar.cc/100?img=5',
    },
    {
      quote: 'Collaboration fluide et résultats au-delà de nos attentes. Je recommande sans hésitation.',
      author: 'Marc Dubois',
      role: 'Founder, Artisan Coffee',
      avatar: 'https://i.pravatar.cc/100?img=3',
    },
  ],
  services: [
    { icon: '🎨', title: 'Design UI/UX', description: 'Interfaces élégantes et intuitives' },
    { icon: '💻', title: 'Développement', description: 'Code propre et performant' },
    { icon: '✨', title: 'Motion Design', description: 'Animations qui captivent' },
    { icon: '🚀', title: 'Conseil', description: 'Stratégie digitale sur mesure' },
  ],
  social: [
    { name: 'Twitter', url: '#' },
    { name: 'LinkedIn', url: '#' },
    { name: 'Dribbble', url: '#' },
    { name: 'GitHub', url: '#' },
  ],
};

// ============================================================================
// COMPOSANTS
// ============================================================================

/**
 * Navigation minimaliste
 */
function Navigation() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.nav
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="fixed top-0 left-0 right-0 z-50 px-6 py-6"
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <a href="/" className="text-xl font-bold text-white">
          {config.personal.name.split(' ')[0]}
          <span className="text-amber-400">.</span>
        </a>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {['Projets', 'Services', 'À propos', 'Contact'].map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase()}`}
              className="text-sm text-zinc-400 hover:text-white transition-colors"
            >
              {link}
            </a>
          ))}
        </div>

        {/* CTA */}
        <button className="hidden md:flex px-5 py-2.5 bg-white text-black text-sm font-medium rounded-full hover:bg-amber-400 transition-colors">
          Discutons
        </button>

        {/* Mobile Menu Button */}
        <button onClick={() => setIsOpen(!isOpen)} className="md:hidden p-2 text-white">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {isOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile Menu */}
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="md:hidden absolute top-full left-0 right-0 bg-black/95 backdrop-blur-xl border-t border-zinc-800 p-6"
        >
          {['Projets', 'Services', 'À propos', 'Contact'].map((link) => (
            <a
              key={link}
              href={`#${link.toLowerCase()}`}
              className="block py-3 text-lg text-zinc-300 hover:text-white transition-colors"
              onClick={() => setIsOpen(false)}
            >
              {link}
            </a>
          ))}
        </motion.div>
      )}
    </motion.nav>
  );
}

/**
 * Hero Section avec effet parallax
 */
function HeroSection() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], ['0%', '50%']);
  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);

  return (
    <section ref={ref} className="relative min-h-screen flex items-center justify-center overflow-hidden bg-black">
      {/* Background grain effect */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Gradient orbs */}
      <motion.div style={{ y }} className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-amber-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-zinc-500/10 rounded-full blur-[100px]" />
      </motion.div>

      <motion.div style={{ opacity }} className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        {/* Avatar */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', duration: 1 }}
          className="mb-8"
        >
          <div className="relative inline-block">
            <img
              src={config.personal.avatar}
              alt={config.personal.name}
              className="w-24 h-24 rounded-full border-2 border-amber-400/50 object-cover"
            />
            <span className="absolute bottom-0 right-0 w-6 h-6 bg-emerald-500 rounded-full border-4 border-black" />
          </div>
        </motion.div>

        {/* Title */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <span className="inline-block px-4 py-1.5 mb-6 text-xs font-medium text-amber-400 border border-amber-400/30 rounded-full">
            Disponible pour projets
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-6 tracking-tight"
        >
          {config.personal.tagline.split(' ').slice(0, 2).join(' ')}
          <span className="block text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200">
            {config.personal.tagline.split(' ').slice(2).join(' ')}
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="text-xl text-zinc-400 mb-12 max-w-2xl mx-auto"
        >
          {config.personal.title} basé à {config.personal.location}
        </motion.p>

        {/* CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <a
            href="#projets"
            className="group px-8 py-4 bg-white text-black rounded-full font-semibold hover:bg-amber-400 transition-all inline-flex items-center justify-center gap-2"
          >
            Voir mes projets
            <svg
              className="w-4 h-4 group-hover:translate-x-1 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
          <a
            href="#contact"
            className="px-8 py-4 border border-zinc-700 text-white rounded-full font-semibold hover:border-zinc-500 hover:bg-zinc-900 transition-all"
          >
            Me contacter
          </a>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute bottom-12 left-1/2 -translate-x-1/2"
        >
          <div className="w-6 h-10 border-2 border-zinc-700 rounded-full flex items-start justify-center p-2">
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="w-1.5 h-1.5 bg-amber-400 rounded-full"
            />
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}

/**
 * Stats Section avec compteurs animés
 */
function StatsSection() {
  return (
    <section className="py-20 bg-zinc-950 border-y border-zinc-800">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {config.stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-bold text-white mb-2">{stat.value}</div>
              <div className="text-sm text-zinc-500">{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Projects Grid avec hover effects
 */
function ProjectsSection() {
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  return (
    <section id="projets" className="py-24 bg-black">
      <div className="max-w-7xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-amber-400 text-sm font-medium">Portfolio</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-2 mb-4">Projets sélectionnés</h2>
          <p className="text-zinc-400 max-w-xl mx-auto">
            Une sélection de mes travaux récents alliant design et technologie.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {config.projects.map((project, index) => (
            <motion.article
              key={project.id}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              onMouseEnter={() => setHoveredId(project.id)}
              onMouseLeave={() => setHoveredId(null)}
              className="group relative overflow-hidden rounded-2xl bg-zinc-900 cursor-pointer"
            >
              {/* Image */}
              <div className="aspect-[4/3] overflow-hidden">
                <motion.img
                  src={project.image}
                  alt={project.title}
                  className="w-full h-full object-cover"
                  animate={{
                    scale: hoveredId === project.id ? 1.1 : 1,
                  }}
                  transition={{ duration: 0.6, ease: 'easeOut' }}
                />
                {/* Overlay */}
                <div
                  className="absolute inset-0 opacity-60 transition-opacity group-hover:opacity-80"
                  style={{
                    background: `linear-gradient(to top, ${project.color}99, transparent)`,
                  }}
                />
              </div>

              {/* Content */}
              <div className="absolute inset-0 flex flex-col justify-end p-8">
                <span className="text-xs font-medium text-white/70 mb-2">{project.category}</span>
                <h3 className="text-2xl font-bold text-white mb-2">{project.title}</h3>
                <p className="text-white/70 text-sm mb-4 line-clamp-2">{project.description}</p>

                {/* Tags */}
                <div className="flex flex-wrap gap-2">
                  {project.tags.map((tag) => (
                    <span
                      key={tag}
                      className="px-3 py-1 text-xs font-medium text-white bg-white/20 backdrop-blur-sm rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Arrow */}
                <motion.div
                  className="absolute top-6 right-6 w-12 h-12 bg-white rounded-full flex items-center justify-center"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{
                    scale: hoveredId === project.id ? 1 : 0,
                    opacity: hoveredId === project.id ? 1 : 0,
                  }}
                  transition={{ duration: 0.3 }}
                >
                  <svg className="w-5 h-5 text-black -rotate-45" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </motion.div>
              </div>
            </motion.article>
          ))}
        </div>

        {/* View All Button */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center mt-12"
        >
          <a href="#" className="inline-flex items-center gap-2 text-amber-400 hover:text-amber-300 transition-colors">
            Voir tous les projets
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * Services Section
 */
function ServicesSection() {
  return (
    <section id="services" className="py-24 bg-zinc-950">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-amber-400 text-sm font-medium">Services</span>
          <h2 className="text-4xl md:text-5xl font-bold text-white mt-2 mb-4">Comment puis-je vous aider ?</h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {config.services.map((service, index) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="group p-8 bg-zinc-900 rounded-2xl border border-zinc-800 hover:border-amber-400/30 transition-all duration-300"
            >
              <div className="text-4xl mb-6 group-hover:scale-110 transition-transform">{service.icon}</div>
              <h3 className="text-lg font-semibold text-white mb-2">{service.title}</h3>
              <p className="text-zinc-400 text-sm">{service.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Skills Section avec barres de progression
 */
function SkillsSection() {
  return (
    <section id="à propos" className="py-24 bg-black">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Text */}
          <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
            <span className="text-amber-400 text-sm font-medium">À propos</span>
            <h2 className="text-4xl font-bold text-white mt-2 mb-6">Designer passionné par l'excellence</h2>
            <p className="text-zinc-400 mb-6 leading-relaxed">
              Avec plus de 8 ans d'expérience dans le design digital, je combine créativité et expertise technique pour
              donner vie à des projets ambitieux. Mon approche centrée utilisateur garantit des résultats qui dépassent
              les attentes.
            </p>
            <p className="text-zinc-400 mb-8 leading-relaxed">
              Chaque projet est une opportunité d'innover et de repousser les limites du possible. Je crois en la
              puissance du design pour transformer les idées en expériences mémorables.
            </p>

            <a
              href="#contact"
              className="inline-flex items-center gap-2 px-6 py-3 bg-amber-400 text-black font-semibold rounded-full hover:bg-amber-300 transition-colors"
            >
              Télécharger mon CV
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </a>
          </motion.div>

          {/* Skills */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="space-y-6"
          >
            {config.skills.map((skill, index) => (
              <div key={skill.name}>
                <div className="flex justify-between mb-2">
                  <span className="text-white font-medium">{skill.name}</span>
                  <span className="text-zinc-400">{skill.level}%</span>
                </div>
                <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${skill.level}%` }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1, duration: 1, ease: 'easeOut' }}
                    className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full"
                  />
                </div>
              </div>
            ))}
          </motion.div>
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
    <section className="py-24 bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <span className="text-amber-400 text-sm font-medium">Témoignages</span>
          <h2 className="text-4xl font-bold text-white mt-2">Ce qu'ils disent</h2>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-8">
          {config.testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.author}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="p-8 bg-zinc-900 rounded-2xl border border-zinc-800"
            >
              <svg className="w-10 h-10 text-amber-400/30 mb-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
              </svg>
              <p className="text-lg text-zinc-300 mb-6 leading-relaxed">"{testimonial.quote}"</p>
              <div className="flex items-center gap-4">
                <img src={testimonial.avatar} alt={testimonial.author} className="w-12 h-12 rounded-full" />
                <div>
                  <p className="font-semibold text-white">{testimonial.author}</p>
                  <p className="text-sm text-zinc-500">{testimonial.role}</p>
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
    <section id="contact" className="py-24 bg-black">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <span className="text-amber-400 text-sm font-medium">Contact</span>
          <h2 className="text-4xl md:text-6xl font-bold text-white mt-2 mb-6">Travaillons ensemble</h2>
          <p className="text-xl text-zinc-400 mb-12 max-w-2xl mx-auto">
            Vous avez un projet en tête ? Discutons de comment je peux vous aider à le concrétiser.
          </p>

          <a
            href={`mailto:${config.personal.email}`}
            className="inline-flex items-center gap-3 text-3xl md:text-4xl font-bold text-white hover:text-amber-400 transition-colors group"
          >
            {config.personal.email}
            <svg
              className="w-8 h-8 group-hover:translate-x-2 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </a>

          {/* Social Links */}
          <div className="flex justify-center gap-6 mt-12">
            {config.social.map((link) => (
              <a key={link.name} href={link.url} className="text-zinc-500 hover:text-white transition-colors">
                {link.name}
              </a>
            ))}
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
    <footer className="py-8 bg-zinc-950 border-t border-zinc-800">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-sm text-zinc-500">© 2025 {config.personal.name}. Tous droits réservés.</p>
        <p className="text-sm text-zinc-500">Conçu avec passion à {config.personal.location}</p>
      </div>
    </footer>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function PortfolioModern() {
  return (
    <div className="min-h-screen bg-black text-white">
      <Navigation />
      <HeroSection />
      <StatsSection />
      <ProjectsSection />
      <ServicesSection />
      <SkillsSection />
      <TestimonialsSection />
      <ContactSection />
      <Footer />
    </div>
  );
}
