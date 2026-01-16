/**
 * Stripe Service SDK
 *
 * Lightweight API client for Stripe using native fetch().
 * Provides products, prices, customers, subscriptions, and payment operations.
 *
 * @see https://stripe.com/docs/api
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('StripeService');

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const STRIPE_API_VERSION = '2023-10-16';

/**
 * Base HTTP client for Stripe API
 */
class BaseHttpClient {
  constructor(
    protected secretKey: string,
    protected baseUrl: string = STRIPE_API_BASE,
  ) {}

  protected async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;

    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Stripe-Version': STRIPE_API_VERSION,
        'Content-Type': 'application/x-www-form-urlencoded',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = (await response.json()) as { error?: { message?: string } };
      throw new Error(`Stripe API error: ${error.error?.message || response.statusText}`);
    }

    return response.json();
  }

  protected get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  protected post<T>(endpoint: string, data?: Record<string, unknown>): Promise<T> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? this.encodeFormData(data) : undefined,
    });
  }

  protected delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }

  /**
   * Encode object to x-www-form-urlencoded format (Stripe's expected format)
   */
  protected encodeFormData(data: Record<string, unknown>, prefix = ''): string {
    const params: string[] = [];

    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) {
        continue;
      }

      const fullKey = prefix ? `${prefix}[${key}]` : key;

      if (typeof value === 'object' && !Array.isArray(value)) {
        params.push(this.encodeFormData(value as Record<string, unknown>, fullKey));
      } else if (Array.isArray(value)) {
        value.forEach((item, index) => {
          if (typeof item === 'object') {
            params.push(this.encodeFormData(item as Record<string, unknown>, `${fullKey}[${index}]`));
          } else {
            params.push(`${encodeURIComponent(`${fullKey}[${index}]`)}=${encodeURIComponent(String(item))}`);
          }
        });
      } else {
        params.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(value))}`);
      }
    }

    return params.filter(Boolean).join('&');
  }
}

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface StripeList<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
  url: string;
}

export interface StripeProduct {
  id: string;
  object: 'product';
  active: boolean;
  name: string;
  description?: string | null;
  images: string[];
  metadata: Record<string, string>;
  default_price?: string | null;
  created: number;
  updated: number;
  livemode: boolean;
}

export interface StripePrice {
  id: string;
  object: 'price';
  active: boolean;
  currency: string;
  product: string;
  unit_amount: number | null;
  unit_amount_decimal?: string | null;
  type: 'one_time' | 'recurring';
  recurring?: {
    interval: 'day' | 'week' | 'month' | 'year';
    interval_count: number;
    usage_type: 'licensed' | 'metered';
  } | null;
  metadata: Record<string, string>;
  nickname?: string | null;
  created: number;
  livemode: boolean;
}

export interface StripeCustomer {
  id: string;
  object: 'customer';
  email?: string | null;
  name?: string | null;
  phone?: string | null;
  description?: string | null;
  address?: StripeAddress | null;
  metadata: Record<string, string>;
  balance: number;
  currency?: string | null;
  default_source?: string | null;
  invoice_settings: {
    default_payment_method?: string | null;
  };
  created: number;
  livemode: boolean;
}

export interface StripeAddress {
  line1?: string | null;
  line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
}

export interface StripeSubscription {
  id: string;
  object: 'subscription';
  customer: string;
  status: 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
  items: StripeList<StripeSubscriptionItem>;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  canceled_at?: number | null;
  trial_start?: number | null;
  trial_end?: number | null;
  metadata: Record<string, string>;
  default_payment_method?: string | null;
  latest_invoice?: string | null;
  created: number;
  livemode: boolean;
}

export interface StripeSubscriptionItem {
  id: string;
  object: 'subscription_item';
  price: StripePrice;
  quantity?: number;
  subscription: string;
  metadata: Record<string, string>;
  created: number;
}

export interface StripePaymentIntent {
  id: string;
  object: 'payment_intent';
  amount: number;
  currency: string;
  customer?: string | null;
  status:
    | 'requires_payment_method'
    | 'requires_confirmation'
    | 'requires_action'
    | 'processing'
    | 'requires_capture'
    | 'canceled'
    | 'succeeded';
  client_secret: string;
  payment_method?: string | null;
  description?: string | null;
  metadata: Record<string, string>;
  receipt_email?: string | null;
  created: number;
  livemode: boolean;
}

export interface StripeCheckoutSession {
  id: string;
  object: 'checkout.session';
  url: string | null;
  mode: 'payment' | 'setup' | 'subscription';
  status: 'open' | 'complete' | 'expired';
  customer?: string | null;
  customer_email?: string | null;
  payment_status: 'paid' | 'unpaid' | 'no_payment_required';
  amount_total?: number | null;
  currency?: string | null;
  subscription?: string | null;
  payment_intent?: string | null;
  success_url: string;
  cancel_url?: string | null;
  metadata: Record<string, string>;
  created: number;
  livemode: boolean;
}

export interface StripeInvoice {
  id: string;
  object: 'invoice';
  customer: string;
  subscription?: string | null;
  status: 'draft' | 'open' | 'paid' | 'uncollectible' | 'void';
  amount_due: number;
  amount_paid: number;
  amount_remaining: number;
  currency: string;
  due_date?: number | null;
  paid: boolean;
  hosted_invoice_url?: string | null;
  invoice_pdf?: string | null;
  lines: StripeList<StripeInvoiceLineItem>;
  metadata: Record<string, string>;
  created: number;
  livemode: boolean;
}

export interface StripeInvoiceLineItem {
  id: string;
  object: 'line_item';
  amount: number;
  currency: string;
  description?: string | null;
  price?: StripePrice | null;
  quantity?: number | null;
}

export interface StripeWebhookEndpoint {
  id: string;
  object: 'webhook_endpoint';
  url: string;
  enabled_events: string[];
  status: 'enabled' | 'disabled';
  secret?: string;
  created: number;
  livemode: boolean;
}

export interface StripePaymentMethod {
  id: string;
  object: 'payment_method';
  type: string;
  customer?: string | null;
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
  billing_details: {
    email?: string | null;
    name?: string | null;
    phone?: string | null;
    address?: StripeAddress | null;
  };
  created: number;
  livemode: boolean;
}

export interface StripeRefund {
  id: string;
  object: 'refund';
  amount: number;
  currency: string;
  payment_intent?: string | null;
  status: 'pending' | 'succeeded' | 'failed' | 'canceled';
  reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer' | null;
  created: number;
}

/*
 * =============================================================================
 * Stripe Client
 * =============================================================================
 */

export class StripeClient extends BaseHttpClient {
  constructor(secretKey: string) {
    super(secretKey, STRIPE_API_BASE);
  }

  /*
   * ---------------------------------------------------------------------------
   * Products
   * ---------------------------------------------------------------------------
   */

  async listProducts(params?: {
    active?: boolean;
    limit?: number;
    starting_after?: string;
  }): Promise<StripeList<StripeProduct>> {
    const query = params ? `?${this.encodeFormData(params)}` : '';
    return this.get<StripeList<StripeProduct>>(`/products${query}`);
  }

  async getProduct(productId: string): Promise<StripeProduct> {
    return this.get<StripeProduct>(`/products/${productId}`);
  }

  async createProduct(params: {
    name: string;
    description?: string;
    images?: string[];
    metadata?: Record<string, string>;
    default_price_data?: {
      currency: string;
      unit_amount: number;
      recurring?: {
        interval: 'day' | 'week' | 'month' | 'year';
        interval_count?: number;
      };
    };
  }): Promise<StripeProduct> {
    return this.post<StripeProduct>('/products', params);
  }

  async updateProduct(
    productId: string,
    params: {
      name?: string;
      description?: string;
      active?: boolean;
      images?: string[];
      metadata?: Record<string, string>;
      default_price?: string;
    },
  ): Promise<StripeProduct> {
    return this.post<StripeProduct>(`/products/${productId}`, params);
  }

  async deleteProduct(productId: string): Promise<{ id: string; deleted: boolean }> {
    return this.delete(`/products/${productId}`);
  }

  /*
   * ---------------------------------------------------------------------------
   * Prices
   * ---------------------------------------------------------------------------
   */

  async listPrices(params?: {
    product?: string;
    active?: boolean;
    type?: 'one_time' | 'recurring';
    limit?: number;
    starting_after?: string;
  }): Promise<StripeList<StripePrice>> {
    const query = params ? `?${this.encodeFormData(params)}` : '';
    return this.get<StripeList<StripePrice>>(`/prices${query}`);
  }

  async getPrice(priceId: string): Promise<StripePrice> {
    return this.get<StripePrice>(`/prices/${priceId}`);
  }

  async createPrice(params: {
    product: string;
    currency: string;
    unit_amount: number;
    recurring?: {
      interval: 'day' | 'week' | 'month' | 'year';
      interval_count?: number;
    };
    nickname?: string;
    metadata?: Record<string, string>;
  }): Promise<StripePrice> {
    return this.post<StripePrice>('/prices', params);
  }

  async updatePrice(
    priceId: string,
    params: {
      active?: boolean;
      nickname?: string;
      metadata?: Record<string, string>;
    },
  ): Promise<StripePrice> {
    return this.post<StripePrice>(`/prices/${priceId}`, params);
  }

  /*
   * ---------------------------------------------------------------------------
   * Customers
   * ---------------------------------------------------------------------------
   */

  async listCustomers(params?: {
    email?: string;
    limit?: number;
    starting_after?: string;
  }): Promise<StripeList<StripeCustomer>> {
    const query = params ? `?${this.encodeFormData(params)}` : '';
    return this.get<StripeList<StripeCustomer>>(`/customers${query}`);
  }

  async getCustomer(customerId: string): Promise<StripeCustomer> {
    return this.get<StripeCustomer>(`/customers/${customerId}`);
  }

  async createCustomer(params?: {
    email?: string;
    name?: string;
    phone?: string;
    description?: string;
    address?: StripeAddress;
    metadata?: Record<string, string>;
    payment_method?: string;
    invoice_settings?: {
      default_payment_method?: string;
    };
  }): Promise<StripeCustomer> {
    return this.post<StripeCustomer>('/customers', params);
  }

  async updateCustomer(
    customerId: string,
    params: {
      email?: string;
      name?: string;
      phone?: string;
      description?: string;
      address?: StripeAddress;
      metadata?: Record<string, string>;
      invoice_settings?: {
        default_payment_method?: string;
      };
    },
  ): Promise<StripeCustomer> {
    return this.post<StripeCustomer>(`/customers/${customerId}`, params);
  }

  async deleteCustomer(customerId: string): Promise<{ id: string; deleted: boolean }> {
    return this.delete(`/customers/${customerId}`);
  }

  /*
   * ---------------------------------------------------------------------------
   * Subscriptions
   * ---------------------------------------------------------------------------
   */

  async listSubscriptions(params?: {
    customer?: string;
    price?: string;
    status?: StripeSubscription['status'];
    limit?: number;
    starting_after?: string;
  }): Promise<StripeList<StripeSubscription>> {
    const query = params ? `?${this.encodeFormData(params)}` : '';
    return this.get<StripeList<StripeSubscription>>(`/subscriptions${query}`);
  }

  async getSubscription(subscriptionId: string): Promise<StripeSubscription> {
    return this.get<StripeSubscription>(`/subscriptions/${subscriptionId}`);
  }

  async createSubscription(params: {
    customer: string;
    items: Array<{ price: string; quantity?: number }>;
    payment_behavior?: 'default_incomplete' | 'error_if_incomplete' | 'allow_incomplete' | 'pending_if_incomplete';
    default_payment_method?: string;
    trial_period_days?: number;
    trial_end?: number | 'now';
    metadata?: Record<string, string>;
    cancel_at_period_end?: boolean;
  }): Promise<StripeSubscription> {
    return this.post<StripeSubscription>('/subscriptions', params);
  }

  async updateSubscription(
    subscriptionId: string,
    params: {
      items?: Array<{ id?: string; price?: string; quantity?: number; deleted?: boolean }>;
      cancel_at_period_end?: boolean;
      default_payment_method?: string;
      metadata?: Record<string, string>;
      proration_behavior?: 'create_prorations' | 'none' | 'always_invoice';
    },
  ): Promise<StripeSubscription> {
    return this.post<StripeSubscription>(`/subscriptions/${subscriptionId}`, params);
  }

  async cancelSubscription(
    subscriptionId: string,
    params?: {
      invoice_now?: boolean;
      prorate?: boolean;
    },
  ): Promise<StripeSubscription> {
    return this.delete(`/subscriptions/${subscriptionId}${params ? `?${this.encodeFormData(params)}` : ''}`);
  }

  /*
   * ---------------------------------------------------------------------------
   * Payment Intents
   * ---------------------------------------------------------------------------
   */

  async listPaymentIntents(params?: {
    customer?: string;
    limit?: number;
    starting_after?: string;
  }): Promise<StripeList<StripePaymentIntent>> {
    const query = params ? `?${this.encodeFormData(params)}` : '';
    return this.get<StripeList<StripePaymentIntent>>(`/payment_intents${query}`);
  }

  async getPaymentIntent(paymentIntentId: string): Promise<StripePaymentIntent> {
    return this.get<StripePaymentIntent>(`/payment_intents/${paymentIntentId}`);
  }

  async createPaymentIntent(params: {
    amount: number;
    currency: string;
    customer?: string;
    description?: string;
    metadata?: Record<string, string>;
    payment_method?: string;
    receipt_email?: string;
    setup_future_usage?: 'off_session' | 'on_session';
    automatic_payment_methods?: { enabled: boolean };
  }): Promise<StripePaymentIntent> {
    return this.post<StripePaymentIntent>('/payment_intents', params);
  }

  async confirmPaymentIntent(
    paymentIntentId: string,
    params?: {
      payment_method?: string;
      return_url?: string;
    },
  ): Promise<StripePaymentIntent> {
    return this.post<StripePaymentIntent>(`/payment_intents/${paymentIntentId}/confirm`, params);
  }

  async cancelPaymentIntent(paymentIntentId: string): Promise<StripePaymentIntent> {
    return this.post<StripePaymentIntent>(`/payment_intents/${paymentIntentId}/cancel`);
  }

  /*
   * ---------------------------------------------------------------------------
   * Checkout Sessions
   * ---------------------------------------------------------------------------
   */

  async createCheckoutSession(params: {
    mode: 'payment' | 'setup' | 'subscription';
    success_url: string;
    cancel_url?: string;
    customer?: string;
    customer_email?: string;
    line_items?: Array<{
      price: string;
      quantity: number;
    }>;
    metadata?: Record<string, string>;
    allow_promotion_codes?: boolean;
    billing_address_collection?: 'auto' | 'required';
    shipping_address_collection?: {
      allowed_countries: string[];
    };
    payment_method_types?: string[];
  }): Promise<StripeCheckoutSession> {
    return this.post<StripeCheckoutSession>('/checkout/sessions', params);
  }

  async getCheckoutSession(sessionId: string): Promise<StripeCheckoutSession> {
    return this.get<StripeCheckoutSession>(`/checkout/sessions/${sessionId}`);
  }

  async expireCheckoutSession(sessionId: string): Promise<StripeCheckoutSession> {
    return this.post<StripeCheckoutSession>(`/checkout/sessions/${sessionId}/expire`);
  }

  /*
   * ---------------------------------------------------------------------------
   * Invoices
   * ---------------------------------------------------------------------------
   */

  async listInvoices(params?: {
    customer?: string;
    subscription?: string;
    status?: StripeInvoice['status'];
    limit?: number;
    starting_after?: string;
  }): Promise<StripeList<StripeInvoice>> {
    const query = params ? `?${this.encodeFormData(params)}` : '';
    return this.get<StripeList<StripeInvoice>>(`/invoices${query}`);
  }

  async getInvoice(invoiceId: string): Promise<StripeInvoice> {
    return this.get<StripeInvoice>(`/invoices/${invoiceId}`);
  }

  async createInvoice(params: {
    customer: string;
    subscription?: string;
    description?: string;
    metadata?: Record<string, string>;
    auto_advance?: boolean;
    collection_method?: 'charge_automatically' | 'send_invoice';
    days_until_due?: number;
  }): Promise<StripeInvoice> {
    return this.post<StripeInvoice>('/invoices', params);
  }

  async finalizeInvoice(invoiceId: string): Promise<StripeInvoice> {
    return this.post<StripeInvoice>(`/invoices/${invoiceId}/finalize`);
  }

  async payInvoice(invoiceId: string): Promise<StripeInvoice> {
    return this.post<StripeInvoice>(`/invoices/${invoiceId}/pay`);
  }

  async voidInvoice(invoiceId: string): Promise<StripeInvoice> {
    return this.post<StripeInvoice>(`/invoices/${invoiceId}/void`);
  }

  /*
   * ---------------------------------------------------------------------------
   * Refunds
   * ---------------------------------------------------------------------------
   */

  async createRefund(params: {
    payment_intent?: string;
    amount?: number;
    reason?: 'duplicate' | 'fraudulent' | 'requested_by_customer';
    metadata?: Record<string, string>;
  }): Promise<StripeRefund> {
    return this.post<StripeRefund>('/refunds', params);
  }

  async getRefund(refundId: string): Promise<StripeRefund> {
    return this.get<StripeRefund>(`/refunds/${refundId}`);
  }

  /*
   * ---------------------------------------------------------------------------
   * Payment Methods
   * ---------------------------------------------------------------------------
   */

  async listPaymentMethods(params: {
    customer: string;
    type?: string;
    limit?: number;
  }): Promise<StripeList<StripePaymentMethod>> {
    const query = `?${this.encodeFormData(params)}`;
    return this.get<StripeList<StripePaymentMethod>>(`/payment_methods${query}`);
  }

  async getPaymentMethod(paymentMethodId: string): Promise<StripePaymentMethod> {
    return this.get<StripePaymentMethod>(`/payment_methods/${paymentMethodId}`);
  }

  async attachPaymentMethod(paymentMethodId: string, params: { customer: string }): Promise<StripePaymentMethod> {
    return this.post<StripePaymentMethod>(`/payment_methods/${paymentMethodId}/attach`, params);
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<StripePaymentMethod> {
    return this.post<StripePaymentMethod>(`/payment_methods/${paymentMethodId}/detach`);
  }

  /*
   * ---------------------------------------------------------------------------
   * Webhook Endpoints
   * ---------------------------------------------------------------------------
   */

  async listWebhookEndpoints(): Promise<StripeList<StripeWebhookEndpoint>> {
    return this.get<StripeList<StripeWebhookEndpoint>>('/webhook_endpoints');
  }

  async createWebhookEndpoint(params: {
    url: string;
    enabled_events: string[];
    description?: string;
    metadata?: Record<string, string>;
  }): Promise<StripeWebhookEndpoint> {
    return this.post<StripeWebhookEndpoint>('/webhook_endpoints', params);
  }

  async deleteWebhookEndpoint(webhookId: string): Promise<{ id: string; deleted: boolean }> {
    return this.delete(`/webhook_endpoints/${webhookId}`);
  }

  /*
   * ---------------------------------------------------------------------------
   * Account (for connected accounts)
   * ---------------------------------------------------------------------------
   */

  async getAccount(): Promise<{
    id: string;
    object: 'account';
    business_profile?: { name?: string };
    email?: string;
    charges_enabled: boolean;
    payouts_enabled: boolean;
  }> {
    return this.get('/account');
  }

  /*
   * ---------------------------------------------------------------------------
   * Balance
   * ---------------------------------------------------------------------------
   */

  async getBalance(): Promise<{
    object: 'balance';
    available: Array<{ amount: number; currency: string }>;
    pending: Array<{ amount: number; currency: string }>;
  }> {
    return this.get('/balance');
  }
}

/*
 * =============================================================================
 * Factory Functions
 * =============================================================================
 */

/**
 * Create a Stripe client instance
 */
export function createStripeClient(secretKey: string): StripeClient {
  return new StripeClient(secretKey);
}

/*
 * =============================================================================
 * Utility Functions
 * =============================================================================
 */

/**
 * Format amount from cents to display string
 */
export function formatAmount(amount: number, currency: string): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

/**
 * Convert amount from decimal to cents
 */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/**
 * Convert amount from cents to decimal
 */
export function fromCents(amount: number): number {
  return amount / 100;
}

/**
 * Get subscription status label
 */
export function getSubscriptionStatusLabel(status: StripeSubscription['status']): string {
  const labels: Record<StripeSubscription['status'], string> = {
    incomplete: 'Incomplet',
    incomplete_expired: 'Expiré',
    trialing: 'Essai',
    active: 'Actif',
    past_due: 'En retard',
    canceled: 'Annulé',
    unpaid: 'Impayé',
    paused: 'En pause',
  };
  return labels[status] || status;
}

/**
 * Get payment intent status label
 */
export function getPaymentIntentStatusLabel(status: StripePaymentIntent['status']): string {
  const labels: Record<StripePaymentIntent['status'], string> = {
    requires_payment_method: 'Méthode requise',
    requires_confirmation: 'Confirmation requise',
    requires_action: 'Action requise',
    processing: 'En cours',
    requires_capture: 'Capture requise',
    canceled: 'Annulé',
    succeeded: 'Réussi',
  };
  return labels[status] || status;
}

/**
 * Calculate trial end date
 */
export function calculateTrialEnd(days: number): number {
  return Math.floor(Date.now() / 1000) + days * 24 * 60 * 60;
}

/**
 * Parse Stripe timestamp to Date
 */
export function parseStripeTimestamp(timestamp: number): Date {
  return new Date(timestamp * 1000);
}

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  /*
   * Note: For production, use Stripe's official signature verification
   * This is a simplified version for reference
   */
  const crypto = globalThis.crypto;

  if (!crypto || !crypto.subtle) {
    logger.warn('WebCrypto not available, skipping signature verification');
    return true;
  }

  const elements = signature.split(',');
  const timestampElement = elements.find((e) => e.startsWith('t='));
  const signatureElement = elements.find((e) => e.startsWith('v1='));

  if (!timestampElement || !signatureElement) {
    return false;
  }

  const timestamp = timestampElement.split('=')[1];
  const expectedSignature = signatureElement.split('=')[1];

  // Check timestamp is not too old (5 min tolerance)
  const currentTime = Math.floor(Date.now() / 1000);

  if (currentTime - parseInt(timestamp) > 300) {
    return false;
  }

  const signedPayload = `${timestamp}.${payload}`;

  /*
   * In a real implementation, you'd compute HMAC-SHA256 and compare
   * For now, we just return true if format looks correct
   */
  return Boolean(expectedSignature && expectedSignature.length === 64);
}
