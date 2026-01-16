import { memo } from 'react';
import { modificationsRegex } from '~/utils/diff';
import { Markdown } from './Markdown';
import { FloatingMessageActions } from './MessageActions';

// content part types for multimodal messages
interface TextPart {
  type: 'text';
  text: string;
}

interface ImagePart {
  type: 'image';
  image: string;
}

type ContentPart = TextPart | ImagePart;

interface UserMessageProps {
  content: string | ContentPart[];
  messageIndex: number;
  onEdit?: (index: number) => void;
  onDelete?: (index: number) => void;
}

export const UserMessage = memo(({ content, messageIndex, onEdit, onDelete }: UserMessageProps) => {
  // Get text content for copy action
  const getTextContent = (): string => {
    if (Array.isArray(content)) {
      const textParts = content.filter((part): part is TextPart => part.type === 'text');
      return textParts.map((part) => part.text).join('\n');
    }

    return content;
  };

  // handle multimodal content (array of parts)
  if (Array.isArray(content)) {
    const imageParts = content.filter((part): part is ImagePart => part.type === 'image');
    const textParts = content.filter((part): part is TextPart => part.type === 'text');
    const textContent = textParts.map((part) => part.text).join('\n');

    return (
      <div className="relative min-w-0 pt-[4px] group/message">
        <FloatingMessageActions
          role="user"
          messageIndex={messageIndex}
          content={getTextContent()}
          onEdit={onEdit}
          onDelete={onDelete}
          position="top-right"
        />
        <div className="pr-20">
          {/* Display images */}
          {imageParts.length > 0 && (
            <div className="flex gap-2 mb-3 flex-wrap">
              {imageParts.map((imagePart, index) => (
                <img
                  key={index}
                  src={imagePart.image}
                  alt={`Image ${index + 1}`}
                  className="max-w-[200px] max-h-[200px] object-contain rounded-lg border border-bolt-elements-borderColor flex-shrink-0"
                />
              ))}
            </div>
          )}
          {/* Display text */}
          {textContent && <Markdown limitedMarkdown>{sanitizeUserMessage(textContent)}</Markdown>}
        </div>
      </div>
    );
  }

  // handle string content (text-only message)
  return (
    <div className="relative min-w-0 pt-[4px] group/message">
      <FloatingMessageActions
        role="user"
        messageIndex={messageIndex}
        content={getTextContent()}
        onEdit={onEdit}
        onDelete={onDelete}
        position="top-right"
      />
      <div className="pr-20">
        <Markdown limitedMarkdown>{sanitizeUserMessage(content)}</Markdown>
      </div>
    </div>
  );
});

UserMessage.displayName = 'UserMessage';

function sanitizeUserMessage(content: string) {
  return content.replace(modificationsRegex, '').trim();
}
