/**
 * Message type for chat conversations.
 *
 * This is a local type definition that maintains compatibility with the
 * message format used throughout the application. The AI SDK 6.x changed
 * from `Message` to `UIMessage` with a different structure, so we define
 * our own type for backward compatibility.
 */

export interface ToolInvocation {
  state: 'partial-call' | 'call' | 'result';
  toolCallId: string;
  toolName: string;
  args?: unknown;
  result?: unknown;
}

export interface Message {
  id?: string;
  role: 'system' | 'user' | 'assistant' | 'data';
  content: string;
  createdAt?: Date;
  toolInvocations?: ToolInvocation[];
  experimental_attachments?: Array<{
    name?: string;
    contentType?: string;
    url: string;
  }>;
}

export type Messages = Message[];
