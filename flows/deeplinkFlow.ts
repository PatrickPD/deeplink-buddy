import { gemini15Flash } from '@genkit-ai/vertexai';
import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
// Import Genkit, flow types, context, message types, and tools
import { Genkit, MessageData } from 'genkit';
import { BASE_SYSTEM_PROMPT } from '../prompts/systemPrompt';
import { createDeliverableGeneratorTool } from '../tools/deliverableGenerator';
import { createParameterExtractorTool } from '../tools/parameterExtractor';
import { createScreenResolverTool } from '../tools/screenResolver';

// Define schemas for the flow
const FlowInputSchema = z.string().describe("User's message");
const FlowOutputSchema = z.string().describe("Agent's response");

// --- State Definition ---
interface DeeplinkFlowState {
    step: 'start' | 'objective_clarified' | 'path_identified' | 'screen_confirmation_pending' | 'screen_confirmed' | 'parameter_extraction_pending' | 'url_request_pending' | 'parameter_confirmation_pending' | 'parameters_confirmed' | 'deliverable_generation_pending' | 'deliverable_generated' | 'ui_guidance_pending' | 'ui_guided' | 'testing_pending' | 'final_confirmation_pending' | 'complete' | 'error';
    history: MessageData[];
    userObjective?: 'adjust_link' | 'qr_code' | 'push_payload' | 'unknown';
    userScreenDescription?: string;
    identifiedPathTemplate?: string;
    identifiedScreenshotFile?: string | null;
    requiredParams?: string[];
    extractedParams?: Record<string, string>;
    parameterToExtract?: string | null;
    parameterConfirmationPending?: { paramName: string; extractedValue: string } | null;
    deliverableType?: 'adjust_link' | 'qr_code' | 'push_payload';
    generatedDeliverable?: string;
    errorMessage?: string;
    potentialMatches?: Array<{ path: string; screenshotFile?: string; requiredParams: string[] }>;
}

const initialState: DeeplinkFlowState = {
    step: 'start',
    history: [],
    extractedParams: {},
};
// --- End State Definition ---


// --- getInstructions & loadInstructions ---
let loadedInstructions: string | null = null;
let instructionLoadError: string | null = null;
function getInstructions(): string {
    if (loadedInstructions !== null) return loadedInstructions;
    if (instructionLoadError !== null) return instructionLoadError;
    try {
        const instructionsPath = path.resolve(__dirname, '../prompts/instructions.txt');
        console.log(`Attempting to load instructions from: ${instructionsPath}`);
        if (!fs.existsSync(instructionsPath)) {
            throw new Error(`File not found: ${instructionsPath}`);
        }
        loadedInstructions = fs.readFileSync(instructionsPath, 'utf-8');
        console.log("Instructions loaded successfully.");
        return loadedInstructions;
    } catch (error: any) {
        console.error(`FATAL: Failed to load instructions.txt: ${error.message}`);
        instructionLoadError = "Error: Could not load critical system instructions.";
        return instructionLoadError;
    }
}

function getUserFriendlyParamName(paramName: string): string {
    return paramName.replace(':', '').replace('?', '').replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()).trim(); // Simple conversion
}

// Helper to find the next missing parameter
const findNextMissingParam = (state: DeeplinkFlowState): string | null => {
    return state.requiredParams?.find(p => !state.extractedParams?.[p]) ?? null;
};

// --- getStepInstructions ---
function getStepInstructions(step: DeeplinkFlowState['step'], state: DeeplinkFlowState): string {
    const fullInstructions = getInstructions();
    if (fullInstructions.startsWith("Error:")) return fullInstructions;

    let relevantInstructions = "";
    switch (step) {
        case 'start':
            relevantInstructions = `
            **Current Goal:** Start conversation, clarify objective (Adjust link, QR, push?).
            **Reference:** Conv Flow Step 1.
            **Action:** Greet, ask objective.
            **Example:** "Hi! How can I help you create a deeplink today?"`;
            break;
        case 'objective_clarified':
            relevantInstructions = `
            **Current Goal:** Get screen description.
            **Reference:** Conv Flow Step 2.
            **Context:** Objective='${state.userObjective || 'unknown'}'. Previous screen was rejected: ${state.identifiedPathTemplate ? 'Yes' : 'No'}
            **Action:** ${state.identifiedPathTemplate ? 'The user rejected the previous suggestion. Ask for a clearer description of what they want.' : 'Ask user to describe the screen. Encourage them to upload a screenshot if possible.'}
            **Example:** ${state.identifiedPathTemplate ? '"I see the previous screen wasn\'t what you needed. Could you describe the specific screen you want to link to in more detail? For example, is it a product detail page, a category list, a shopping cart, etc? If possible, you can also upload a screenshot of the screen you want."' : '"Could you describe the screen in the app you want this to link to? If possible, uploading a screenshot would be very helpful for accurate identification."'}`;
            break;
        case 'path_identified':
            relevantInstructions = `
             **Current Goal:** Prepare screen confirmation message (text +/- screenshot).
             **Reference:** Conv Flow Step 3, Safeguard Visual Confirmation.
             **Context:** Path='${state.identifiedPathTemplate || 'None'}', Screenshot='${state.identifiedScreenshotFile || 'None'}'.
             **Action:** Generate the confirmation question based on context. Use '[SHOW_SCREENSHOT:]' marker if applicable. **Do NOT ask for parameters.**
             **Output:** Confirmation message ONLY.`;
            break;
        case 'screen_confirmation_pending':
            relevantInstructions = `
             **Current Goal:** Process user's screen confirmation.
             **Reference:** Conv Flow Step 3 (End).
             **Context:** Awaiting yes/no for screen '${state.identifiedPathTemplate || 'None'}'.
             **Action:** ONLY analyze if the user confirmed or denied the screen. DO NOT proceed to parameter extraction or other steps.
             **CRITICAL:** If the user's message indicates this is NOT the right screen, you MUST acknowledge that and say you'll ask for more details about what they need. DO NOT ask for any parameters or IDs. The conversation MUST go back to asking for screen description.
             **Example Denial Response:** "I understand this isn't the right screen. Let's try again. Could you describe the screen you need in more detail?"
             **Output:** ONLY acknowledgement of confirmation/denial.`;
            break;
        case 'parameter_extraction_pending':
            const paramToAsk = state.parameterToExtract || findNextMissingParam(state);
            state.parameterToExtract = paramToAsk; // Ensure it's set
            if (!paramToAsk) {
                relevantInstructions = `Error: In parameter_extraction_pending but no missing required parameters found. Proceeding to parameters_confirmed.`;
                state.step = 'parameters_confirmed';
            } else {
                const friendlyName = getUserFriendlyParamName(paramToAsk);
                relevantInstructions = `
                **Current Goal:** Ask for parameter '${friendlyName}'.
                **Reference:** Conv Flow Step 4, Safeguard Parameter Handling.
                **Context:** Screen='${state.identifiedPathTemplate}'. Seeking '${paramToAsk}'.
                **Action:** Ask user for '${friendlyName}'. Mention URL option for IDs.
                **Output:** Question for the parameter value or URL.`;
            }
            break;
        case 'url_request_pending':
            const paramFromUrl = state.parameterToExtract;
            const url = state.history[state.history.length - 1]?.content[0]?.text;
            if (!paramFromUrl) {
                relevantInstructions = `Error: url_request_pending state inconsistency. Returning to parameter extraction.`;
                state.step = 'parameter_extraction_pending';
            } else {
                relevantInstructions = `
                 **Current Goal:** Extract '${paramFromUrl}' from URL.
                 **Reference:** Safeguard URL Extraction.
                 **Context:** User provided URL: ${url}. Seeking '${paramFromUrl}'.
                 **Action:** Request use of 'parameterExtractorTool' with URL and param name.
                 **Output:** Tool call request for parameterExtractorTool.`;
            }
            break;
        case 'parameter_confirmation_pending':
            const pInfo = state.parameterConfirmationPending;
            if (!pInfo) {
                relevantInstructions = `Error: parameter_confirmation_pending state inconsistency. Returning to parameter extraction.`;
                state.step = 'parameter_extraction_pending';
            } else {
                relevantInstructions = `
                 **Current Goal:** Process user's confirmation for extracted value '${pInfo.extractedValue}'.
                 **Reference:** Safeguard Confirm extracted ID.
                 **Context:** Awaiting yes/no for param '${pInfo.paramName}'.
                 **Action:** Analyze last user message. State next step (more params? generation?). If denied, state asking again.
                 **Output:** Acknowledgement and next step statement.`;
            }
            break;
        case 'parameters_confirmed':
            relevantInstructions = `
             **Current Goal:** Trigger deliverable generation.
             **Reference:** Conv Flow Step 5.
             **Context:** Objective='${state.userObjective}'. Path='${state.identifiedPathTemplate}'. Params=${JSON.stringify(state.extractedParams || {})}.
             **Action:** Request use of 'deliverableGeneratorTool'.
             **Output:** Tool call request for deliverableGeneratorTool.`;
            break;
        case 'deliverable_generation_pending':
            relevantInstructions = `Generating deliverable...`;
            break;
        case 'deliverable_generated':
            relevantInstructions = `
             **Current Goal:** Present deliverable, ask about testing/UI steps.
             **Reference:** Conv Flow Step 5/6, Section 7/8.
             **Context:** Deliverable type=${state.deliverableType}.
             **Action:** Present state.generatedDeliverable. Ask "Does this work?". If Adjust/Push, ask about setup steps. Else ask about testing.
             **Output:** Deliverable + follow-up questions.`;
            break;
        case 'ui_guidance_pending':
            relevantInstructions = `
              **Current Goal:** Provide Adjust/Firebase UI steps.
              **Reference:** Conv Flow Step 6, Section 7.
              **Context:** Type=${state.deliverableType}.
              **Action:** Provide steps from Section 7.
              **Output:** Step-by-step guide.`;
            break;
        case 'ui_guided':
        case 'testing_pending':
            relevantInstructions = `
             **Current Goal:** Provide testing checklist.
             **Reference:** Conv Flow Step 7, Section 8.
             **Action:** Present checklist from Section 8. Ask if user wants to proceed to completion.
             **Output:** Testing checklist + final confirmation question.`;
            break;
        case 'final_confirmation_pending': // Added state
            relevantInstructions = `
             **Current Goal:** Process user response after testing checklist.
             **Action:** Analyze user response. If they confirm completion ('yes', 'done', etc.), move to 'complete'. If they have more questions or issues, try to address them or revert to an appropriate earlier step if necessary.
             **Output:** Acknowledgement or further assistance.`;
            break;
        case 'complete':
            relevantInstructions = `
             **Current Goal:** Conclude.
             **Action:** Thank user, offer further help.`;
            break;
        case 'error':
            relevantInstructions = `
              **Current Goal:** Inform user about error: ${state.errorMessage || 'Unknown error'}.
              **Action:** Apologize, suggest restart/support.`;
            break;
        default:
            relevantInstructions = "Error: Unknown state reached.";
            state.step = 'error';
            state.errorMessage = `Unknown state: ${step}`;
            break;
    }

    return `
${BASE_SYSTEM_PROMPT}

**Important Note About Screenshots:**
You have access to a directory containing all app screenshots. You MUST use these for matching against the user's description. Do NOT tell users you don't have access to screenshots. When users describe a screen, you should automatically search through the available screenshots to find matching ones.

**Full Instructions (for reference):**
${fullInstructions}
---
**Current Task Focus (Follow ONLY these instructions for this turn):**
${relevantInstructions}

**Important Note for Screenshot Upload:**
If the user mentions they can't upload a screenshot or is having issues with uploads, acknowledge the problem and let them know it's fine since you already have access to the app's screenshots library. Ask them to provide a detailed description to help match one of the available screenshots you already have.

**History:**
${state.history.slice(-5).map(m => `${m.role}: ${m.content[0]?.text || '[Tool Result]'}`).join('\n')}

**Task:**
Generate the single next response OR a tool call request based ONLY on the 'Current Task Focus'. Adhere strictly to the rules for the current step.
`;
}

// --- Main Flow Function (Full Orchestration) ---
export function createDeeplinkHelperFlow(aiInstance: Genkit) {

    const deliverableGeneratorTool = createDeliverableGeneratorTool(aiInstance);
    const parameterExtractorTool = createParameterExtractorTool(aiInstance);
    const screenResolverTool = createScreenResolverTool(aiInstance);

    // Helper to determine user objective (simple example)
    const determineObjective = (text: string): 'adjust_link' | 'qr_code' | 'push_payload' | 'unknown' => {
        const lowerText = text.toLowerCase();
        if (lowerText.includes('adjust') || lowerText.includes('tracking link')) return 'adjust_link';
        if (lowerText.includes('qr')) return 'qr_code';
        if (lowerText.includes('push') || lowerText.includes('notification')) return 'push_payload';
        return 'unknown';
    };

    // Check if the user is mentioning upload issues
    const detectUploadIssues = (text: string): boolean => {
        const lowerText = text.toLowerCase();
        return lowerText.includes('can\'t upload') ||
            lowerText.includes('cannot upload') ||
            lowerText.includes('upload not working') ||
            lowerText.includes('upload issue') ||
            lowerText.includes('upload problem') ||
            (lowerText.includes('upload') && lowerText.includes('not') && lowerText.includes('work'));
    };

    return aiInstance.defineFlow(
        {
            name: 'deeplinkHelperFlow',
            inputSchema: FlowInputSchema,
            outputSchema: FlowOutputSchema,
        },
        async (userInput: string, state: DeeplinkFlowState): Promise<string> => {
            // Initialize state if this is the first turn
            if (!state.history) {
                state.step = 'start';
                state.history = [];
                state.extractedParams = {};
            }

            console.log(`[deeplinkHelperFlow] Turn Start. Input: "${userInput}", Current Step: ${state.step}`);
            state.history.push({ role: 'user', content: [{ text: userInput }] });

            // Check for upload issues and add to state context if detected
            if (detectUploadIssues(userInput)) {
                console.log(`[deeplinkHelperFlow] Upload issues detected in user input`);
                // We'll handle this in the instructions for the LLM
            }

            let agentResponseContent = "";
            let loopDetection = 0; // Prevent infinite loops

            try {
                // Main loop to handle state transitions within a single turn if possible
                while (loopDetection < 10) { // Allow internal transitions
                    loopDetection++;
                    let needsLlmCall = true;
                    let forceResponse = ""; // Use this to force a response without LLM call

                    console.log(`[Orchestrator] Loop ${loopDetection}, Current Step: ${state.step}`);

                    // === Pre-LLM State Checks & Transitions ===
                    if (state.step === 'screen_confirmation_pending') {
                        const confirmation = userInput.toLowerCase();
                        const explicitNo = confirmation.includes('no') || confirmation.includes('wrong') ||
                            confirmation.includes('nein') || confirmation.includes('falsch') ||
                            confirmation.includes('not this') || confirmation.includes('isn\'t right') ||
                            confirmation.includes('not right') || confirmation.includes('not correct');

                        // Also detect implicit rejections like "this is a screen with..." (describing something different)
                        const implicitNo = confirmation.includes('this is') || confirmation.includes('that\'s a') ||
                            confirmation.includes('that is') || confirmation.includes('looks like') ||
                            (confirmation.includes('different') && !confirmation.includes('yes')) ||
                            (confirmation.includes('other') && !confirmation.includes('yes'));

                        if (confirmation.includes('yes') || confirmation.includes('correct') || confirmation.includes('ja') || confirmation.includes('stimmt')) {
                            // ONLY if explicitly confirmed, proceed to parameter extraction or completion
                            console.log(`[Orchestrator] Screen EXPLICITLY confirmed. Moving to parameter extraction.`);
                            state.parameterToExtract = findNextMissingParam(state);
                            state.step = state.parameterToExtract ? 'parameter_extraction_pending' : 'parameters_confirmed';
                            needsLlmCall = true; // Need LLM to ask for param or confirm completion
                        } else if (explicitNo || implicitNo) {
                            // If rejected (explicitly or implicitly), clear the current path and go back to asking for description
                            console.log(`[Orchestrator] Screen rejected (${explicitNo ? 'explicitly' : 'implicitly'}). Moving back to objective_clarified.`);
                            // Store the rejected path temporarily (to know we need a different one)
                            const rejectedPath = state.identifiedPathTemplate;

                            // Clear the current identification but keep track of it being rejected
                            state.step = 'objective_clarified';
                            state.identifiedPathTemplate = undefined;
                            state.identifiedScreenshotFile = undefined;
                            state.requiredParams = undefined;
                            state.extractedParams = {};
                            state.userScreenDescription = `${state.userScreenDescription || ''} (rejected: ${rejectedPath})`;

                            forceResponse = "I understand that's not the right screen. Let's try again. Could you describe the specific screen you want to link to in more detail?";
                            needsLlmCall = false;
                        } else {
                            // Not clear if confirmed or denied - ask for explicit confirmation
                            forceResponse = "I'm not sure if that's a yes or no. Does the screen I showed/described match what you want? Please answer with 'yes' or 'no'.";
                            needsLlmCall = false; // Stay in this state, just repeat the question
                        }
                    } else if (state.step === 'path_identified') {
                        // After a path has been identified, we need to move to confirmation step
                        // before showing the confirmation message
                        state.step = 'screen_confirmation_pending';
                        console.log(`[Orchestrator] Path identified. Moving to screen_confirmation_pending.`);
                        needsLlmCall = true; // Still need LLM to generate confirmation message
                    } else if (state.step === 'parameter_extraction_pending') {
                        if (userInput.toLowerCase().startsWith('http') && state.parameterToExtract) {
                            console.log(`[Orchestrator] User provided URL for ${state.parameterToExtract}. Moving to url_request_pending.`);
                            state.step = 'url_request_pending';
                            needsLlmCall = true; // Need LLM to request tool call
                        }
                        // Otherwise, let LLM process the provided value (or lack thereof)
                    } else if (state.step === 'parameter_confirmation_pending') {
                        const confirmation = userInput.toLowerCase();
                        const paramInfo = state.parameterConfirmationPending;
                        if (paramInfo) {
                            if (confirmation.includes('yes') || confirmation.includes('correct') || confirmation.includes('ja') || confirmation.includes('stimmt')) {
                                state.extractedParams = state.extractedParams || {};
                                state.extractedParams[paramInfo.paramName] = paramInfo.extractedValue;
                                state.parameterConfirmationPending = null;
                                state.parameterToExtract = findNextMissingParam(state);
                                state.step = state.parameterToExtract ? 'parameter_extraction_pending' : 'parameters_confirmed';
                                console.log(`[Orchestrator] Param ${paramInfo.paramName} confirmed. Next Param: ${state.parameterToExtract}. Moving to step: ${state.step}`);
                                needsLlmCall = true; // Need LLM for next step
                            } else if (confirmation.includes('no') || confirmation.includes('wrong') || confirmation.includes('nein') || confirmation.includes('falsch')) {
                                state.parameterConfirmationPending = null;
                                state.parameterToExtract = paramInfo.paramName; // Reset to ask again
                                state.step = 'parameter_extraction_pending';
                                console.log(`[Orchestrator] Param ${paramInfo.paramName} denied. Moving back to step: ${state.step}`);
                                forceResponse = `Okay, that extracted value wasn't correct. Could you please provide the correct ${getUserFriendlyParamName(paramInfo.paramName)}? Or paste the URL again.`;
                                needsLlmCall = false;
                            } else {
                                forceResponse = `Sorry, I need a clear 'yes' or 'no' to confirm if the extracted value '${paramInfo.extractedValue}' for ${paramInfo.paramName} is correct.`;
                                needsLlmCall = false; // Stay in this state
                            }
                        } else { needsLlmCall = true; state.step = 'error'; state.errorMessage = "State inconsistency: parameter_confirmation_pending"; }
                    } else if (state.step === 'deliverable_generated') {
                        const lowerInput = userInput.toLowerCase();
                        if (lowerInput.includes('yes') || lowerInput.includes('correct') || lowerInput.includes('ja') || lowerInput.includes('stimmt')) {
                            if ((state.deliverableType === 'adjust_link' || state.deliverableType === 'push_payload') && (lowerInput.includes('setup') || lowerInput.includes('steps') || lowerInput.includes('adjust') || lowerInput.includes('firebase'))) {
                                state.step = 'ui_guidance_pending';
                                console.log(`[Orchestrator] Deliverable confirmed, UI steps requested. Moving to step: ${state.step}`);
                            } else {
                                state.step = 'testing_pending';
                                console.log(`[Orchestrator] Deliverable confirmed, moving to testing. Step: ${state.step}`);
                            }
                            needsLlmCall = true;
                        } else if (lowerInput.includes('no') || lowerInput.includes('wrong') || lowerInput.includes('falsch')) {
                            // Ask what was wrong or restart?
                            state.step = 'objective_clarified'; // Simple restart for now
                            forceResponse = "Okay, it seems the deliverable wasn't right. Let's start over. What screen are you trying to link to?";
                            needsLlmCall = false;
                        } else {
                            // Ask for clearer confirmation regarding the deliverable
                            forceResponse = "Sorry, I didn't quite catch that. Does the deliverable I provided look correct? And do you need setup steps (if applicable)?";
                            needsLlmCall = false; // Stay in this state
                        }
                    } else if (state.step === 'testing_pending') {
                        // After showing checklist, wait for user confirmation to finish
                        state.step = 'final_confirmation_pending';
                        needsLlmCall = true; // Let LLM respond based on user input to the checklist prompt
                    } else if (state.step === 'final_confirmation_pending') {
                        const confirmation = userInput.toLowerCase();
                        if (confirmation.includes('yes') || confirmation.includes('done') || confirmation.includes('danke') || confirmation.includes('thanks') || confirmation.includes('ok')) {
                            state.step = 'complete';
                            console.log(`[Orchestrator] Final confirmation received. Moving to step: ${state.step}`);
                            needsLlmCall = true; // Let LLM give closing message
                        } else {
                            // Assume user has another question/request
                            state.step = 'start'; // Reset to handle new request
                            console.log(`[Orchestrator] User has further input after checklist. Resetting to step: ${state.step}`);
                            // Let the loop re-run with the new input in the 'start' state
                            continue; // Re-run loop immediately for the new request
                        }
                    }

                    // If a response was forced, break the loop and return it
                    if (forceResponse) {
                        agentResponseContent = forceResponse;
                        break;
                    }

                    // === Get Instructions & Call LLM (if needed) ===
                    if (!needsLlmCall) {
                        // This state transition doesn't require an LLM call, loop might continue or break
                        console.log(`[Orchestrator] Skipping LLM call for step: ${state.step}`);
                        // If the state didn't change to something needing LLM, we might be stuck - should ideally not happen with good logic
                        // For safety, break if we skip LLM without forcing a response (implies an issue or end of turn)
                        if (!forceResponse) break; // Should already be handled, but for safety
                        continue; // Re-evaluate the new state in the loop
                    }

                    const stepInstructions = getStepInstructions(state.step, state);
                    if (stepInstructions.startsWith("Error:")) throw new Error(stepInstructions);

                    const messages: MessageData[] = [
                        { role: 'system', content: [{ text: stepInstructions }] },
                        ...state.history.slice(-10),
                    ];
                    const availableTools = [screenResolverTool, parameterExtractorTool, deliverableGeneratorTool];

                    console.log(`[deeplinkHelperFlow] Calling LLM for step: ${state.step}`);
                    const llmResponse = await aiInstance.generate({
                        messages: messages,
                        model: gemini15Flash,
                        tools: availableTools,
                        config: { temperature: 0.1 },
                    });

                    // Extract data from response safely - adjust as needed based on actual Genkit API
                    agentResponseContent = llmResponse.text || "Sorry, I encountered an issue generating a response.";

                    // For toolCalls and toolResponses, use a type-safe approach
                    const toolCalls = 'toolCalls' in llmResponse ?
                        (typeof llmResponse.toolCalls === 'function' ? llmResponse.toolCalls() : llmResponse.toolCalls) || []
                        : [];

                    const toolResponses = 'toolCallResponses' in llmResponse ?
                        (typeof llmResponse.toolCallResponses === 'function' ? llmResponse.toolCallResponses() : llmResponse.toolCallResponses) || []
                        : [];

                    console.log(`[deeplinkHelperFlow] LLM raw response for step ${state.step}:`, agentResponseContent);
                    if (toolCalls.length > 0) console.log(`[deeplinkHelperFlow] LLM requested tool calls:`, toolCalls);
                    if (toolResponses.length > 0) console.log(`[deeplinkHelperFlow] Tool responses:`, toolResponses);

                    const historyUpdate: MessageData = { role: 'model', content: [] };
                    let generatedMessageAfterTool = ""; // Store messages generated after tool use


                    // === Post-LLM State Updates & Tool Handling ===
                    if (toolResponses.length > 0) {
                        // Process tool results first
                        for (const response of toolResponses) {
                            historyUpdate.content.push({ toolResponse: response }); // Log tool response

                            try {
                                if (response.name === screenResolverTool.name && (state.step === 'objective_clarified' || state.step === 'path_identified')) {
                                    const result = response.output as { path: string, screenshotFile?: string, requiredParams?: string[], alternativeMatches?: Array<{ path: string, screenshotFile?: string, description: string }> };
                                    if (result?.path) {
                                        // Check if this path was previously rejected
                                        const wasRejected = state.userScreenDescription?.includes(`rejected: ${result.path}`);
                                        if (wasRejected) {
                                            console.log(`[Orchestrator] Warning: ScreenResolverTool returned a previously rejected path: ${result.path}`);

                                            // Instead of just showing an error, try to use alternative matches if available
                                            if (result.alternativeMatches && result.alternativeMatches.length > 0) {
                                                // Find the first alternative that wasn't rejected
                                                const validAlternative = result.alternativeMatches.find(alt =>
                                                    !state.userScreenDescription?.includes(`rejected: ${alt.path}`)
                                                );

                                                if (validAlternative) {
                                                    console.log(`[Orchestrator] Using alternative path: ${validAlternative.path} instead of rejected path`);
                                                    state.identifiedPathTemplate = validAlternative.path;
                                                    state.identifiedScreenshotFile = validAlternative.screenshotFile || null;
                                                    state.requiredParams = validAlternative.path.match(/:[a-zA-Z0-9-_]+\??/g) || [];
                                                    state.extractedParams = {}; // Reset params when path changes
                                                    state.step = 'parameter_extraction_pending'; // Change to parameter_extraction_pending
                                                    needsLlmCall = true;
                                                    continue; // Restart loop to get confirmation instructions
                                                }
                                            }

                                            // If no valid alternatives, force a different response than just showing the same screen again
                                            agentResponseContent = "I'm having trouble understanding which screen you need. Could you describe it differently? For example, tell me what actions you can perform on this screen or what information it displays. You can also upload a screenshot if available.";
                                            needsLlmCall = false;
                                            break; // Don't process other tools
                                        }

                                        // If multiple matches were found and not handling a specific match request
                                        if (result.alternativeMatches && result.alternativeMatches.length > 0 && !userInput.match(/\b(option|choice|alternative|#|number)\s*(\d+|\w+)\b/i)) {
                                            // Present the options to the user for selection
                                            const options = [`**Main Match:** ${result.screenshotFile || result.path} - ${result.path}`];

                                            result.alternativeMatches.forEach((alt, index) => {
                                                options.push(`**Option ${index + 1}:** ${alt.screenshotFile || alt.path} - ${alt.description || alt.path}`);
                                            });

                                            agentResponseContent = `Based on your description, I found these potential matches from our screenshot library:\n\n${options.join('\n')}\n\nWhich one best matches what you're looking for? You can select by number or description.`;

                                            // Store the matches for later reference
                                            state.potentialMatches = [
                                                { path: result.path, screenshotFile: result.screenshotFile || undefined, requiredParams: result.requiredParams || [] },
                                                ...result.alternativeMatches.map(alt => ({
                                                    path: alt.path,
                                                    screenshotFile: alt.screenshotFile || undefined,
                                                    requiredParams: alt.path.match(/:[a-zA-Z0-9-_]+\??/g) || []
                                                }))
                                            ];

                                            needsLlmCall = false;
                                            break; // Don't process other tools
                                        }
                                        // If the user is responding to a multiple choice selection
                                        else if (state.potentialMatches && state.potentialMatches.length > 0 && userInput.match(/\b(option|choice|alternative|#|number)?\s*(\d+|\w+)\b/i)) {
                                            const choiceMatch = userInput.match(/\b(option|choice|alternative|#|number)?\s*(\d+|\w+)\b/i);
                                            let selectedIndex = 0; // Default to main match

                                            if (choiceMatch && choiceMatch[2]) {
                                                // Try to parse selected option number
                                                const optionNumber = parseInt(choiceMatch[2]);
                                                if (!isNaN(optionNumber) && optionNumber > 0 && optionNumber <= state.potentialMatches.length - 1) {
                                                    selectedIndex = optionNumber;
                                                }
                                            }

                                            const selectedMatch = state.potentialMatches[selectedIndex];
                                            state.identifiedPathTemplate = selectedMatch.path;
                                            state.identifiedScreenshotFile = selectedMatch.screenshotFile;
                                            state.requiredParams = selectedMatch.requiredParams;
                                            state.extractedParams = {}; // Reset params when path changes
                                            state.potentialMatches = undefined; // Clear potential matches
                                            state.step = 'parameter_extraction_pending'; // Change to parameter_extraction_pending
                                            console.log(`[Orchestrator] User selected match ${selectedIndex}: ${selectedMatch.path}`);
                                            needsLlmCall = true;
                                            continue; // Restart loop to get confirmation instructions
                                        }
                                        // Normal single match flow
                                        else {
                                            state.identifiedPathTemplate = result.path;
                                            state.identifiedScreenshotFile = result.screenshotFile || null;
                                            state.requiredParams = result.requiredParams || [];
                                            state.extractedParams = {}; // Reset params when path changes
                                            state.step = 'parameter_extraction_pending'; // Change to parameter_extraction_pending
                                            console.log(`[Orchestrator] ScreenResolverTool success. Path: ${result.path}, Screenshot: ${result.screenshotFile}. Moving to step: ${state.step}`);
                                            needsLlmCall = true; // Need LLM to generate confirmation msg now
                                            continue; // Restart loop to get confirmation instructions
                                        }
                                    } else {
                                        agentResponseContent = "I couldn't identify a specific screen from that description. Could you try describing it differently or mentioning a key feature? Uploading a screenshot would also help.";
                                        needsLlmCall = false; // Don't call LLM again this turn
                                    }
                                } else if (response.name === parameterExtractorTool.name && state.step === 'url_request_pending' && state.parameterToExtract) {
                                    const result = response.output as { extractedValue: string | null };
                                    if (result?.extractedValue) {
                                        state.parameterConfirmationPending = { paramName: state.parameterToExtract, extractedValue: result.extractedValue };
                                        state.step = 'parameter_confirmation_pending';
                                        console.log(`[Orchestrator] ParameterExtractorTool success. Extracted ${result.extractedValue} for ${state.parameterToExtract}. Moving to step: ${state.step}`);
                                        needsLlmCall = true; // Need LLM to ask for confirmation
                                        continue; // Restart loop
                                    } else {
                                        state.step = 'parameter_extraction_pending'; // Go back to asking directly
                                        console.log(`[Orchestrator] ParameterExtractorTool failed. Moving back to step: ${state.step}`);
                                        generatedMessageAfterTool = `I couldn't find the ${getUserFriendlyParamName(state.parameterToExtract || '')} ID in that URL. Can you please provide it directly?`;
                                        needsLlmCall = false;
                                    }
                                } else if (response.name === deliverableGeneratorTool.name && state.step === 'parameters_confirmed') {
                                    const result = response.output as { deliverable: string };
                                    state.generatedDeliverable = result?.deliverable || "Error: Could not generate deliverable.";
                                    state.deliverableType = state.userObjective as 'adjust_link' | 'qr_code' | 'push_payload';
                                    state.step = 'deliverable_generated';
                                    console.log(`[Orchestrator] DeliverableGeneratorTool success. Moving to step: ${state.step}`);
                                    needsLlmCall = true; // Need LLM to present result
                                    continue; // Restart loop
                                }
                            } catch (toolError: any) {
                                console.error(`[Orchestrator] Error processing tool response for ${response.name}:`, toolError);
                                state.step = 'error'; state.errorMessage = `Error processing tool result: ${toolError.message}`;
                                needsLlmCall = false;
                                forceResponse = `Sorry, something went wrong while processing information (${response.name}). Please try again.`;
                            }
                        }
                    } else if (toolCalls.length > 0) {
                        // LLM requested a tool, but it wasn't executed (needs manual/external handling or Genkit config adjustment)
                        console.warn(`[Orchestrator] LLM requested tool ${toolCalls[0]?.name} but it was not executed.`);
                        historyUpdate.content.push({ toolRequest: toolCalls[0] });
                        // Decide how to proceed - maybe inform the user or retry?
                        // For now, just return the LLM's text which might be asking to use the tool.
                        agentResponseContent = agentResponseContent || "I need to use a tool to proceed, but couldn't."; // Fallback
                        needsLlmCall = false; // Don't loop LLM call
                    }

                    // If we generated a message after tool use, prioritize it
                    agentResponseContent = generatedMessageAfterTool || agentResponseContent;

                    // Add the text part of the LLM response (if any, and wasn't replaced)
                    if (agentResponseContent && !generatedMessageAfterTool) {
                        historyUpdate.content.push({ text: agentResponseContent });
                    }
                    // Add combined message to history only if it contains something
                    if (historyUpdate.content.length > 0) {
                        state.history.push(historyUpdate);
                    }


                    // === Final State Transitions (Post-LLM) ===
                    // Determine the *next* state based on the *current* state and LLM response/tool results
                    const currentState = state.step; // Store current step before potential change

                    if (state.identifiedPathTemplate) {
                        // State transitions for when we have an identified path
                        if (currentState === 'path_identified') {
                            state.step = 'parameter_extraction_pending';
                            console.log(`[Orchestrator] Screen confirmation message generated. Moving to step: ${state.step}`);
                        }
                        // Add other transitions based on identifiedPathTemplate as needed
                    } else {
                        // State transitions for when we don't have an identified path
                        if (currentState === 'start') {
                            state.userObjective = determineObjective(userInput + agentResponseContent);
                            state.step = 'objective_clarified';
                            console.log(`[Orchestrator] Objective determined as ${state.userObjective}. Moving to step: ${state.step}`);
                        } else if (currentState === 'objective_clarified') {
                            // Waiting for user description, state remains
                        } else if (currentState === 'path_identified') {
                            state.step = 'parameter_extraction_pending';
                            console.log(`[Orchestrator] Screen confirmation message generated. Moving to step: ${state.step}`);
                        } else if (currentState === 'parameter_extraction_pending') {
                            // Waiting for user to provide param value or URL
                        } else if (currentState === 'url_request_pending') {
                            // If no tool call happened, likely waiting for user or tool failed previously
                        } else if (currentState === 'parameters_confirmed') {
                            // LLM should have requested deliverable tool. Error/retry?
                            console.warn(`[Orchestrator] Warning: Reached parameters_confirmed end without tool call.`);
                            state.step = 'deliverable_generation_pending'; // Force state for now
                        } else if (currentState === 'deliverable_generated') {
                            // Waiting for user confirmation on deliverable/next steps
                        } else if (currentState === 'ui_guidance_pending') {
                            state.step = 'ui_guided'; // Assume guide was provided
                            console.log(`[Orchestrator] UI Guide provided. Moving to step: ${state.step}`);
                        } else if (currentState === 'ui_guided') {
                            state.step = 'testing_pending'; // Move to testing after UI guide
                            console.log(`[Orchestrator] Moving to testing. Step: ${state.step}`);
                        } else if (currentState === 'testing_pending') {
                            state.step = 'final_confirmation_pending'; // Assume checklist provided
                            console.log(`[Orchestrator] Testing checklist provided. Moving to step: ${state.step}`);
                        } else if (currentState === 'complete') {
                            // Stay in complete state
                        }
                    }

                    // If the state didn't change and we didn't force a response, break the loop
                    if (state.step === currentState && !forceResponse && !generatedMessageAfterTool && !toolCalls.length && !toolResponses.length) {
                        console.log(`[Orchestrator] No state change or action. Breaking loop for step: ${state.step}`);
                        break;
                    }
                    // If the step changed, continue the loop to potentially run the next step's logic immediately
                    if (state.step !== currentState) {
                        console.log(`[Orchestrator] State changed from ${currentState} to ${state.step}. Continuing loop.`);
                        userInput = ""; // Clear user input as we are processing internal transitions
                        continue;
                    }

                    // Break if no state change occurred and we processed the LLM response
                    break;

                } // End while loop

                if (loopDetection >= 10) {
                    console.error("[Orchestrator] Loop detection limit reached. Returning current response.");
                    // Potentially set error state
                }

                console.log(`[deeplinkHelperFlow] Turn End. Final Step: ${state.step}. Returning: ${agentResponseContent}`);
                return agentResponseContent;

            } catch (error: any) {
                console.error(`[deeplinkHelperFlow] FATAL Error during turn processing (Step: ${state.step}):`, error);
                state.step = 'error';
                state.errorMessage = error.message || "An unknown error occurred";
                const errorMsg = `Sorry, a critical error occurred: ${state.errorMessage}. Please try starting over.`;
                // Avoid adding recursive error messages to history
                if (state.history[state.history.length - 1]?.role !== 'model' || !state.history[state.history.length - 1]?.content[0]?.text?.startsWith("Sorry")) {
                    state.history.push({ role: 'model', content: [{ text: errorMsg }] });
                }
                return errorMsg;
            }
        }
    );
}