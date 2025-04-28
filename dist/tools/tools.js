"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliverableGeneratorTool = exports.FirebasePushPayloadSchema = exports.parameterExtractorTool = exports.screenResolverTool = exports.ScreenResolverSchema = void 0;
const ai_1 = require("@genkit-ai/ai");
const zod_1 = require("zod");
// Simplify ScreenResolverSchema further (remove .optional)
exports.ScreenResolverSchema = zod_1.z.object({
    targetScreen: zod_1.z.string().describe("The unique identifier or name of the target screen (e.g., 'UserProfileScreen', 'Settings', 'AGB')."),
    dummyParam1: zod_1.z.string().describe("Temporary dummy required string") // Removed .optional()
});
const ScreenResolverInputSchema = zod_1.z.object({ query: zod_1.z.string() });
// @ts-ignore - Linter seems to pick wrong overload for defineTool
exports.screenResolverTool = (0, ai_1.defineTool)({
    name: 'screenResolver',
    description: 'Identifies the target screen.',
    inputSchema: ScreenResolverInputSchema,
    outputSchema: exports.ScreenResolverSchema, // Use simplified schema
}, async (input) => {
    console.log(`[screenResolverTool] Called with query: ${input.query}`);
    // Always return dummyParam1 as it's now required
    if (input.query.toLowerCase().includes('agb')) {
        return { targetScreen: 'AGBScreen', dummyParam1: 'agbValue' };
    }
    else if (input.query.toLowerCase().includes('profile')) {
        return { targetScreen: 'UserProfileScreen', dummyParam1: 'profileValue' };
    }
    return { targetScreen: 'UnknownScreen', dummyParam1: 'unknownValue' };
});
const ParameterExtractorOutputSchema = zod_1.z.object({
    dummyParam: zod_1.z.string().describe('A temporary dummy parameter'),
});
// Simplify ParameterExtractorInputSchema (remove z.array)
const ParameterExtractorInputSchema = zod_1.z.object({
    userInput: zod_1.z.string().describe('The user\'s latest request or message'),
    targetScreen: zod_1.z.string().describe('The identified target screen'),
    dummyParam2: zod_1.z.string().describe('Temporary dummy string') // Replaced parametersNeeded
});
// @ts-ignore - Linter seems to pick wrong overload for defineTool
exports.parameterExtractorTool = (0, ai_1.defineTool)({
    name: 'parameterExtractor',
    description: 'Temporary dummy tool.',
    inputSchema: ParameterExtractorInputSchema, // Use simplified input
    outputSchema: ParameterExtractorOutputSchema, // Use simplified output
}, async (input) => {
    console.log(`[parameterExtractorTool] Called with input: ${JSON.stringify(input)}`);
    return { dummyParam: "extractedValue" };
});
// Simplified FirebasePushPayloadSchema
exports.FirebasePushPayloadSchema = zod_1.z.object({
    deeplink: zod_1.z.string().describe("The generated deeplink URL.")
});
// Simplified DeliverableGeneratorInputSchema
const DeliverableGeneratorInputSchema = zod_1.z.object({
    targetScreen: zod_1.z.string(),
    dummyParam: zod_1.z.string().describe('A temporary dummy parameter'),
});
// @ts-ignore - Linter seems to pick wrong overload for defineTool
exports.deliverableGeneratorTool = (0, ai_1.defineTool)({
    name: 'deliverableGenerator',
    description: 'Generates the final deliverable (just the deeplink for now) containing the deeplink.',
    inputSchema: DeliverableGeneratorInputSchema,
    outputSchema: exports.FirebasePushPayloadSchema,
}, async (input) => {
    console.log(`[deliverableGeneratorTool] Called with screen: ${input.targetScreen}, dummyParam: ${input.dummyParam}`);
    const deeplink = `myapp://${input.targetScreen}?dummy=true`;
    return { deeplink: deeplink };
});
