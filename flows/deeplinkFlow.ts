import * as fs from 'fs';
import * as path from 'path';
import { z } from 'zod';
// Import Genkit, flow types, context, message types, and tools
import { gemini25ProPreview0325 } from '@genkit-ai/vertexai';
import { Genkit, MessageData } from 'genkit';
import { BASE_SYSTEM_PROMPT } from '../prompts/systemPrompt';
import { createDeliverableGeneratorTool } from '../tools/deliverableGenerator';
import { createParameterExtractorTool } from '../tools/parameterExtractor';
import { createScreenResolverTool } from '../tools/screenResolver';

// Define schemas for the flow
const FlowInputSchema = z.union([
    z.string().describe("User's message as plain text"),
    z.object({
        text: z.string().describe("User's message text"),
        uploadedImage: z.string().optional().describe("Base64-encoded screenshot uploaded by user")
    }).describe("User's message with optional screenshot")
]);
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
    uploadedScreenshot?: string; // Store user uploaded screenshot
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
            **CRITICAL:** If user asks about seeing screenshots, CONFIRM you can analyze the visual content. DO NOT DENY this capability.
            **Example:** "Hi! How can I help you create a deeplink today?"`;
            break;
        case 'objective_clarified':
            relevantInstructions = `
            **Current Goal:** Get screen description.
            **Reference:** Conv Flow Step 2.
            **Context:** Objective='${state.userObjective || 'unknown'}'. Previous screen was rejected: ${state.identifiedPathTemplate ? 'Yes' : 'No'}
            **Action:** ${state.identifiedPathTemplate ? 'The user rejected the previous suggestion. Ask for a clearer description of what they want.' : 'Ask user to describe the screen. Encourage them to upload a screenshot if possible.'}
            **CRITICAL:** If user asks about seeing screenshots, CONFIRM you can analyze the visual content. DO NOT DENY this capability.
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
        async (userInput: string | { text: string; uploadedImage?: string }, state: any, context?: any): Promise<string> => {
            // Cast the state to our internal type
            const flowState = state as DeeplinkFlowState;

            // Extract text and possibly uploaded image from input
            let userText = typeof userInput === 'string' ? userInput : userInput.text;
            const uploadedImage = typeof userInput === 'string' ? undefined : userInput.uploadedImage;

            // Initialize state if this is the first turn
            if (!flowState.history) {
                flowState.step = 'start';
                flowState.history = [];
                flowState.extractedParams = {};
            }

            // Store uploaded image in state if provided
            if (uploadedImage) {
                flowState.uploadedScreenshot = uploadedImage;
                console.log(`[deeplinkHelperFlow] User uploaded a screenshot`);
            }

            console.log(`[deeplinkHelperFlow] Turn Start. Input: "${userText}", Current Step: ${flowState.step}`);
            flowState.history.push({ role: 'user', content: [{ text: userText }] });

            // Check for upload issues and add to state context if detected
            if (detectUploadIssues(userText)) {
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

                    console.log(`[Orchestrator] Loop ${loopDetection}, Current Step: ${flowState.step}`);

                    // === Pre-LLM State Checks & Transitions ===
                    if (flowState.step === 'screen_confirmation_pending') {
                        const confirmation = userText.toLowerCase(); // Use extracted userText
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
                            flowState.parameterToExtract = findNextMissingParam(flowState);
                            flowState.step = flowState.parameterToExtract ? 'parameter_extraction_pending' : 'parameters_confirmed';
                            needsLlmCall = true; // Need LLM to ask for param or confirm completion
                        } else if (explicitNo || implicitNo) {
                            // If rejected (explicitly or implicitly), clear the current path and go back to asking for description
                            console.log(`[Orchestrator] Screen rejected (${explicitNo ? 'explicitly' : 'implicitly'}). Moving back to objective_clarified.`);
                            // Store the rejected path temporarily (to know we need a different one)
                            const rejectedPath = flowState.identifiedPathTemplate;

                            // Clear the current identification but keep track of it being rejected
                            flowState.step = 'objective_clarified';
                            flowState.identifiedPathTemplate = undefined;
                            flowState.identifiedScreenshotFile = undefined;
                            flowState.requiredParams = undefined;
                            flowState.extractedParams = {};
                            flowState.userScreenDescription = `${flowState.userScreenDescription || ''} (rejected: ${rejectedPath})`;
                            flowState.uploadedScreenshot = undefined; // Clear uploaded screenshot on rejection

                            forceResponse = "I understand that's not the right screen. Let's try again. Could you describe the specific screen you want to link to in more detail?";
                            needsLlmCall = false;
                        } else {
                            // Not clear if confirmed or denied - ask for explicit confirmation
                            forceResponse = "I'm not sure if that's a yes or no. Does the screen I showed/described match what you want? Please answer with 'yes' or 'no'.";
                            needsLlmCall = false; // Stay in this state, just repeat the question
                        }
                    } else if (flowState.step === 'path_identified') {
                        // *** START FIX for Premature Parameter Request ***
                        console.log(`[Orchestrator] Entering 'path_identified' state. Path='${flowState.identifiedPathTemplate}', ScreenshotFile='${flowState.identifiedScreenshotFile}'`); // Log state
                        // When a path is identified, directly generate the confirmation message here
                        // instead of letting the LLM do it.
                        console.log(`[Orchestrator] Path identified (${flowState.identifiedPathTemplate}). Generating confirmation message directly.`);

                        const screenName = flowState.identifiedPathTemplate || "the screen"; // Fallback name
                        // TODO: Ideally, fetch a user-friendly name from deeplink_targets.txt based on the path
                        let confirmationMsg = `Okay, it sounds like you want the ${screenName}. `;

                        if (flowState.identifiedScreenshotFile) {
                            confirmationMsg = `[SHOW_SCREENSHOT: ${flowState.identifiedScreenshotFile}] ${confirmationMsg}`;
                        }
                        confirmationMsg += "Does this look right?";

                        forceResponse = confirmationMsg;
                        console.log(`[Orchestrator] Forcing response in 'path_identified': "${forceResponse}"`); // Log forced response
                        flowState.step = 'screen_confirmation_pending'; // Move state to await user response
                        needsLlmCall = false; // Skip LLM call
                        // *** END FIX ***
                    } else if (flowState.step === 'parameter_extraction_pending') {
                        if (userText.toLowerCase().startsWith('http') && flowState.parameterToExtract) { // Use extracted userText
                            console.log(`[Orchestrator] User provided URL for ${flowState.parameterToExtract}. Moving to url_request_pending.`);
                            flowState.step = 'url_request_pending';
                            needsLlmCall = true; // Need LLM to request tool call
                        }
                        // Otherwise, let LLM process the provided value (or lack thereof)
                    } else if (flowState.step === 'parameter_confirmation_pending') {
                        const confirmation = userText.toLowerCase(); // Use extracted userText
                        const paramInfo = flowState.parameterConfirmationPending;
                        if (paramInfo) {
                            if (confirmation.includes('yes') || confirmation.includes('correct') || confirmation.includes('ja') || confirmation.includes('stimmt')) {
                                flowState.extractedParams = flowState.extractedParams || {};
                                flowState.extractedParams[paramInfo.paramName] = paramInfo.extractedValue;
                                flowState.parameterConfirmationPending = null;
                                flowState.parameterToExtract = findNextMissingParam(flowState);
                                flowState.step = flowState.parameterToExtract ? 'parameter_extraction_pending' : 'parameters_confirmed';
                                console.log(`[Orchestrator] Param ${paramInfo.paramName} confirmed. Next Param: ${flowState.parameterToExtract}. Moving to step: ${flowState.step}`);
                                needsLlmCall = true; // Need LLM for next step
                            } else if (confirmation.includes('no') || confirmation.includes('wrong') || confirmation.includes('nein') || confirmation.includes('falsch')) {
                                flowState.parameterConfirmationPending = null;
                                flowState.parameterToExtract = paramInfo.paramName; // Reset to ask again
                                flowState.step = 'parameter_extraction_pending';
                                console.log(`[Orchestrator] Param ${paramInfo.paramName} denied. Moving back to step: ${flowState.step}`);
                                forceResponse = `Okay, that extracted value wasn't correct. Could you please provide the correct ${getUserFriendlyParamName(paramInfo.paramName)}? Or paste the URL again.`;
                                needsLlmCall = false;
                            } else {
                                forceResponse = `Sorry, I need a clear 'yes' or 'no' to confirm if the extracted value '${paramInfo.extractedValue}' for ${paramInfo.paramName} is correct.`;
                                needsLlmCall = false; // Stay in this state
                            }
                        } else { needsLlmCall = true; flowState.step = 'error'; flowState.errorMessage = "State inconsistency: parameter_confirmation_pending"; }
                    } else if (flowState.step === 'parameters_confirmed') {
                        // *** Logic to request deliverable tool - This should be handled by LLM based on instructions ***
                        console.log(`[Orchestrator] Step is 'parameters_confirmed'. Expecting LLM to request deliverableGeneratorTool.`);
                        // No forced response or state change here; LLM should act.
                        needsLlmCall = true;
                    } else if (flowState.step === 'deliverable_generation_pending') {
                        // Maybe force a message while waiting?
                        forceResponse = "Okay, generating the deliverable now...";
                        needsLlmCall = false; // Prevent LLM call while tool runs (assuming tool runs synchronously or flow waits)
                    } else if (flowState.step === 'deliverable_generated') {
                        const lowerInput = userText.toLowerCase(); // Use extracted userText
                        if (lowerInput.includes('yes') || lowerInput.includes('correct') || lowerInput.includes('ja') || lowerInput.includes('stimmt')) {
                            if ((flowState.deliverableType === 'adjust_link' || flowState.deliverableType === 'push_payload') && (lowerInput.includes('setup') || lowerInput.includes('steps') || lowerInput.includes('adjust') || lowerInput.includes('firebase'))) {
                                flowState.step = 'ui_guidance_pending';
                                console.log(`[Orchestrator] Deliverable confirmed, UI steps requested. Moving to step: ${flowState.step}`);
                            } else {
                                flowState.step = 'testing_pending';
                                console.log(`[Orchestrator] Deliverable confirmed, moving to testing. Step: ${flowState.step}`);
                            }
                            needsLlmCall = true;
                        } else if (lowerInput.includes('no') || lowerInput.includes('wrong') || lowerInput.includes('falsch')) {
                            // Ask what was wrong or restart?
                            flowState.step = 'objective_clarified'; // Simple restart for now
                            flowState.uploadedScreenshot = undefined; // Clear uploaded screenshot on rejection
                            forceResponse = "Okay, it seems the deliverable wasn't right. Let's start over. What screen are you trying to link to?";
                            needsLlmCall = false;
                        } else {
                            // Ask for clearer confirmation regarding the deliverable
                            forceResponse = "Sorry, I didn't quite catch that. Does the deliverable I provided look correct? And do you need setup steps (if applicable)?";
                            needsLlmCall = false; // Stay in this state
                        }
                    } else if (flowState.step === 'ui_guidance_pending') {
                        // *** Logic to provide UI steps - This should be handled by LLM based on instructions ***
                        console.log(`[Orchestrator] Step is 'ui_guidance_pending'. Expecting LLM to provide UI steps.`);
                        // No forced response or state change here; LLM should act.
                        needsLlmCall = true;
                    } else if (flowState.step === 'testing_pending') {
                        // *** Logic to provide checklist - This should be handled by LLM based on instructions ***
                        console.log(`[Orchestrator] Step is 'testing_pending'. Expecting LLM to provide checklist.`);
                        // No forced response, LLM provides checklist, then we expect final_confirmation_pending
                        needsLlmCall = true;
                        // State change to final_confirmation_pending happens *after* LLM provides checklist
                    } else if (flowState.step === 'final_confirmation_pending') {
                        const confirmation = userText.toLowerCase(); // Use extracted userText
                        if (confirmation.includes('yes') || confirmation.includes('done') || confirmation.includes('danke') || confirmation.includes('thanks') || confirmation.includes('ok')) {
                            flowState.step = 'complete';
                            console.log(`[Orchestrator] Final confirmation received. Moving to step: ${flowState.step}`);
                            needsLlmCall = true; // Let LLM give closing message
                        } else {
                            // Assume user has another question/request
                            flowState.step = 'start'; // Reset to handle new request
                            flowState.uploadedScreenshot = undefined; // Clear screenshot for new request
                            console.log(`[Orchestrator] User has further input after checklist. Resetting to step: ${flowState.step}`);
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
                        console.log(`[Orchestrator] Skipping LLM call for step: ${flowState.step}`);
                        // If the state didn't change to something needing LLM, we might be stuck - should ideally not happen with good logic
                        // For safety, break if we skip LLM without forcing a response (implies an issue or end of turn)
                        if (!forceResponse) break; // Should already be handled, but for safety
                        continue; // Re-evaluate the new state in the loop
                    }

                    const stepInstructions = getStepInstructions(flowState.step, flowState);
                    if (stepInstructions.startsWith("Error:")) throw new Error(stepInstructions);

                    const messages: MessageData[] = [
                        { role: 'system', content: [{ text: stepInstructions }] },
                        ...flowState.history.slice(-10).filter(msg => msg.role !== 'system'), // Filter out any system messages from history
                    ];
                    const availableTools = [screenResolverTool, parameterExtractorTool, deliverableGeneratorTool];

                    // Note for LLM if screenshot was uploaded in this session
                    if (flowState.uploadedScreenshot && flowState.step === 'objective_clarified') {
                        // Instead of adding a system message, modify the user's last message to include context
                        const lastUserIndex = messages.findIndex(msg => msg.role === 'user');
                        if (lastUserIndex !== -1) {
                            const userText = messages[lastUserIndex].content[0]?.text || '';
                            messages[lastUserIndex].content = [{
                                text: `${userText} [System Note: I've uploaded a screenshot to help identify the screen]`
                            }];
                        }
                    }

                    console.log(`[deeplinkHelperFlow] Calling LLM for step: ${flowState.step}`);
                    const llmResponse = await aiInstance.generate({
                        messages: messages,
                        model: gemini25ProPreview0325,
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

                    console.log(`[deeplinkHelperFlow] LLM raw response for step ${flowState.step}:`, agentResponseContent);
                    if (toolCalls.length > 0) console.log(`[deeplinkHelperFlow] LLM requested tool calls:`, toolCalls);
                    if (toolResponses.length > 0) console.log(`[deeplinkHelperFlow] Tool responses:`, toolResponses);

                    const historyUpdate: MessageData = { role: 'model', content: [{ text: agentResponseContent }] };
                    let generatedMessageAfterTool = ""; // Store messages generated after tool use

                    // === Post-LLM State Updates & Tool Handling ===
                    if (toolResponses.length > 0) {
                        // Process tool results first
                        for (const response of toolResponses) {
                            // Don't add raw tool responses to history directly
                            // historyUpdate.content.push({ toolResponse: response }); // This causes unsupported type errors
                            console.log(`[Orchestrator] Processing tool response: ${response.name}`, JSON.stringify(response.output)); // Log tool output

                            try {
                                if (response.name === screenResolverTool.name && (flowState.step === 'objective_clarified')) {
                                    const result = response.output as { path: string, screenshotFile?: string | null, requiredParams?: string[], alternativeMatches?: Array<{ path: string, screenshotFile?: string, description: string }> }; // Ensure screenshotFile can be null
                                    console.log(`[Orchestrator] ScreenResolverTool raw result:`, JSON.stringify(result)); // Log the parsed result

                                    if (result?.path) {
                                        // Check if this path was previously rejected
                                        const wasRejected = flowState.userScreenDescription?.includes(`rejected: ${result.path}`);
                                        if (wasRejected) {
                                            console.log(`[Orchestrator] Warning: ScreenResolverTool returned a previously rejected path: ${result.path}`);

                                            // Instead of just showing an error, try to use alternative matches if available
                                            if (result.alternativeMatches && result.alternativeMatches.length > 0) {
                                                // Find the first alternative that wasn't rejected
                                                const validAlternative = result.alternativeMatches.find((r: { path: string }) =>
                                                    !flowState.userScreenDescription?.includes(`rejected: ${r.path}`)
                                                );

                                                if (validAlternative) {
                                                    console.log(`[Orchestrator] Using alternative path: ${validAlternative.path} instead of rejected path`);
                                                    flowState.identifiedPathTemplate = validAlternative.path;
                                                    flowState.identifiedScreenshotFile = validAlternative.screenshotFile || null;
                                                    flowState.requiredParams = validAlternative.path.match(/:[a-zA-Z0-9-_]+\??/g) || [];
                                                    flowState.extractedParams = {}; // Reset params when path changes
                                                    flowState.step = 'path_identified'; // Move to trigger the direct confirmation
                                                    needsLlmCall = false; // Let the loop handle the direct confirmation
                                                    continue; // Restart loop to generate confirmation message directly
                                                }
                                            }

                                            // If no valid alternatives, force a different response than just showing the same screen again
                                            agentResponseContent = "I'm having trouble understanding which screen you need. Could you describe it differently? For example, tell me what actions you can perform on this screen or what information it displays. You can also upload a screenshot if available.";
                                            needsLlmCall = false;
                                            break; // Don't process other tools
                                        }

                                        // If multiple matches were found and not handling a specific match request
                                        if (result.alternativeMatches && result.alternativeMatches.length > 0 && !userText.match(/\b(option|choice|alternative|#|number)\s*(\d+|\w+)\b/i)) { // Use userText
                                            // Present the options to the user for selection
                                            const options = [`**Main Match:** ${result.screenshotFile || result.path} - ${result.path}`];

                                            result.alternativeMatches.forEach((alt, index) => {
                                                options.push(`**Option ${index + 1}:** ${alt.screenshotFile || alt.path} - ${alt.description || alt.path}`);
                                            });

                                            agentResponseContent = `Based on your description, I found these potential matches from our screenshot library:\n\n${options.join('\n')}\n\nWhich one best matches what you're looking for? You can select by number or description.`;

                                            // Store the matches for later reference
                                            flowState.potentialMatches = [
                                                { path: result.path, screenshotFile: result.screenshotFile || undefined, requiredParams: result.requiredParams || [] },
                                                ...result.alternativeMatches.map(alt => ({
                                                    path: alt.path,
                                                    screenshotFile: alt.screenshotFile || undefined,
                                                    requiredParams: alt.path.match(/:[a-zA-Z0-9-_]+\??/g) || []
                                                }))
                                            ];

                                            flowState.step = 'objective_clarified'; // Stay in this step to await choice
                                            needsLlmCall = false;
                                            break; // Don't process other tools
                                        }
                                        // If the user is responding to a multiple choice selection
                                        else if (flowState.potentialMatches && flowState.potentialMatches.length > 0 && userText.match(/\b(option|choice|alternative|#|number)?\s*(\d+|\w+)\b/i)) { // Use userText
                                            const choiceMatch = userText.match(/\b(option|choice|alternative|#|number)?\s*(\d+|\w+)\b/i); // Use userText
                                            let selectedIndex = 0; // Default to main match

                                            if (choiceMatch && choiceMatch[2]) {
                                                // Try to parse selected option number
                                                const optionNumber = parseInt(choiceMatch[2]);
                                                if (!isNaN(optionNumber) && optionNumber > 0 && optionNumber <= flowState.potentialMatches.length - 1) {
                                                    selectedIndex = optionNumber;
                                                }
                                            }

                                            const selectedMatch = flowState.potentialMatches[selectedIndex];
                                            flowState.identifiedPathTemplate = selectedMatch.path;
                                            flowState.identifiedScreenshotFile = selectedMatch.screenshotFile;
                                            flowState.requiredParams = selectedMatch.requiredParams;
                                            flowState.extractedParams = {}; // Reset params when path changes
                                            flowState.potentialMatches = undefined; // Clear potential matches
                                            flowState.step = 'path_identified'; // Move to trigger direct confirmation
                                            console.log(`[Orchestrator] User selected match ${selectedIndex}: ${selectedMatch.path}`);
                                            needsLlmCall = false; // Let loop handle direct confirmation
                                            continue; // Restart loop to generate confirmation message directly
                                        }
                                        // Normal single match flow
                                        else {
                                            flowState.identifiedPathTemplate = result.path;
                                            flowState.identifiedScreenshotFile = result.screenshotFile || null;
                                            flowState.requiredParams = result.requiredParams || [];
                                            flowState.extractedParams = {}; // Reset params when path changes
                                            flowState.step = 'path_identified'; // Move state to trigger direct confirmation
                                            console.log(`[Orchestrator] ScreenResolverTool success. Path: ${result.path}, Screenshot: ${result.screenshotFile}. Moving to step: ${flowState.step}`);
                                            needsLlmCall = false; // Let the loop handle the direct confirmation generation
                                            continue; // Restart loop to generate confirmation message directly
                                        }
                                    } else {
                                        agentResponseContent = "I couldn't identify a specific screen from that description. Could you try describing it differently or mentioning a key feature? Uploading a screenshot would also help.";
                                        needsLlmCall = false; // Don't call LLM again this turn
                                    }
                                } else if (response.name === parameterExtractorTool.name && flowState.step === 'url_request_pending' && flowState.parameterToExtract) {
                                    const result = response.output as { extractedValue: string | null };
                                    if (result?.extractedValue) {
                                        flowState.parameterConfirmationPending = { paramName: flowState.parameterToExtract, extractedValue: result.extractedValue };
                                        flowState.step = 'parameter_confirmation_pending';
                                        console.log(`[Orchestrator] ParameterExtractorTool success. Extracted ${result.extractedValue} for ${flowState.parameterToExtract}. Moving to step: ${flowState.step}`);
                                        needsLlmCall = true; // Need LLM to ask for confirmation
                                        continue; // Restart loop
                                    } else {
                                        flowState.step = 'parameter_extraction_pending'; // Go back to asking directly
                                        console.log(`[Orchestrator] ParameterExtractorTool failed. Moving back to step: ${flowState.step}`);
                                        generatedMessageAfterTool = `I couldn't find the ${getUserFriendlyParamName(flowState.parameterToExtract || '')} ID in that URL. Can you please provide it directly?`;
                                        needsLlmCall = false;
                                    }
                                } else if (response.name === deliverableGeneratorTool.name && flowState.step === 'parameters_confirmed') {
                                    const result = response.output as { deliverable: string };
                                    flowState.generatedDeliverable = result?.deliverable || "Error: Could not generate deliverable.";
                                    flowState.deliverableType = flowState.userObjective as 'adjust_link' | 'qr_code' | 'push_payload';
                                    flowState.step = 'deliverable_generated';
                                    console.log(`[Orchestrator] DeliverableGeneratorTool success. Moving to step: ${flowState.step}`);
                                    needsLlmCall = true; // Need LLM to present result
                                    continue; // Restart loop
                                }
                            } catch (toolError: any) {
                                console.error(`[Orchestrator] Error processing tool response for ${response.name}:`, toolError);
                                flowState.step = 'error'; flowState.errorMessage = `Error processing tool result: ${toolError.message}`;
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

                    // Update the history with the final response text
                    if (agentResponseContent) {
                        historyUpdate.content = [{ text: agentResponseContent }];
                        // Add message to history
                        flowState.history.push(historyUpdate);
                    }

                    // === Final State Transitions (Post-LLM) ===
                    // Determine the *next* state based on the *current* state and LLM response/tool results
                    const currentState = flowState.step; // Store current step before potential change

                    if (currentState === 'start') {
                        flowState.userObjective = determineObjective(userText + agentResponseContent); // Use userText
                        flowState.step = 'objective_clarified';
                        console.log(`[Orchestrator] Objective determined as ${flowState.userObjective}. Moving to step: ${flowState.step}`);
                    } else if (currentState === 'objective_clarified') {
                        // Stay here unless a tool call identified a path (handled above)
                        if (!toolResponses.find((r: { name: string }) => r.name === screenResolverTool.name)) {
                            flowState.userScreenDescription = userText; // Store the description if not handled by tool
                            console.log(`[Orchestrator] Stored user screen description: ${userText}`);
                        }
                    } else if (currentState === 'parameter_extraction_pending') {
                        // Waiting for user to provide param value or URL, or tool call
                    } else if (currentState === 'url_request_pending') {
                        // If no tool call happened, likely waiting for user or tool failed previously
                    } else if (currentState === 'parameters_confirmed') {
                        // LLM should have requested deliverable tool. Transition handled by LLM tool request or pre-check.
                        // If LLM didn't request tool, the pre-check forces deliverable_generation_pending.
                    } else if (currentState === 'deliverable_generated') {
                        // Waiting for user confirmation on deliverable/next steps. Transition handled by pre-check.
                    } else if (currentState === 'ui_guidance_pending') {
                        // Stay in this state until LLM provides the guide. Transition to ui_guided happens in pre-check logic after LLM response.
                        // Let LLM provide the guide. The pre-check logic for deliverable_generated -> ui_guidance or testing handles moving *into* this state.
                        // The next turn will process the user response *after* seeing the guide.
                    } else if (currentState === 'testing_pending') {
                        // Stay in this state until LLM provides the checklist. Transition happens *after* LLM responds.
                        // The pre-check logic for deliverable_generated -> testing handles moving *into* this state.
                        // The next turn will process the user response *after* seeing the checklist (handled by final_confirmation_pending pre-check).
                    } else if (currentState === 'complete') {
                        // Stay in complete state
                    }
                    // Note: Transitions for path_identified and screen_confirmation_pending are handled earlier in the loop

                    // If the state didn't change and we didn't force a response, break the loop
                    if (flowState.step === currentState && !forceResponse && !generatedMessageAfterTool && !toolCalls.length && !toolResponses.length) {
                        console.log(`[Orchestrator] No state change or action. Breaking loop for step: ${flowState.step}`);
                        break;
                    }
                    // If the step changed, continue the loop to potentially run the next step's logic immediately
                    if (flowState.step !== currentState) {
                        console.log(`[Orchestrator] State changed from ${currentState} to ${flowState.step}. Continuing loop.`);
                        userText = ""; // Clear user input as we are processing internal transitions
                        continue;
                    }

                    // Break if no state change occurred and we processed the LLM response
                    break;

                } // End while loop

                if (loopDetection >= 10) {
                    console.error("[Orchestrator] Loop detection limit reached. Returning current response.");
                    // Potentially set error state
                }

                console.log(`[deeplinkHelperFlow] Turn End. Final Step: ${flowState.step}. Returning: "${agentResponseContent}"`); // Log final response
                return agentResponseContent;

            } catch (error: any) {
                console.error(`[deeplinkHelperFlow] FATAL Error during turn processing (Step: ${flowState.step}):`, error);
                flowState.step = 'error';
                flowState.errorMessage = error.message || "An unknown error occurred";
                const errorMsg = `Sorry, a critical error occurred: ${flowState.errorMessage}. Please try starting over.`;
                // Avoid adding recursive error messages to history
                if (flowState.history[flowState.history.length - 1]?.role !== 'model' || !flowState.history[flowState.history.length - 1]?.content[0]?.text?.startsWith("Sorry")) {
                    flowState.history.push({ role: 'model', content: [{ text: errorMsg }] });
                }
                return errorMsg;
            }
        }
    );
}