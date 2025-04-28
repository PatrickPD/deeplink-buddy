// import { embedding } from 'genkitx-vertexai'; // Or appropriate embedding model
// import { defineRetriever, retrieve } from '@genkit-ai/ai/retriever';
// import { index } from '@genkit-ai/ai/index';

// System prompt instructions are now loaded from prompts/instructions.txt by the flow
export const BASE_SYSTEM_PROMPT = `
You are the Gesund Deeplink Helper.
Your main instructions are provided separately.
Refer to the conversation history, internal state, and available tools to fulfill the user's request according to the defined Conversation Flow.
Always prioritize confirming the target screen before asking for parameters.
Use provided reference data when needed.
`;

// RAG Option Placeholder (can be implemented later)
/*
// ... (RAG implementation code as before) ...
*/

// Helper function to normalize path for screenshot lookup
export function normalizePathForScreenshot(path: string): string {
    if (!path) return '';
    // Remove leading slashes, querystrings
    let normalized = path.replace(/^\/+/, '').split('?')[0]; // Corrected regex: remove one or more leading slashes
    // Replace special chars with underscore
    normalized = normalized.replace(/[/\\?:=@]/g, '_');
    // Remove trailing underscore if any resulted
    normalized = normalized.replace(/_$/, '');
    return `${normalized}.png`;
} 