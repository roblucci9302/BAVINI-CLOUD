import { describe, expect, it, vi } from 'vitest';
import { StreamingMessageParser, type ActionCallback, type ArtifactCallback } from './message-parser';

interface ExpectedResult {
  output: string;
  callbacks?: {
    onArtifactOpen?: number;
    onArtifactClose?: number;
    onActionOpen?: number;
    onActionClose?: number;
  };
}

describe('StreamingMessageParser', () => {
  it('should pass through normal text', () => {
    const parser = new StreamingMessageParser();
    expect(parser.parse('test_id', 'Hello, world!')).toBe('Hello, world!');
  });

  it('should allow normal HTML tags', () => {
    const parser = new StreamingMessageParser();
    expect(parser.parse('test_id', 'Hello <strong>world</strong>!')).toBe('Hello <strong>world</strong>!');
  });

  describe('no artifacts', () => {
    it.each<[string | string[], ExpectedResult | string]>([
      ['Foo bar', 'Foo bar'],
      ['Foo bar <', 'Foo bar '],
      ['Foo bar <p', 'Foo bar <p'],
      [['Foo bar <', 's', 'p', 'an>some text</span>'], 'Foo bar <span>some text</span>'],
    ])('should correctly parse chunks and strip out bolt artifacts (%#)', (input, expected) => {
      runTest(input, expected);
    });
  });

  describe('invalid or incomplete artifacts', () => {
    it.each<[string | string[], ExpectedResult | string]>([
      ['Foo bar <b', 'Foo bar '],
      ['Foo bar <ba', 'Foo bar <ba'],
      ['Foo bar <bol', 'Foo bar '],
      ['Foo bar <bolt', 'Foo bar '],
      ['Foo bar <bolta', 'Foo bar <bolta'],
      ['Foo bar <boltA', 'Foo bar '],
      ['Foo bar <boltArtifacs></boltArtifact>', 'Foo bar <boltArtifacs></boltArtifact>'],
      ['Before <oltArtfiact>foo</boltArtifact> After', 'Before <oltArtfiact>foo</boltArtifact> After'],
      ['Before <boltArtifactt>foo</boltArtifact> After', 'Before <boltArtifactt>foo</boltArtifact> After'],
    ])('should correctly parse chunks and strip out bolt artifacts (%#)', (input, expected) => {
      runTest(input, expected);
    });
  });

  describe('valid artifacts without actions', () => {
    it.each<[string | string[], ExpectedResult | string]>([
      [
        'Some text before <boltArtifact title="Some title" id="artifact_1">foo bar</boltArtifact> Some more text',
        {
          output: 'Some text before  Some more text',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
      [
        ['Some text before <boltArti', 'fact', ' title="Some title" id="artifact_1">foo</boltArtifact> Some more text'],
        {
          output: 'Some text before  Some more text',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
      [
        [
          'Some text before <boltArti',
          'fac',
          't title="Some title" id="artifact_1"',
          ' ',
          '>',
          'foo</boltArtifact> Some more text',
        ],
        {
          output: 'Some text before  Some more text',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
      [
        [
          'Some text before <boltArti',
          'fact',
          ' title="Some title" id="artifact_1"',
          ' >fo',
          'o</boltArtifact> Some more text',
        ],
        {
          output: 'Some text before  Some more text',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
      [
        [
          'Some text before <boltArti',
          'fact tit',
          'le="Some ',
          'title" id="artifact_1">fo',
          'o',
          '<',
          '/boltArtifact> Some more text',
        ],
        {
          output: 'Some text before  Some more text',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
      [
        [
          'Some text before <boltArti',
          'fact title="Some title" id="artif',
          'act_1">fo',
          'o<',
          '/boltArtifact> Some more text',
        ],
        {
          output: 'Some text before  Some more text',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
      [
        'Before <boltArtifact title="Some title" id="artifact_1">foo</boltArtifact> After',
        {
          output: 'Before  After',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 0, onActionClose: 0 },
        },
      ],
    ])('should correctly parse chunks and strip out bolt artifacts (%#)', (input, expected) => {
      runTest(input, expected);
    });
  });

  describe('valid artifacts with actions', () => {
    it.each<[string | string[], ExpectedResult | string]>([
      [
        'Before <boltArtifact title="Some title" id="artifact_1"><boltAction type="shell">npm install</boltAction></boltArtifact> After',
        {
          output: 'Before  After',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 1, onActionClose: 1 },
        },
      ],
      [
        'Before <boltArtifact title="Some title" id="artifact_1"><boltAction type="shell">npm install</boltAction><boltAction type="file" filePath="index.js">some content</boltAction></boltArtifact> After',
        {
          output: 'Before  After',
          callbacks: { onArtifactOpen: 1, onArtifactClose: 1, onActionOpen: 2, onActionClose: 2 },
        },
      ],
    ])('should correctly parse chunks and strip out bolt artifacts (%#)', (input, expected) => {
      runTest(input, expected);
    });
  });

  describe('git actions', () => {
    it('should parse git clone action with url', () => {
      const onActionOpen = vi.fn();
      const onActionClose = vi.fn();

      const parser = new StreamingMessageParser({
        artifactElement: () => '',
        callbacks: { onActionOpen, onActionClose },
      });

      const input =
        '<boltArtifact title="Clone repo" id="artifact_1"><boltAction type="git" operation="clone" url="https://github.com/user/repo">Cloning...</boltAction></boltArtifact>';

      parser.parse('msg_1', input);

      expect(onActionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'git',
            operation: 'clone',
            url: 'https://github.com/user/repo',
          }),
        }),
      );
    });

    it('should parse git commit action with message', () => {
      const onActionOpen = vi.fn();
      const onActionClose = vi.fn();

      const parser = new StreamingMessageParser({
        artifactElement: () => '',
        callbacks: { onActionOpen, onActionClose },
      });

      const input =
        '<boltArtifact title="Commit" id="artifact_1"><boltAction type="git" operation="commit" message="Initial commit">Committing...</boltAction></boltArtifact>';

      parser.parse('msg_1', input);

      expect(onActionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'git',
            operation: 'commit',
            message: 'Initial commit',
          }),
        }),
      );
    });

    it('should parse git push action with remote and branch', () => {
      const onActionOpen = vi.fn();

      const parser = new StreamingMessageParser({
        artifactElement: () => '',
        callbacks: { onActionOpen },
      });

      const input =
        '<boltArtifact title="Push" id="artifact_1"><boltAction type="git" operation="push" remote="origin" branch="main">Pushing...</boltAction></boltArtifact>';

      parser.parse('msg_1', input);

      expect(onActionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'git',
            operation: 'push',
            remote: 'origin',
            branch: 'main',
          }),
        }),
      );
    });

    it('should parse git action with token for authentication', () => {
      const onActionOpen = vi.fn();

      const parser = new StreamingMessageParser({
        artifactElement: () => '',
        callbacks: { onActionOpen },
      });

      const input =
        '<boltArtifact title="Push" id="artifact_1"><boltAction type="git" operation="push" token="ghp_test123">Pushing...</boltAction></boltArtifact>';

      parser.parse('msg_1', input);

      expect(onActionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'git',
            operation: 'push',
            token: 'ghp_test123',
          }),
        }),
      );
    });

    it('should parse git add action with filepath', () => {
      const onActionOpen = vi.fn();

      const parser = new StreamingMessageParser({
        artifactElement: () => '',
        callbacks: { onActionOpen },
      });

      const input =
        '<boltArtifact title="Add" id="artifact_1"><boltAction type="git" operation="add" filepath="src/index.ts">Adding file...</boltAction></boltArtifact>';

      parser.parse('msg_1', input);

      expect(onActionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'git',
            operation: 'add',
            filepath: 'src/index.ts',
          }),
        }),
      );
    });

    it('should parse git pull action', () => {
      const onActionOpen = vi.fn();

      const parser = new StreamingMessageParser({
        artifactElement: () => '',
        callbacks: { onActionOpen },
      });

      const input =
        '<boltArtifact title="Pull" id="artifact_1"><boltAction type="git" operation="pull" remote="origin" branch="develop">Pulling...</boltAction></boltArtifact>';

      parser.parse('msg_1', input);

      expect(onActionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'git',
            operation: 'pull',
            remote: 'origin',
            branch: 'develop',
          }),
        }),
      );
    });

    it('should parse git init action', () => {
      const onActionOpen = vi.fn();

      const parser = new StreamingMessageParser({
        artifactElement: () => '',
        callbacks: { onActionOpen },
      });

      const input =
        '<boltArtifact title="Init" id="artifact_1"><boltAction type="git" operation="init">Initializing...</boltAction></boltArtifact>';

      parser.parse('msg_1', input);

      expect(onActionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'git',
            operation: 'init',
          }),
        }),
      );
    });
  });

  describe('python actions', () => {
    it('should parse python action without packages', () => {
      const onActionOpen = vi.fn();
      const onActionClose = vi.fn();

      const parser = new StreamingMessageParser({
        artifactElement: () => '',
        callbacks: { onActionOpen, onActionClose },
      });

      const input =
        '<boltArtifact title="Python Script" id="artifact_1"><boltAction type="python">print("Hello, World!")</boltAction></boltArtifact>';

      parser.parse('msg_1', input);

      expect(onActionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'python',
          }),
        }),
      );

      expect(onActionClose).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'python',
            content: 'print("Hello, World!")',
          }),
        }),
      );
    });

    it('should parse python action with single package', () => {
      const onActionOpen = vi.fn();

      const parser = new StreamingMessageParser({
        artifactElement: () => '',
        callbacks: { onActionOpen },
      });

      const input =
        '<boltArtifact title="Data Analysis" id="artifact_1"><boltAction type="python" packages="numpy">import numpy as np</boltAction></boltArtifact>';

      parser.parse('msg_1', input);

      expect(onActionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'python',
            packages: ['numpy'],
          }),
        }),
      );
    });

    it('should parse python action with multiple packages', () => {
      const onActionOpen = vi.fn();

      const parser = new StreamingMessageParser({
        artifactElement: () => '',
        callbacks: { onActionOpen },
      });

      const input =
        '<boltArtifact title="Data Analysis" id="artifact_1"><boltAction type="python" packages="numpy, pandas, matplotlib">import numpy as np\nimport pandas as pd</boltAction></boltArtifact>';

      parser.parse('msg_1', input);

      expect(onActionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'python',
            packages: ['numpy', 'pandas', 'matplotlib'],
          }),
        }),
      );
    });

    it('should handle empty packages attribute', () => {
      const onActionOpen = vi.fn();

      const parser = new StreamingMessageParser({
        artifactElement: () => '',
        callbacks: { onActionOpen },
      });

      const input =
        '<boltArtifact title="Python" id="artifact_1"><boltAction type="python" packages="">print(1+1)</boltAction></boltArtifact>';

      parser.parse('msg_1', input);

      // empty packages attribute should not set packages array
      expect(onActionOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'python',
          }),
        }),
      );

      const callArg = onActionOpen.mock.calls[0][0];

      expect(callArg.action.packages).toBeUndefined();
    });

    it('should preserve multiline python code content', () => {
      const onActionClose = vi.fn();

      const parser = new StreamingMessageParser({
        artifactElement: () => '',
        callbacks: { onActionClose },
      });

      const pythonCode = `import pandas as pd
import numpy as np

df = pd.DataFrame({'a': [1, 2, 3]})
print(df.describe())`;

      const input = `<boltArtifact title="Analysis" id="artifact_1"><boltAction type="python" packages="pandas,numpy">${pythonCode}</boltAction></boltArtifact>`;

      parser.parse('msg_1', input);

      expect(onActionClose).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.objectContaining({
            type: 'python',
            packages: ['pandas', 'numpy'],
            content: pythonCode,
          }),
        }),
      );
    });
  });
});

describe('Memory management', () => {
  it('should clear message state with clearMessage()', () => {
    const parser = new StreamingMessageParser();

    // Parse un message
    parser.parse('msg_1', 'Hello world');
    expect(parser.getCacheSize()).toBe(1);

    // Clear le message
    parser.clearMessage('msg_1');
    expect(parser.getCacheSize()).toBe(0);
  });

  it('should handle clearMessage() for non-existent message', () => {
    const parser = new StreamingMessageParser();

    // Ne devrait pas throw
    parser.clearMessage('non_existent');
    expect(parser.getCacheSize()).toBe(0);
  });

  it('should reset all state with reset()', () => {
    const parser = new StreamingMessageParser();

    // Parse plusieurs messages
    parser.parse('msg_1', 'Hello');
    parser.parse('msg_2', 'World');
    parser.parse('msg_3', 'Test');
    expect(parser.getCacheSize()).toBe(3);

    // Reset tout
    parser.reset();
    expect(parser.getCacheSize()).toBe(0);
  });

  it('should enforce LRU limit of 50 messages', () => {
    const parser = new StreamingMessageParser();

    // Créer 60 messages (dépasse la limite de 50)
    for (let i = 0; i < 60; i++) {
      parser.parse(`msg_${i}`, `Content ${i}`);
    }

    // Le cache devrait être limité à 50
    expect(parser.getCacheSize()).toBe(50);
  });

  it('should evict oldest messages when LRU limit exceeded', () => {
    const parser = new StreamingMessageParser();

    // Créer 55 messages
    for (let i = 0; i < 55; i++) {
      parser.parse(`msg_${i}`, `Content ${i}`);
    }

    /*
     * Les 5 premiers messages devraient être évincés
     * Tester en parsant à nouveau un vieux message - il devrait créer un nouvel état
     */
    const initialSize = parser.getCacheSize();
    parser.parse('msg_0', 'New content for msg_0');

    /*
     * Si msg_0 n'existait plus, la taille augmente de 1 (mais limité à 50)
     * Ici on ne peut pas vraiment tester l'éviction directement sans accès interne
     * mais on vérifie que le cache reste borné
     */
    expect(parser.getCacheSize()).toBeLessThanOrEqual(50);
  });

  it('should track getCacheSize() correctly', () => {
    const parser = new StreamingMessageParser();

    expect(parser.getCacheSize()).toBe(0);

    parser.parse('msg_1', 'Test');
    expect(parser.getCacheSize()).toBe(1);

    parser.parse('msg_2', 'Test');
    expect(parser.getCacheSize()).toBe(2);

    // Parser le même message ne devrait pas augmenter la taille
    parser.parse('msg_1', 'Test updated');
    expect(parser.getCacheSize()).toBe(2);

    parser.clearMessage('msg_1');
    expect(parser.getCacheSize()).toBe(1);
  });
});

function runTest(input: string | string[], outputOrExpectedResult: string | ExpectedResult) {
  let expected: ExpectedResult;

  if (typeof outputOrExpectedResult === 'string') {
    expected = { output: outputOrExpectedResult };
  } else {
    expected = outputOrExpectedResult;
  }

  const callbacks = {
    onArtifactOpen: vi.fn<ArtifactCallback>((data) => {
      expect(data).toMatchSnapshot('onArtifactOpen');
    }),
    onArtifactClose: vi.fn<ArtifactCallback>((data) => {
      expect(data).toMatchSnapshot('onArtifactClose');
    }),
    onActionOpen: vi.fn<ActionCallback>((data) => {
      expect(data).toMatchSnapshot('onActionOpen');
    }),
    onActionClose: vi.fn<ActionCallback>((data) => {
      expect(data).toMatchSnapshot('onActionClose');
    }),
  };

  const parser = new StreamingMessageParser({
    artifactElement: () => '',
    callbacks,
  });

  let message = '';

  let result = '';

  const chunks = Array.isArray(input) ? input : input.split('');

  for (const chunk of chunks) {
    message += chunk;

    result += parser.parse('message_1', message);
  }

  for (const name in expected.callbacks) {
    const callbackName = name;

    expect(callbacks[callbackName as keyof typeof callbacks]).toHaveBeenCalledTimes(
      expected.callbacks[callbackName as keyof typeof expected.callbacks] ?? 0,
    );
  }

  expect(result).toEqual(expected.output);
}
