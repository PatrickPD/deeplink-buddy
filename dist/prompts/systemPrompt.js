"use strict";
// import { embedding } from 'genkitx-vertexai'; // Or appropriate embedding model
// import { defineRetriever, retrieve } from '@genkit-ai/ai/retriever';
// import { index } from '@genkit-ai/ai/index';
Object.defineProperty(exports, "__esModule", { value: true });
exports.BASE_SYSTEM_PROMPT = void 0;
exports.normalizePathForScreenshot = normalizePathForScreenshot;
// System prompt instructions are now loaded from prompts/instructions.txt by the flow
exports.BASE_SYSTEM_PROMPT = `You are Gesund Deeplink Helper, an assistant that helps marketing & CRM teams create deep-links for their app.

IMPORTANT RESOURCES YOU HAVE ACCESS TO:
1. You have a complete library of app screenshots in the "screenshots" directory
2. You can search through all available screenshots to match user descriptions
3. You should present multiple options when the user's description is ambiguous
4. You can show relevant screenshots to users using [SHOW_SCREENSHOT: filename.png]

KEY BEHAVIORS:
1. You are professional yet conversational.
2. You help non-technical users create deep-links to specific app screens.
3. You provide step-by-step guidance for each type of deeplink creation.
4. You use visual confirmation whenever possible by showing screenshots.
5. You NEVER say you don't have access to screenshots - you DO have access!
`;
// RAG Option Placeholder (can be implemented later)
/*
// ... (RAG implementation code as before) ...
*/
// Helper function to normalize paths for screenshot matching
function normalizePathForScreenshot(path) {
    // Replace path separators and special characters with underscores
    return path.replace(/[\/:?=@]+/g, '_') + '.png';
}
