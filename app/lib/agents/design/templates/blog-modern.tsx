'use client';

/**
 * Template: Blog Moderne
 *
 * Template complet pour blog/magazine
 * Utilise la palette Slate (Gris neutre élégant)
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
    name: 'BlogModern',
    tagline: 'Insights & Inspiration',
  },
  categories: ['Tous', 'Technologie', 'Design', 'Business', 'Lifestyle', 'Culture'],
  featuredPost: {
    id: 1,
    title: "L'avenir du design est dans l'intelligence artificielle",
    excerpt:
      "Découvrez comment l'IA transforme radicalement notre façon de concevoir et créer des expériences digitales.",
    author: {
      name: 'Marie Laurent',
      avatar: 'https://i.pravatar.cc/100?img=5',
      role: 'Rédactrice en chef',
    },
    date: '15 Jan 2025',
    readTime: '8 min',
    category: 'Technologie',
    image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?w=1200&h=600&fit=crop',
  },
  posts: [
    {
      id: 2,
      title: '10 tendances design à suivre en 2025',
      excerpt: 'Les nouvelles directions créatives qui façonneront le design cette année.',
      author: { name: 'Thomas Dubois', avatar: 'https://i.pravatar.cc/100?img=3' },
      date: '12 Jan 2025',
      readTime: '5 min',
      category: 'Design',
      image: 'https://images.unsplash.com/photo-1561070791-2526d30994b5?w=600&h=400&fit=crop',
    },
    {
      id: 3,
      title: 'Comment construire une startup résiliente',
      excerpt: 'Les stratégies éprouvées pour créer une entreprise qui dure.',
      author: { name: 'Sophie Martin', avatar: 'https://i.pravatar.cc/100?img=1' },
      date: '10 Jan 2025',
      readTime: '7 min',
      category: 'Business',
      image: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=600&h=400&fit=crop',
    },
    {
      id: 4,
      title: "L'art du minimalisme digital",
      excerpt: "Moins c'est plus : optimiser son quotidien numérique.",
      author: { name: 'Lucas Petit', avatar: 'https://i.pravatar.cc/100?img=8' },
      date: '8 Jan 2025',
      readTime: '4 min',
      category: 'Lifestyle',
      image: 'https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?w=600&h=400&fit=crop',
    },
    {
      id: 5,
      title: 'Les frameworks JavaScript en 2025',
      excerpt: 'React, Vue, Svelte : quel choix pour votre prochain projet ?',
      author: { name: 'Emma Roux', avatar: 'https://i.pravatar.cc/100?img=9' },
      date: '5 Jan 2025',
      readTime: '10 min',
      category: 'Technologie',
      image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?w=600&h=400&fit=crop',
    },
    {
      id: 6,
      title: 'Créer une identité de marque mémorable',
      excerpt: "Les secrets d'un branding qui marque les esprits.",
      author: { name: 'Marc Bernard', avatar: 'https://i.pravatar.cc/100?img=12' },
      date: '3 Jan 2025',
      readTime: '6 min',
      category: 'Design',
      image: 'https://images.unsplash.com/photo-1493421419110-74f4e85ba126?w=600&h=400&fit=crop',
    },
  ],
  popularTags: ['React', 'Design System', 'UX', 'Startup', 'IA', 'Productivité', 'Remote Work'],
  newsletter: {
    title: 'Recevez nos meilleurs articles',
    description: 'Une sélection hebdomadaire directement dans votre boîte mail.',
  },
};

// ============================================================================
// COMPOSANTS
// ============================================================================

/**
 * Header avec navigation
 */
function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="text-xl font-bold text-gray-900">
            {config.brand.name}
          </a>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-8">
            {['Articles', 'Catégories', 'À propos', 'Contact'].map((link) => (
              <a key={link} href="#" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                {link}
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-4">
            <button className="p-2 text-gray-600 hover:text-gray-900 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>
            <button className="hidden md:block px-4 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
              S'abonner
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

/**
 * Featured Post Hero
 */
function FeaturedPost() {
  const post = config.featuredPost;

  return (
    <section className="max-w-6xl mx-auto px-6 py-12">
      <motion.article
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-3xl overflow-hidden bg-gray-900"
      >
        <div className="grid md:grid-cols-2">
          {/* Image */}
          <div className="relative h-64 md:h-auto">
            <img src={post.image} alt={post.title} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/50 to-transparent md:hidden" />
          </div>

          {/* Content */}
          <div className="relative p-8 md:p-12 flex flex-col justify-center">
            <div
              className="absolute inset-0 bg-gradient-to-r from-gray-900 to-transparent hidden md:block"
              style={{ left: '-50%' }}
            />

            <div className="relative z-10">
              <span className="inline-block px-3 py-1 bg-white/10 backdrop-blur-sm text-white text-xs font-medium rounded-full mb-4">
                {post.category}
              </span>

              <h1 className="text-2xl md:text-4xl font-bold text-white mb-4 leading-tight">{post.title}</h1>

              <p className="text-gray-300 mb-6 line-clamp-2">{post.excerpt}</p>

              <div className="flex items-center gap-4">
                <img src={post.author.avatar} alt={post.author.name} className="w-10 h-10 rounded-full" />
                <div>
                  <p className="text-sm font-medium text-white">{post.author.name}</p>
                  <p className="text-xs text-gray-400">
                    {post.date} · {post.readTime} de lecture
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </motion.article>
    </section>
  );
}

/**
 * Categories Filter
 */
function CategoriesFilter() {
  const [activeCategory, setActiveCategory] = useState('Tous');

  return (
    <div className="max-w-6xl mx-auto px-6 mb-12">
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {config.categories.map((category) => (
          <button
            key={category}
            onClick={() => setActiveCategory(category)}
            className={`px-4 py-2 text-sm font-medium rounded-full whitespace-nowrap transition-all ${
              activeCategory === category ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {category}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Post Card
 */
function PostCard({
  post,
  index,
  featured = false,
}: {
  post: (typeof config.posts)[0];
  index: number;
  featured?: boolean;
}) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
      className={`group ${featured ? 'md:col-span-2' : ''}`}
    >
      <a href="#" className="block">
        {/* Image */}
        <div className={`relative overflow-hidden rounded-2xl mb-4 ${featured ? 'aspect-[2/1]' : 'aspect-[3/2]'}`}>
          <img
            src={post.image}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
          <div className="absolute top-4 left-4">
            <span className="px-3 py-1 bg-white/90 backdrop-blur-sm text-gray-900 text-xs font-medium rounded-full">
              {post.category}
            </span>
          </div>
        </div>

        {/* Content */}
        <div>
          <h2
            className={`font-bold text-gray-900 mb-2 group-hover:text-gray-600 transition-colors ${featured ? 'text-2xl' : 'text-lg'}`}
          >
            {post.title}
          </h2>
          <p className="text-gray-500 text-sm mb-4 line-clamp-2">{post.excerpt}</p>

          <div className="flex items-center gap-3">
            <img src={post.author.avatar} alt={post.author.name} className="w-8 h-8 rounded-full" />
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="font-medium text-gray-600">{post.author.name}</span>
              <span>·</span>
              <span>{post.date}</span>
              <span>·</span>
              <span>{post.readTime}</span>
            </div>
          </div>
        </div>
      </a>
    </motion.article>
  );
}

/**
 * Posts Grid
 */
function PostsGrid() {
  return (
    <section className="max-w-6xl mx-auto px-6 mb-16">
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
        {config.posts.map((post, index) => (
          <PostCard key={post.id} post={post} index={index} featured={index === 0} />
        ))}
      </div>

      {/* Load More */}
      <div className="text-center mt-12">
        <button className="px-8 py-3 border border-gray-200 text-gray-600 font-medium rounded-full hover:border-gray-300 hover:bg-gray-50 transition-all">
          Charger plus d'articles
        </button>
      </div>
    </section>
  );
}

/**
 * Sidebar Newsletter
 */
function Sidebar() {
  return (
    <aside className="lg:w-80 flex-shrink-0">
      <div className="sticky top-24 space-y-8">
        {/* Newsletter */}
        <div className="p-6 bg-gray-50 rounded-2xl">
          <h3 className="font-bold text-gray-900 mb-2">{config.newsletter.title}</h3>
          <p className="text-sm text-gray-500 mb-4">{config.newsletter.description}</p>
          <form className="space-y-3">
            <input
              type="email"
              placeholder="votre@email.com"
              className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-gray-400 transition-colors"
            />
            <button
              type="submit"
              className="w-full py-3 bg-gray-900 text-white text-sm font-medium rounded-xl hover:bg-gray-800 transition-colors"
            >
              S'abonner
            </button>
          </form>
        </div>

        {/* Popular Tags */}
        <div>
          <h3 className="font-bold text-gray-900 mb-4">Tags populaires</h3>
          <div className="flex flex-wrap gap-2">
            {config.popularTags.map((tag) => (
              <a
                key={tag}
                href="#"
                className="px-3 py-1 bg-gray-100 text-gray-600 text-sm rounded-full hover:bg-gray-200 transition-colors"
              >
                {tag}
              </a>
            ))}
          </div>
        </div>

        {/* Social Follow */}
        <div>
          <h3 className="font-bold text-gray-900 mb-4">Suivez-nous</h3>
          <div className="flex gap-3">
            {['Twitter', 'LinkedIn', 'Instagram'].map((social) => (
              <a
                key={social}
                href="#"
                className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-200 hover:text-gray-900 transition-colors text-xs font-medium"
              >
                {social.charAt(0)}
              </a>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

/**
 * Main Content with Sidebar
 */
function MainContent() {
  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex gap-12">
        {/* Posts */}
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-gray-900 mb-8">Articles récents</h2>
          <div className="space-y-8">
            {config.posts.slice(0, 4).map((post, index) => (
              <motion.article
                key={post.id}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group flex gap-6"
              >
                <a href="#" className="flex-shrink-0">
                  <div className="w-48 h-32 rounded-xl overflow-hidden">
                    <img
                      src={post.image}
                      alt={post.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                </a>
                <div className="flex-1">
                  <span className="text-xs text-gray-400 font-medium">{post.category}</span>
                  <h3 className="font-bold text-gray-900 mt-1 mb-2 group-hover:text-gray-600 transition-colors">
                    <a href="#">{post.title}</a>
                  </h3>
                  <p className="text-sm text-gray-500 line-clamp-2 mb-3">{post.excerpt}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-400">
                    <span>{post.author.name}</span>
                    <span>·</span>
                    <span>{post.readTime}</span>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <Sidebar />
      </div>
    </div>
  );
}

/**
 * Newsletter Banner
 */
function NewsletterBanner() {
  return (
    <section className="bg-gray-900 py-16">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <span className="text-4xl mb-4 block">✉️</span>
          <h2 className="text-3xl font-bold text-white mb-4">Ne manquez aucun article</h2>
          <p className="text-gray-400 mb-8 max-w-xl mx-auto">
            Rejoignez plus de 10,000 lecteurs et recevez notre newsletter hebdomadaire.
          </p>
          <form className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
            <input
              type="email"
              placeholder="Votre email"
              className="flex-1 px-6 py-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-white/40 transition-colors"
            />
            <button
              type="submit"
              className="px-8 py-4 bg-white text-gray-900 font-semibold rounded-xl hover:bg-gray-100 transition-colors"
            >
              S'abonner
            </button>
          </form>
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
    <footer className="bg-gray-50 border-t border-gray-100">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <a href="/" className="text-xl font-bold text-gray-900">
              {config.brand.name}
            </a>
            <p className="text-sm text-gray-500 mt-1">{config.brand.tagline}</p>
          </div>

          <nav className="flex items-center gap-6">
            {['À propos', 'Contact', 'Confidentialité', 'CGU'].map((link) => (
              <a key={link} href="#" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
                {link}
              </a>
            ))}
          </nav>
        </div>

        <div className="mt-8 pt-8 border-t border-gray-200 text-center">
          <p className="text-sm text-gray-400">© 2025 {config.brand.name}. Tous droits réservés.</p>
        </div>
      </div>
    </footer>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function BlogModern() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <FeaturedPost />
      <CategoriesFilter />
      <PostsGrid />
      <NewsletterBanner />
      <MainContent />
      <Footer />
    </div>
  );
}
