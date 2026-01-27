import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { modificationsRegex } from '~/utils/diff';
import { Markdown } from './Markdown';

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
  onSaveEdit?: (index: number, newContent: string) => void;
  onDelete?: (index: number) => void;
}

export const UserMessage = memo(({ content, messageIndex, onSaveEdit, onDelete }: UserMessageProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Get text content for copy action
  const getTextContent = useCallback((): string => {
    if (Array.isArray(content)) {
      const textParts = content.filter((part): part is TextPart => part.type === 'text');
      return textParts.map((part) => part.text).join('\n');
    }

    return content;
  }, [content]);

  // PERF FIX: Wrap handlers in useCallback to avoid re-renders
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(getTextContent());
  }, [getTextContent]);

  const handleStartEdit = useCallback(() => {
    // Use sanitized content (without file modifications) for editing
    setEditedContent(sanitizeUserMessage(getTextContent()));
    setIsEditing(true);
  }, [getTextContent]);

  const handleCancelEdit = useCallback(() => {
    setIsEditing(false);
    setEditedContent('');
  }, []);

  const handleSaveEdit = useCallback(() => {
    const trimmedContent = editedContent.trim();
    const originalContent = sanitizeUserMessage(getTextContent());
    if (trimmedContent && trimmedContent !== originalContent) {
      onSaveEdit?.(messageIndex, trimmedContent);
    }
    setIsEditing(false);
    setEditedContent('');
  }, [editedContent, getTextContent, messageIndex, onSaveEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  }, [handleSaveEdit, handleCancelEdit]);

  const handleBlur = useCallback(() => {
    handleCancelEdit();
  }, [handleCancelEdit]);

  // Auto-focus and auto-resize textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
      // Place cursor at end
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  // Auto-resize textarea on content change
  // PERF FIX: Wrap in useCallback
  const handleTextareaChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedContent(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  }, []);

  // handle multimodal content (array of parts)
  if (Array.isArray(content)) {
    const imageParts = content.filter((part): part is ImagePart => part.type === 'image');
    const textParts = content.filter((part): part is TextPart => part.type === 'text');
    const textContent = textParts.map((part) => part.text).join('\n');

    return (
      <div className="group/message">
        {/* Message content */}
        <div className="px-3.5 py-3 bg-bolt-elements-messages-background border border-bolt-elements-borderColor rounded-[10px] transition-colors duration-150 group-hover/message:border-[rgba(255,255,255,0.1)]">
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
          {/* Display text or edit textarea */}
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editedContent}
              onChange={handleTextareaChange}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent text-sm leading-relaxed text-bolt-elements-textPrimary resize-none outline-none"
              placeholder="Votre message..."
            />
          ) : (
            textContent && (
              <div className="text-sm leading-relaxed text-bolt-elements-textPrimary">
                <Markdown limitedMarkdown>{sanitizeUserMessage(textContent)}</Markdown>
              </div>
            )
          )}
        </div>

        {/* Footer with actions or edit hints */}
        <div className="flex items-center justify-between mt-1.5 px-1">
          {isEditing ? (
            <span className="text-[0.65rem] text-bolt-elements-textTertiary">
              Entrée pour envoyer · Échap pour annuler
            </span>
          ) : (
            <>
              <span className="text-[0.65rem] text-bolt-elements-textTertiary opacity-0 group-hover/message:opacity-100 transition-opacity">
                Vous
              </span>
              <div className="flex gap-0.5 opacity-0 group-hover/message:opacity-100 transition-opacity">
                <button
                  onClick={handleStartEdit}
                  className="px-2 py-1 text-[0.65rem] text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 rounded transition-colors"
                >
                  Modifier
                </button>
                <button
                  onClick={handleCopy}
                  className="px-2 py-1 text-[0.65rem] text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 rounded transition-colors"
                >
                  Copier
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // handle string content (text-only message)
  return (
    <div className="group/message">
      {/* Message content */}
      <div className="px-3.5 py-3 bg-bolt-elements-messages-background border border-bolt-elements-borderColor rounded-[10px] transition-colors duration-150 group-hover/message:border-[rgba(255,255,255,0.1)]">
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editedContent}
            onChange={handleTextareaChange}
            onKeyDown={handleKeyDown}
            className="w-full bg-transparent text-sm leading-relaxed text-bolt-elements-textPrimary resize-none outline-none"
            placeholder="Votre message..."
            onBlur={handleBlur}
          />
        ) : (
          <div className="text-sm leading-relaxed text-bolt-elements-textPrimary">
            <Markdown limitedMarkdown>{sanitizeUserMessage(content)}</Markdown>
          </div>
        )}
      </div>

      {/* Footer with actions or edit hints */}
      <div className="flex items-center justify-between mt-1.5 px-1">
        {isEditing ? (
          <span className="text-[0.65rem] text-bolt-elements-textTertiary">
            Entrée pour envoyer · Échap pour annuler
          </span>
        ) : (
          <>
            <span className="text-[0.65rem] text-bolt-elements-textTertiary opacity-0 group-hover/message:opacity-100 transition-opacity">
              Vous
            </span>
            <div className="flex gap-0.5 opacity-0 group-hover/message:opacity-100 transition-opacity">
              <button
                onClick={handleStartEdit}
                className="px-2 py-1 text-[0.65rem] text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 rounded transition-colors"
              >
                Modifier
              </button>
              <button
                onClick={handleCopy}
                className="px-2 py-1 text-[0.65rem] text-bolt-elements-textTertiary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3 rounded transition-colors"
              >
                Copier
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

UserMessage.displayName = 'UserMessage';

function sanitizeUserMessage(content: string) {
  return content.replace(modificationsRegex, '').trim();
}
