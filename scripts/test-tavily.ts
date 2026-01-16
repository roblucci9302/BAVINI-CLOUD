/**
 * Test script for Tavily Web Search integration
 *
 * Run with: npx tsx scripts/test-tavily.ts
 */

import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment from .dev.vars
config({ path: resolve(__dirname, '../.dev.vars') });

/*
 * ============================================================================
 * INLINE WEB TOOLS IMPLEMENTATION (for standalone testing)
 * ============================================================================
 */

interface WebSearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  publishedDate?: string;
}

interface WebSearchOptions {
  numResults?: number;
  includeDomains?: string[];
  excludeDomains?: string[];
}

interface WebFetchResult {
  url: string;
  title: string;
  content: string;
  description?: string;
}

async function searchWithTavily(
  apiKey: string,
  query: string,
  options: WebSearchOptions = {},
): Promise<WebSearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'advanced',
      max_results: options.numResults || 5,
      include_domains: options.includeDomains || [],
      exclude_domains: options.excludeDomains || [],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tavily API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    results?: Array<{
      title: string;
      url: string;
      content: string;
      score?: number;
      published_date?: string;
    }>;
  };

  return (data.results || []).map((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.content,
    score: result.score,
    publishedDate: result.published_date,
  }));
}

async function fetchWithTavily(apiKey: string, url: string): Promise<WebFetchResult> {
  const response = await fetch('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      api_key: apiKey,
      urls: [url],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Tavily Extract API error: ${response.status} - ${error}`);
  }

  const data = await response.json() as {
    results?: Array<{
      url?: string;
      title?: string;
      content?: string;
      raw_content?: string;
      description?: string;
    }>;
  };
  const result = data.results?.[0];

  if (!result) {
    throw new Error('No content extracted from URL');
  }

  return {
    url: result.url || url,
    title: result.title || 'Sans titre',
    content: result.raw_content || result.content || '',
    description: result.description,
  };
}

/*
 * ============================================================================
 * TESTS
 * ============================================================================
 */

async function testTavilySearch() {
  console.log('🔍 Testing Tavily Web Search Integration\n');
  console.log('='.repeat(50));

  // Check if API key is available
  const apiKey = process.env.TAVILY_API_KEY || process.env.WEB_SEARCH_API_KEY;

  if (!apiKey) {
    console.error('❌ No API key found. Please set TAVILY_API_KEY in .dev.vars');
    process.exit(1);
  }

  console.log('✅ API Key found (length:', apiKey.length, ')');
  console.log('');

  // Test 1: Basic Search
  console.log('📋 Test 1: Basic Web Search');
  console.log('-'.repeat(50));

  try {
    const searchQuery = 'Claude AI Anthropic latest features 2025';
    console.log(`Query: "${searchQuery}"\n`);

    const results = await searchWithTavily(apiKey, searchQuery, { numResults: 3 });

    console.log(`Found ${results.length} results:\n`);

    for (const result of results) {
      console.log(`  📄 ${result.title}`);
      console.log(`     URL: ${result.url}`);
      console.log(`     Snippet: ${result.snippet.slice(0, 150)}...`);
      if (result.score) {
        console.log(`     Score: ${result.score.toFixed(2)}`);
      }
      console.log('');
    }

    console.log('✅ Search test PASSED\n');
  } catch (error) {
    console.error('❌ Search test FAILED:', error);
    process.exit(1);
  }

  // Test 2: Domain-filtered Search
  console.log('📋 Test 2: Domain-filtered Search');
  console.log('-'.repeat(50));

  try {
    const searchQuery = 'React 19 new features';
    console.log(`Query: "${searchQuery}" (filtered to react.dev)\n`);

    const results = await searchWithTavily(apiKey, searchQuery, {
      numResults: 3,
      includeDomains: ['react.dev', 'reactjs.org'],
    });

    console.log(`Found ${results.length} results:\n`);

    for (const result of results) {
      console.log(`  📄 ${result.title}`);
      console.log(`     URL: ${result.url}`);
      console.log('');
    }

    console.log('✅ Domain-filtered search test PASSED\n');
  } catch (error) {
    console.error('❌ Domain-filtered search test FAILED:', error);
  }

  // Test 3: Web Fetch
  console.log('📋 Test 3: Web Fetch (Extract Content)');
  console.log('-'.repeat(50));

  try {
    const url = 'https://docs.anthropic.com/en/docs/intro-to-claude';
    console.log(`Fetching: ${url}\n`);

    const result = await fetchWithTavily(apiKey, url);

    console.log(`  📄 Title: ${result.title}`);
    console.log(`  📝 Content length: ${result.content.length} characters`);
    console.log(`  📄 Preview: ${result.content.slice(0, 200)}...`);
    console.log('');

    console.log('✅ Web Fetch test PASSED\n');
  } catch (error) {
    console.error('❌ Web Fetch test FAILED:', error);
  }

  // Test 4: Orchestrator Configuration (simplified check)
  console.log('📋 Test 4: Orchestrator Integration Check');
  console.log('-'.repeat(50));

  console.log('  Checking that web tools are properly exported...');

  try {
    // Dynamic import to test the module structure
    const webToolsModule = await import('../app/lib/agents/tools/web-tools.js');

    const hasWebSearchTool = !!webToolsModule.WebSearchTool;
    const hasWebFetchTool = !!webToolsModule.WebFetchTool;
    const hasCreateWebToolHandlers = typeof webToolsModule.createWebToolHandlers === 'function';
    const hasCreateWebSearchService = typeof webToolsModule.createWebSearchService === 'function';

    console.log(`    - WebSearchTool exported: ${hasWebSearchTool}`);
    console.log(`    - WebFetchTool exported: ${hasWebFetchTool}`);
    console.log(`    - createWebToolHandlers function: ${hasCreateWebToolHandlers}`);
    console.log(`    - createWebSearchService function: ${hasCreateWebSearchService}`);

    if (hasWebSearchTool && hasWebFetchTool && hasCreateWebToolHandlers && hasCreateWebSearchService) {
      console.log('✅ Web tools module structure test PASSED\n');
    } else {
      console.error('❌ Web tools module structure test FAILED\n');
    }
  } catch (error) {
    console.error('❌ Module import test FAILED:', error);
  }

  console.log('='.repeat(50));
  console.log('🎉 All Tavily integration tests completed!');
  console.log('');
  console.log('📝 Note: The Orchestrator now has web_search and web_fetch tools.');
  console.log('   Configure with: orchestrator.configureWebSearch({ provider: "tavily", apiKey })');
}

// Run the tests
testTavilySearch().catch(console.error);
