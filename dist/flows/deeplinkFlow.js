"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeeplinkHelperFlow = createDeeplinkHelperFlow;
const vertexai_1 = require("@genkit-ai/vertexai"); // Corrected model import
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
// --- Ensure these imports are correct based on your file structure ---
const systemPrompt_1 = require("../prompts/systemPrompt");
const deliverableGenerator_1 = require("../tools/deliverableGenerator");
const parameterExtractor_1 = require("../tools/parameterExtractor");
const screenResolver_1 = require("../tools/screenResolver");
// --- End Imports ---
// Function to load instructions (cached)
let loadedInstructions = null;
let instructionLoadError = null;
function getInstructions() {
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
    }
    catch (error) {
        console.error(`FATAL: Failed to load instructions.txt: ${error.message}`);
        instructionLoadError = "Error: Could not load critical system instructions. Functionality may be impaired.";
        return instructionLoadError;
    }
}
// Define Flow Input and Output schemas
const FlowInputSchema = zod_1.z.string().describe("Initial user query or subsequent input");
const FlowOutputSchema = zod_1.z.string().describe("Final deliverable or response to user");
// Export a factory function that creates the flow
function createDeeplinkHelperFlow(aiInstance) {
    const deliverableGeneratorTool = (0, deliverableGenerator_1.createDeliverableGeneratorTool)(aiInstance);
    const parameterExtractorTool = (0, parameterExtractor_1.createParameterExtractorTool)(aiInstance);
    const screenResolverTool = (0, screenResolver_1.createScreenResolverTool)(aiInstance);
    // Define flow without state generics
    return aiInstance.defineFlow({
        name: 'deeplinkHelperFlow',
        inputSchema: FlowInputSchema,
        outputSchema: FlowOutputSchema,
    }, 
    // Explicitly type context as ActionContext (now stateless)
    async (userInput, context) => {
        console.log(`[deeplinkHelperFlow] Turn Start. Input: "${userInput}"`);
        const instructions = getInstructions();
        if (instructions.startsWith("Error:")) {
            return instructions;
        }
        console.log("[deeplinkHelperFlow] Simplified state (stateless flow)");
        // Simplified system prompt without state details
        const systemInstructions = `
${systemPrompt_1.BASE_SYSTEM_PROMPT}

**Core Instructions:**
${instructions}

**Task:**
Based on the instructions and the user's input, determine the next single action required. Generate the required response or tool call.
`;
        console.log("[deeplinkHelperFlow] Generating LLM response...");
        try {
            // Construct messages without relying on stateful history
            const messages = [
                { role: 'system', content: [{ text: systemInstructions }] },
                { role: 'user', content: [{ text: userInput }] } // Only use current input
            ];
            const llmResponse = await aiInstance.generate({
                messages: messages,
                model: vertexai_1.gemini15Flash,
                // Disable tools again to prevent schema conversion crash
                tools: [screenResolverTool, parameterExtractorTool, deliverableGeneratorTool],
                config: { temperature: 0.1 },
            });
            const responseContent = llmResponse.text ?? "";
            let finalResponse = responseContent;
            // Simplified return - just the LLM text response
            console.log("[deeplinkHelperFlow] Stateless flow returning LLM response.");
            return finalResponse;
        }
        catch (error) {
            console.error("[deeplinkHelperFlow] Error during turn processing:", error);
            // Return the specific error message if possible
            const errorMessage = error.message || "An unknown error occurred";
            return `Sorry, an error occurred: ${errorMessage}`;
        }
    });
}
