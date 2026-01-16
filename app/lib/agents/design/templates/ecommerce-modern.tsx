'use client';

/**
 * Template: E-commerce Moderne
 *
 * Template complet pour boutique en ligne
 * Utilise la palette Ember (Orange/Rouge chaleureux)
 *
 * Dépendances: react, framer-motion, tailwindcss
 */

import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  brand: {
    name: 'ShopModern',
    tagline: 'Style & Qualité',
  },
  categories: [
    { name: 'Nouveautés', count: 24 },
    { name: 'Vêtements', count: 156 },
    { name: 'Accessoires', count: 89 },
    { name: 'Chaussures', count: 67 },
    { name: 'Promotions', count: 42, highlight: true },
  ],
  products: [
    {
      id: 1,
      name: 'Veste en cuir Premium',
      price: 299,
      originalPrice: 399,
      image: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=500&h=600&fit=crop',
      category: 'Vêtements',
      badge: 'Promo',
      rating: 4.8,
      reviews: 124,
    },
    {
      id: 2,
      name: 'Sneakers Urban Classic',
      price: 159,
      image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500&h=600&fit=crop',
      category: 'Chaussures',
      badge: 'Nouveau',
      rating: 4.9,
      reviews: 89,
    },
    {
      id: 3,
      name: 'Montre Minimaliste',
      price: 189,
      image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&h=600&fit=crop',
      category: 'Accessoires',
      rating: 4.7,
      reviews: 256,
    },
    {
      id: 4,
      name: 'Sac à dos Explorer',
      price: 129,
      image: 'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?w=500&h=600&fit=crop',
      category: 'Accessoires',
      rating: 4.6,
      reviews: 178,
    },
    {
      id: 5,
      name: 'Pull en cachemire',
      price: 249,
      originalPrice: 299,
      image: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=500&h=600&fit=crop',
      category: 'Vêtements',
      badge: 'Promo',
      rating: 4.8,
      reviews: 92,
    },
    {
      id: 6,
      name: 'Lunettes de soleil Aviator',
      price: 179,
      image: 'https://images.unsplash.com/photo-1572635196237-14b3f281503f?w=500&h=600&fit=crop',
      category: 'Accessoires',
      badge: 'Bestseller',
      rating: 4.9,
      reviews: 445,
    },
  ],
  filters: {
    sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    colors: [
      { name: 'Noir', hex: '#000000' },
      { name: 'Blanc', hex: '#FFFFFF' },
      { name: 'Rouge', hex: '#EF4444' },
      { name: 'Bleu', hex: '#3B82F6' },
      { name: 'Vert', hex: '#22C55E' },
    ],
    priceRanges: ['0-50€', '50-100€', '100-200€', '200€+'],
  },
};

// ============================================================================
// COMPOSANTS
// ============================================================================

/**
 * Header avec recherche et panier
 */
function Header() {
  const [cartCount] = useState(3);
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-stone-200">
      {/* Promo Banner */}
      <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white text-center py-2 text-sm font-medium">
        Livraison gratuite dès 100€ d'achat | Code: WELCOME10
      </div>

      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <a href="/" className="text-2xl font-bold text-stone-900">
            {config.brand.name}
            <span className="text-orange-500">.</span>
          </a>

          {/* Navigation */}
          <nav className="hidden lg:flex items-center gap-8">
            {config.categories.slice(0, 4).map((cat) => (
              <a
                key={cat.name}
                href="#"
                className={`text-sm font-medium transition-colors ${
                  cat.highlight ? 'text-orange-500 hover:text-orange-600' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {cat.name}
              </a>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-4">
            {/* Search */}
            <button
              onClick={() => setSearchOpen(!searchOpen)}
              className="p-2 text-stone-600 hover:text-stone-900 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>

            {/* Account */}
            <button className="p-2 text-stone-600 hover:text-stone-900 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </button>

            {/* Cart */}
            <button className="relative p-2 text-stone-600 hover:text-stone-900 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-orange-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <AnimatePresence>
          {searchOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-4">
                <input
                  type="text"
                  placeholder="Rechercher un produit..."
                  className="w-full px-4 py-3 bg-stone-100 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  autoFocus
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}

/**
 * Hero Banner
 */
function HeroBanner() {
  return (
    <section className="relative h-[500px] bg-stone-900 overflow-hidden">
      <div className="absolute inset-0">
        <img
          src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1600&h=800&fit=crop"
          alt="Collection"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-900 via-stone-900/70 to-transparent" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 h-full flex items-center">
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-xl"
        >
          <span className="inline-block px-4 py-1 bg-orange-500 text-white text-sm font-medium rounded-full mb-6">
            Nouvelle Collection
          </span>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 leading-tight">
            Style Automne
            <span className="block text-orange-400">2025</span>
          </h1>
          <p className="text-lg text-stone-300 mb-8">
            Découvrez notre sélection de pièces incontournables pour cette saison.
          </p>
          <div className="flex gap-4">
            <button className="px-8 py-4 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors">
              Découvrir
            </button>
            <button className="px-8 py-4 bg-white/10 backdrop-blur-sm text-white font-semibold rounded-xl border border-white/20 hover:bg-white/20 transition-colors">
              Voir le lookbook
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * Filtres Sidebar
 */
function FiltersSidebar() {
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [priceRange, setPriceRange] = useState<string | null>(null);

  const toggleSize = (size: string) => {
    setSelectedSizes((prev) => (prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size]));
  };

  const toggleColor = (color: string) => {
    setSelectedColors((prev) => (prev.includes(color) ? prev.filter((c) => c !== color) : [...prev, color]));
  };

  return (
    <aside className="w-64 flex-shrink-0">
      <div className="sticky top-32 space-y-8">
        {/* Categories */}
        <div>
          <h3 className="text-sm font-semibold text-stone-900 mb-4">Catégories</h3>
          <ul className="space-y-2">
            {config.categories.map((cat) => (
              <li key={cat.name}>
                <a
                  href="#"
                  className={`flex items-center justify-between py-2 text-sm transition-colors ${
                    cat.highlight ? 'text-orange-500 font-medium' : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {cat.name}
                  <span className="text-stone-400">({cat.count})</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        {/* Sizes */}
        <div>
          <h3 className="text-sm font-semibold text-stone-900 mb-4">Tailles</h3>
          <div className="flex flex-wrap gap-2">
            {config.filters.sizes.map((size) => (
              <button
                key={size}
                onClick={() => toggleSize(size)}
                className={`w-10 h-10 rounded-lg text-sm font-medium transition-all ${
                  selectedSizes.includes(size)
                    ? 'bg-orange-500 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Colors */}
        <div>
          <h3 className="text-sm font-semibold text-stone-900 mb-4">Couleurs</h3>
          <div className="flex flex-wrap gap-3">
            {config.filters.colors.map((color) => (
              <button
                key={color.name}
                onClick={() => toggleColor(color.name)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  selectedColors.includes(color.name)
                    ? 'border-orange-500 scale-110'
                    : 'border-transparent hover:scale-105'
                }`}
                style={{ backgroundColor: color.hex }}
                title={color.name}
              />
            ))}
          </div>
        </div>

        {/* Price Range */}
        <div>
          <h3 className="text-sm font-semibold text-stone-900 mb-4">Prix</h3>
          <div className="space-y-2">
            {config.filters.priceRanges.map((range) => (
              <label key={range} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="radio"
                  name="price"
                  checked={priceRange === range}
                  onChange={() => setPriceRange(range)}
                  className="w-4 h-4 text-orange-500 focus:ring-orange-500"
                />
                <span className="text-sm text-stone-600">{range}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Reset */}
        <button className="w-full py-3 text-sm text-orange-500 font-medium hover:text-orange-600 transition-colors">
          Réinitialiser les filtres
        </button>
      </div>
    </aside>
  );
}

/**
 * Product Card
 */
function ProductCard({ product, index }: { product: (typeof config.products)[0]; index: number }) {
  const [isHovered, setIsHovered] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="group"
    >
      {/* Image */}
      <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-stone-100 mb-4">
        <motion.img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover"
          animate={{ scale: isHovered ? 1.05 : 1 }}
          transition={{ duration: 0.4 }}
        />

        {/* Badge */}
        {product.badge && (
          <span
            className={`absolute top-4 left-4 px-3 py-1 text-xs font-semibold rounded-full ${
              product.badge === 'Promo'
                ? 'bg-red-500 text-white'
                : product.badge === 'Nouveau'
                  ? 'bg-orange-500 text-white'
                  : 'bg-stone-900 text-white'
            }`}
          >
            {product.badge}
          </span>
        )}

        {/* Favorite */}
        <button
          onClick={() => setIsFavorite(!isFavorite)}
          className="absolute top-4 right-4 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
        >
          <svg
            className={`w-5 h-5 transition-colors ${isFavorite ? 'text-red-500 fill-current' : 'text-stone-400'}`}
            fill={isFavorite ? 'currentColor' : 'none'}
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
        </button>

        {/* Quick Add */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : 20 }}
          className="absolute bottom-4 left-4 right-4"
        >
          <button className="w-full py-3 bg-stone-900 text-white text-sm font-semibold rounded-xl hover:bg-stone-800 transition-colors">
            Ajouter au panier
          </button>
        </motion.div>
      </div>

      {/* Info */}
      <div>
        <p className="text-xs text-stone-400 mb-1">{product.category}</p>
        <h3 className="font-medium text-stone-900 mb-2 group-hover:text-orange-500 transition-colors">
          {product.name}
        </h3>

        {/* Rating */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex items-center gap-0.5">
            {[...Array(5)].map((_, i) => (
              <svg
                key={i}
                className={`w-4 h-4 ${i < Math.floor(product.rating) ? 'text-orange-400' : 'text-stone-200'}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            ))}
          </div>
          <span className="text-xs text-stone-400">({product.reviews})</span>
        </div>

        {/* Price */}
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-stone-900">{product.price}€</span>
          {product.originalPrice && (
            <span className="text-sm text-stone-400 line-through">{product.originalPrice}€</span>
          )}
        </div>
      </div>
    </motion.article>
  );
}

/**
 * Products Grid
 */
function ProductsGrid() {
  const [sortBy, setSortBy] = useState('popular');

  return (
    <div className="flex-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <p className="text-sm text-stone-500">
          <span className="font-medium text-stone-900">{config.products.length}</span> produits
        </p>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="px-4 py-2 bg-stone-100 rounded-lg text-sm text-stone-600 focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="popular">Popularité</option>
          <option value="newest">Nouveautés</option>
          <option value="price-asc">Prix croissant</option>
          <option value="price-desc">Prix décroissant</option>
        </select>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {config.products.map((product, index) => (
          <ProductCard key={product.id} product={product} index={index} />
        ))}
      </div>

      {/* Load More */}
      <div className="text-center mt-12">
        <button className="px-8 py-4 border-2 border-stone-200 text-stone-600 font-semibold rounded-xl hover:border-stone-300 hover:bg-stone-50 transition-colors">
          Charger plus de produits
        </button>
      </div>
    </div>
  );
}

/**
 * Features Banner
 */
function FeaturesBanner() {
  const features = [
    { icon: '🚚', title: 'Livraison gratuite', description: "Dès 100€ d'achat" },
    { icon: '↩️', title: 'Retours gratuits', description: 'Sous 30 jours' },
    { icon: '🔒', title: 'Paiement sécurisé', description: 'CB, PayPal, Apple Pay' },
    { icon: '💬', title: 'Support 24/7', description: 'Toujours disponible' },
  ];

  return (
    <section className="py-16 bg-stone-50 border-y border-stone-200">
      <div className="max-w-7xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <span className="text-3xl mb-3 block">{feature.icon}</span>
              <h3 className="font-semibold text-stone-900 mb-1">{feature.title}</h3>
              <p className="text-sm text-stone-500">{feature.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Newsletter Section
 */
function Newsletter() {
  return (
    <section className="py-20 bg-gradient-to-br from-orange-500 to-red-500">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Restez informé</h2>
          <p className="text-white/80 mb-8">Inscrivez-vous pour recevoir nos offres exclusives et nouveautés.</p>

          <form className="flex flex-col sm:flex-row gap-4 max-w-lg mx-auto">
            <input
              type="email"
              placeholder="Votre email"
              className="flex-1 px-6 py-4 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none focus:ring-2 focus:ring-white"
            />
            <button
              type="submit"
              className="px-8 py-4 bg-stone-900 text-white font-semibold rounded-xl hover:bg-stone-800 transition-colors"
            >
              S'inscrire
            </button>
          </form>

          <p className="text-xs text-white/60 mt-4">
            En vous inscrivant, vous acceptez notre politique de confidentialité.
          </p>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * Footer
 */
function Footer() {
  const links = {
    Boutique: ['Nouveautés', 'Vêtements', 'Accessoires', 'Promotions'],
    Aide: ['FAQ', 'Livraison', 'Retours', 'Guide des tailles'],
    Entreprise: ['À propos', 'Carrières', 'Presse', 'Durabilité'],
  };

  return (
    <footer className="bg-stone-900 text-white">
      <div className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-5 gap-12">
          {/* Brand */}
          <div className="md:col-span-2">
            <a href="/" className="text-2xl font-bold mb-4 block">
              {config.brand.name}
              <span className="text-orange-500">.</span>
            </a>
            <p className="text-stone-400 text-sm mb-6">
              {config.brand.tagline}. Des vêtements et accessoires de qualité pour tous les styles.
            </p>
            <div className="flex gap-4">
              {['Instagram', 'Facebook', 'Twitter', 'Pinterest'].map((social) => (
                <a key={social} href="#" className="text-stone-400 hover:text-white transition-colors text-sm">
                  {social}
                </a>
              ))}
            </div>
          </div>

          {/* Links */}
          {Object.entries(links).map(([category, items]) => (
            <div key={category}>
              <h4 className="font-semibold mb-4">{category}</h4>
              <ul className="space-y-3">
                {items.map((item) => (
                  <li key={item}>
                    <a href="#" className="text-sm text-stone-400 hover:text-white transition-colors">
                      {item}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom */}
        <div className="mt-16 pt-8 border-t border-stone-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-stone-500">© 2025 {config.brand.name}. Tous droits réservés.</p>
          <div className="flex items-center gap-4">
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/100px-Visa_Inc._logo.svg.png"
              alt="Visa"
              className="h-6 opacity-50"
            />
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/100px-Mastercard-logo.svg.png"
              alt="Mastercard"
              className="h-6 opacity-50"
            />
            <span className="text-stone-500 text-sm">PayPal</span>
            <span className="text-stone-500 text-sm">Apple Pay</span>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ============================================================================
// PAGE PRINCIPALE
// ============================================================================

export default function EcommerceModern() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <HeroBanner />

      {/* Main Content */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="flex gap-12">
          <FiltersSidebar />
          <ProductsGrid />
        </div>
      </section>

      <FeaturesBanner />
      <Newsletter />
      <Footer />
    </div>
  );
}
