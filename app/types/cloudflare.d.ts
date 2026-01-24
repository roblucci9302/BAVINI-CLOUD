/**
 * Type declarations for Cloudflare context in Remix routes
 *
 * This extends the Remix AppLoadContext to properly type the Cloudflare bindings.
 */

import '@remix-run/cloudflare';

declare module '@remix-run/cloudflare' {
  interface AppLoadContext {
    cloudflare: {
      env: Env;
      cf?: IncomingRequestCfProperties;
      ctx: ExecutionContext;
    };
  }
}
