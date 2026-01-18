'use client';

import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { createScopedLogger } from '~/utils/logger';
import { rehypePlugins, remarkPlugins, allowedHTMLElements } from '~/utils/markdown';
import { Artifact } from './Artifact';
import { CodeBlock } from './CodeBlock.lazy';

import styles from './Markdown.module.scss';

const logger = createScopedLogger('MarkdownComponent');

interface MarkdownProps {
  children: string;
  html?: boolean;
  limitedMarkdown?: boolean;
}

export const Markdown = memo(({ children, html = false, limitedMarkdown = false }: MarkdownProps) => {

  // Memoize plugins to prevent unnecessary re-parsing
  const memoizedRemarkPlugins = useMemo(() => remarkPlugins(limitedMarkdown), [limitedMarkdown]);
  const memoizedRehypePlugins = useMemo(() => rehypePlugins(html), [html]);

  const components = useMemo(() => {
    return {
      div: ({ className, children, node, ...props }) => {
        if (className?.includes('__boltArtifact__')) {
          // Try multiple ways to get messageId (React Markdown may use different formats)
          const properties = node?.properties || {};
          const messageId = (properties.dataMessageId || // camelCase (rehype default)
            properties['data-message-id'] || // kebab-case (raw HTML)
            (props as Record<string, unknown>)['data-message-id'] || // from props
            (props as Record<string, unknown>).dataMessageId) as string | undefined; // camelCase in props

          if (!messageId) {
            logger.error('Invalid message id for artifact', { properties, props });
            return null; // Don't crash, just don't render
          }

          return <Artifact messageId={messageId} />;
        }

        return (
          <div className={className} {...props}>
            {children}
          </div>
        );
      },
      pre: (props) => {
        const { children, node, ...rest } = props;

        const [firstChild] = node?.children ?? [];

        if (
          firstChild &&
          firstChild.type === 'element' &&
          firstChild.tagName === 'code' &&
          firstChild.children[0].type === 'text'
        ) {
          const { className, ...rest } = firstChild.properties;
          const [, language = 'plaintext'] = /language-(\w+)/.exec(String(className) || '') ?? [];

          return <CodeBlock code={firstChild.children[0].value} language={language} {...rest} />;
        }

        return <pre {...rest}>{children}</pre>;
      },
    } satisfies Components;
  }, []);

  return (
    <ReactMarkdown
      allowedElements={allowedHTMLElements}
      className={styles.MarkdownContent}
      components={components}
      remarkPlugins={memoizedRemarkPlugins}
      rehypePlugins={memoizedRehypePlugins}
    >
      {children}
    </ReactMarkdown>
  );
});
