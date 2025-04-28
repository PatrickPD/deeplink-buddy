import { gemini15Flash } from '@genkit-ai/vertexai'; // Corrected model import
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
// ToolAction needed for tool variable types 
// Import Genkit, flow types, context, message types
import { ActionContext } from '@genkit-ai/core';
import { Genkit, MessageData } from 'genkit';

// --- Ensure these imports are correct based on your file structure ---
import { BASE_SYSTEM_PROMPT } from '../prompts/systemPrompt';
import { createDeliverableGeneratorTool } from '../tools/deliverableGenerator';
import { createParameterExtractorTool } from '../tools/parameterExtractor';
import { createScreenResolverTool } from '../tools/screenResolver';
// --- End Imports ---

// Function to load instructions (cached)
let loadedInstructions: string | null = null;
let instructionLoadError: string | null = null;

function getInstructions(): string {
    if (loadedInstructions !== null) {
        return loadedInstructions;
    }
    if (instructionLoadError !== null) {
        return instructionLoadError; // Return cached error message
    }
    try {
        const instructionsPath = path.resolve(__dirname, '../prompts/instructions.txt');
        console.log(`Attempting to load instructions from: ${instructionsPath}`);
        if (!fs.existsSync(instructionsPath)) {
            throw new Error(`File not found at resolved path: ${instructionsPath}. Check build process or path resolution.`);
        }
        loadedInstructions = fs.readFileSync(instructionsPath, 'utf-8');
        console.log("Instructions loaded successfully.");
        return loadedInstructions;
    } catch (error: any) {
        console.error(`FATAL: Failed to load instructions.txt: ${error.message}`);
        instructionLoadError = "Error: Could not load critical system instructions. Functionality may be impaired.";
        return instructionLoadError;
    }
}

// Define Flow Input and Output schemas
const FlowInputSchema = z.string().describe("Initial user query or subsequent input");
const FlowOutputSchema = z.string().describe("Final deliverable or response to user");

// Export a factory function that creates the flow
export function createDeeplinkHelperFlow(aiInstance: Genkit) {

    const deliverableGeneratorTool = createDeliverableGeneratorTool(aiInstance);
    const parameterExtractorTool = createParameterExtractorTool(aiInstance);
    const screenResolverTool = createScreenResolverTool(aiInstance);

    // Define flow without state generics
    return aiInstance.defineFlow(
        {
            name: 'deeplinkHelperFlow',
            inputSchema: FlowInputSchema,
            outputSchema: FlowOutputSchema,
        },
        // Explicitly type context as ActionContext (now stateless)
        async (userInput: string, context: ActionContext): Promise<string> => {
            console.log(`[deeplinkHelperFlow] Turn Start. Input: "${userInput}"`);

            const instructions = getInstructions();
            if (instructions.startsWith("Error:")) {
                return instructions;
            }

            console.log("[deeplinkHelperFlow] Simplified state (stateless flow)");

            // Simplified system prompt without state details
            const systemInstructions = `
${BASE_SYSTEM_PROMPT}

**Core Instructions:**
${instructions}

**Task:**
Based on the instructions and the user's input, determine the next single action required. Generate the required response or tool call.
`;

            console.log("[deeplinkHelperFlow] Generating LLM response...");
            try {
                // Construct messages without relying on stateful history
                const messages: MessageData[] = [
                    { role: 'system', content: [{ text: systemInstructions }] },
                    { role: 'user', content: [{ text: userInput }] } // Only use current input
                ];

                const llmResponse = await aiInstance.generate({
                    messages: messages,
                    model: gemini15Flash,
                    // Disable tools again to prevent schema conversion crash
                    tools: [screenResolverTool, parameterExtractorTool, deliverableGeneratorTool],
                    config: { temperature: 0.1 },
                });

                const responseContent = llmResponse.text ?? "";

                let finalResponse = responseContent;

                // Simplified return - just the LLM text response
                console.log("[deeplinkHelperFlow] Stateless flow returning LLM response.");
                return finalResponse;

            } catch (error: any) {
                console.error("[deeplinkHelperFlow] Error during turn processing:", error);
                // Return the specific error message if possible
                const errorMessage = error.message || "An unknown error occurred";
                return `Sorry, an error occurred: ${errorMessage}`;
            }
        }
    );
}