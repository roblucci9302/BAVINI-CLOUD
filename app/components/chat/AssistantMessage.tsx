import { memo } from 'react';
import { Markdown } from './Markdown';
import { FloatingMessageActions } from './MessageActions';

interface AssistantMessageProps {
  content: string;
  messageIndex: number;
  isLast?: boolean;
  isStreaming?: boolean;
  onRegenerate?: (index: number) => void;
}

export const AssistantMessage = memo(
  ({ content, messageIndex, isLast = false, isStreaming = false, onRegenerate }: AssistantMessageProps) => {
    return (
      <div className="relative w-full min-w-0 group/message">
        <FloatingMessageActions
          role="assistant"
          messageIndex={messageIndex}
          content={content}
          onRegenerate={onRegenerate}
          isLast={isLast}
          isStreaming={isStreaming}
          position="top-right"
        />
        <div className="pr-16">
          <Markdown html>{content}</Markdown>
        </div>
      </div>
    );
  },
);

AssistantMessage.displayName = 'AssistantMessage';
