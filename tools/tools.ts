import { defineTool } from '@genkit-ai/ai';
import { z } from 'zod';

// Simplify ScreenResolverSchema further (remove .optional)
export const ScreenResolverSchema = z.object({
    targetScreen: z.string().describe("The unique identifier or name of the target screen (e.g., 'UserProfileScreen', 'Settings', 'AGB')."),
    dummyParam1: z.string().describe("Temporary dummy required string") // Removed .optional()
});

const ScreenResolverInputSchema = z.object({ query: z.string() });

// @ts-ignore - Linter seems to pick wrong overload for defineTool
export const screenResolverTool = defineTool(
    {
        name: 'screenResolver',
        description: 'Identifies the target screen.',
        inputSchema: ScreenResolverInputSchema,
        outputSchema: ScreenResolverSchema, // Use simplified schema
    },
    async (input: z.infer<typeof ScreenResolverInputSchema>) => {
        console.log(`[screenResolverTool] Called with query: ${input.query}`);
        // Always return dummyParam1 as it's now required
        if (input.query.toLowerCase().includes('agb')) {
            return { targetScreen: 'AGBScreen', dummyParam1: 'agbValue' };
        } else if (input.query.toLowerCase().includes('profile')) {
            return { targetScreen: 'UserProfileScreen', dummyParam1: 'profileValue' };
        }
        return { targetScreen: 'UnknownScreen', dummyParam1: 'unknownValue' };
    }
);

const ParameterExtractorOutputSchema = z.object({
    dummyParam: z.string().describe('A temporary dummy parameter'),
});

// Simplify ParameterExtractorInputSchema (remove z.array)
const ParameterExtractorInputSchema = z.object({
    userInput: z.string().describe('The user\'s latest request or message'),
    targetScreen: z.string().describe('The identified target screen'),
    dummyParam2: z.string().describe('Temporary dummy string') // Replaced parametersNeeded
});

// @ts-ignore - Linter seems to pick wrong overload for defineTool
export const parameterExtractorTool = defineTool(
    {
        name: 'parameterExtractor',
        description: 'Temporary dummy tool.',
        inputSchema: ParameterExtractorInputSchema, // Use simplified input
        outputSchema: ParameterExtractorOutputSchema, // Use simplified output
    },
    async (input: z.infer<typeof ParameterExtractorInputSchema>) => {
        console.log(`[parameterExtractorTool] Called with input: ${JSON.stringify(input)}`);
        return { dummyParam: "extractedValue" };
    }
);

// Simplified FirebasePushPayloadSchema
export const FirebasePushPayloadSchema = z.object({
    deeplink: z.string().describe("The generated deeplink URL.")
});

// Simplified DeliverableGeneratorInputSchema
const DeliverableGeneratorInputSchema = z.object({
    targetScreen: z.string(),
    dummyParam: z.string().describe('A temporary dummy parameter'),
});

// @ts-ignore - Linter seems to pick wrong overload for defineTool
export const deliverableGeneratorTool = defineTool(
    {
        name: 'deliverableGenerator',
        description: 'Generates the final deliverable (just the deeplink for now) containing the deeplink.',
        inputSchema: DeliverableGeneratorInputSchema,
        outputSchema: FirebasePushPayloadSchema,
    },
    async (input: z.infer<typeof DeliverableGeneratorInputSchema>) => {
        console.log(`[deliverableGeneratorTool] Called with screen: ${input.targetScreen}, dummyParam: ${input.dummyParam}`);
        const deeplink = `myapp://${input.targetScreen}?dummy=true`;
        return { deeplink: deeplink };
    }
);
