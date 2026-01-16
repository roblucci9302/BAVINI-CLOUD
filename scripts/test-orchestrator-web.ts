/**
 * Test script for Orchestrator with Web Search
 *
 * This test simulates what the Orchestrator does with web tools
 * without requiring the full Vite environment.
 *
 * Run with: npx tsx scripts/test-orchestrator-web.ts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment from .dev.vars
config({ path: resolve(__dirname, '../.dev.vars') });

/*
 * ============================================================================
 * WEB TOOLS IMPLEMENTATION (standalone version)
 * ============================================================================
 */

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
}

interface WebFetchResult {
  url: string;
  title: string;
  content: string;
}

async function webSearch(apiKey: string, query: string, numResults = 5): Promise<WebSearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: numResults,
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status}`);
  }

  const data = await response.json() as {
    results?: Array<{ title: string; url: string; content: string; score?: number }>;
  };

  return (data.results || []).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content,
    score: r.score,
  }));
}

async function webFetch(apiKey: string, url: string): Promise<WebFetchResult> {
  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      urls: [url],
    }),
  });

  if (!response.ok) {
    throw new Error(`Tavily Extract API error: ${response.status}`);
  }

  const data = await response.json() as {
    results?: Array<{ url?: string; title?: string; raw_content?: string; content?: string }>;
  };
  const result = data.results?.[0];

  return {
    url: result?.url || url,
    title: result?.title || 'Sans titre',
    content: result?.raw_content || result?.content || '',
  };
}

/*
 * ============================================================================
 * TOOL DEFINITIONS (matching Orchestrator's web tools)
 * ============================================================================
 */

const webSearchTool: Anthropic.Tool = {
  name: 'web_search',
  description: `Rechercher des informations sur le web en temps réel.
Utilise cet outil pour obtenir des informations actuelles sur des technologies, documentation, etc.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'La requête de recherche' },
      num_results: { type: 'number', description: 'Nombre de résultats (1-10)' },
    },
    required: ['query'],
  },
};

const webFetchTool: Anthropic.Tool = {
  name: 'web_fetch',
  description: `Récupérer le contenu d'une page web spécifique.
Utilise après web_search pour obtenir plus de détails sur une page.`,
  input_schema: {
    type: 'object' as const,
    properties: {
      url: { type: 'string', description: "L'URL de la page à récupérer" },
    },
    required: ['url'],
  },
};

/*
 * ============================================================================
 * ORCHESTRATOR SIMULATION
 * ============================================================================
 */

async function simulateOrchestrator(
  anthropicKey: string,
  tavilyKey: string,
  userPrompt: string,
) {
  const client = new Anthropic({ apiKey: anthropicKey });

  const systemPrompt = `Tu es l'Orchestrateur BAVINI. Tu as accès à des outils de recherche web.

## Tes Outils
- web_search: Rechercher sur le web
- web_fetch: Récupérer le contenu d'une page

## Instructions
1. Utilise web_search pour trouver des informations pertinentes
2. Si besoin, utilise web_fetch pour obtenir plus de détails
3. Synthétise les résultats pour l'utilisateur
4. TOUJOURS inclure les sources avec format [Titre](URL)`;

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt },
  ];

  console.log('📤 Sending request to Claude...\n');

  let continueLoop = true;
  let iterations = 0;
  const maxIterations = 5;

  while (continueLoop && iterations < maxIterations) {
    iterations++;
    console.log(`🔄 Iteration ${iterations}/${maxIterations}`);

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      tools: [webSearchTool, webFetchTool],
      messages,
    });

    console.log(`   Stop reason: ${response.stop_reason}`);

    // Process response
    const assistantContent: Anthropic.ContentBlock[] = [];
    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        assistantContent.push(block);
        console.log(`   📝 Text response: ${block.text.slice(0, 100)}...`);
      } else if (block.type === 'tool_use') {
        assistantContent.push(block);
        console.log(`   🔧 Tool call: ${block.name}`);

        const input = block.input as Record<string, unknown>;

        try {
          let result: unknown;

          if (block.name === 'web_search') {
            const query = input.query as string;
            const numResults = (input.num_results as number) || 5;
            console.log(`      Query: "${query}"`);

            const searchResults = await webSearch(tavilyKey, query, numResults);
            console.log(`      Found ${searchResults.length} results`);

            result = {
              success: true,
              results: searchResults.map((r, i) => ({
                position: i + 1,
                title: r.title,
                url: r.url,
                snippet: r.snippet,
              })),
            };
          } else if (block.name === 'web_fetch') {
            const url = input.url as string;
            console.log(`      URL: ${url}`);

            const fetchResult = await webFetch(tavilyKey, url);
            console.log(`      Fetched ${fetchResult.content.length} chars`);

            result = {
              success: true,
              title: fetchResult.title,
              content: fetchResult.content.slice(0, 5000),
              truncated: fetchResult.content.length > 5000,
            };
          } else {
            result = { error: `Unknown tool: ${block.name}` };
          }

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        } catch (error) {
          console.log(`      ❌ Error: ${error}`);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: JSON.stringify({ error: String(error) }),
            is_error: true,
          });
        }
      }
    }

    // Add assistant message
    messages.push({ role: 'assistant', content: assistantContent });

    // If there were tool calls, add results and continue
    if (toolResults.length > 0) {
      messages.push({ role: 'user', content: toolResults });
    } else {
      // No tool calls, we're done
      continueLoop = false;
    }

    // Check stop reason
    if (response.stop_reason === 'end_turn') {
      continueLoop = false;
    }
  }

  // Extract final text response
  const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop();
  let finalText = '';

  if (lastAssistantMessage && Array.isArray(lastAssistantMessage.content)) {
    for (const block of lastAssistantMessage.content) {
      if (typeof block === 'object' && 'type' in block && block.type === 'text') {
        finalText += block.text;
      }
    }
  }

  return finalText;
}

/*
 * ============================================================================
 * MAIN TEST
 * ============================================================================
 */

async function main() {
  console.log('🤖 Testing Orchestrator with Web Search\n');
  console.log('='.repeat(60));

  const tavilyKey = process.env.TAVILY_API_KEY;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;

  if (!tavilyKey) {
    console.error('❌ TAVILY_API_KEY not found in .dev.vars');
    process.exit(1);
  }

  if (!anthropicKey) {
    console.error('❌ ANTHROPIC_API_KEY not found in .dev.vars');
    process.exit(1);
  }

  console.log('✅ API keys configured');
  console.log('');

  const testPrompt = 'Quelles sont les nouvelles fonctionnalités de React 19? Fais une recherche web.';

  console.log(`📝 User prompt: "${testPrompt}"`);
  console.log('');
  console.log('-'.repeat(60));

  try {
    const startTime = Date.now();
    const result = await simulateOrchestrator(anthropicKey, tavilyKey, testPrompt);
    const duration = Date.now() - startTime;

    console.log('');
    console.log('-'.repeat(60));
    console.log('📊 Results:');
    console.log(`   Duration: ${duration}ms`);
    console.log('');
    console.log('📄 Final Response:');
    console.log('='.repeat(60));
    console.log(result);
    console.log('='.repeat(60));
    console.log('');
    console.log('✅ Test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
