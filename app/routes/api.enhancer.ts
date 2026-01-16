import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { streamText } from '~/lib/.server/llm/stream-text';
import { stripIndents } from '~/utils/stripIndent';
import { createScopedLogger } from '~/utils/logger';
import { handleRouteError } from '~/lib/errors/error-handler';
import { withRateLimit } from '~/lib/security/rate-limiter';

const logger = createScopedLogger('api.enhancer');

export async function action(args: ActionFunctionArgs) {
  // Rate limiting: 20 requêtes/minute pour les routes LLM
  return withRateLimit(args.request, () => enhancerAction(args), 'llm');
}

async function enhancerAction({ context, request }: ActionFunctionArgs) {
  const { message } = await request.json<{ message: string }>();

  try {
    const result = await streamText(
      [
        {
          role: 'user',
          content: stripIndents`
          I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.

          IMPORTANT: Only respond with the improved prompt and nothing else!

          <original_prompt>
            ${message}
          </original_prompt>
        `,
        },
      ],
      context.cloudflare.env,
    );

    // Use textStream directly and create a simple text response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of result.textStream) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error) {
    const [response] = handleRouteError(error, 'Enhancer', logger);
    return response;
  }
}
