import { Genkit } from 'genkit';
import { ToolAction } from 'genkit/tool'; // Import ToolAction
import { z } from 'zod';

// Define input schema
const ParameterExtractorInputSchema = z.object({
    url: z.string().url().describe("The full URL from www.gesund.de provided by the user."),
});

// Define output schema
const ParameterExtractorOutputSchema = z.object({
    extractedParams: z.record(z.string(), z.string()).nullable().describe("A map of extracted parameter names (e.g., 'id', 'category') to their values, or null if none found."),
    error: z.string().nullable().describe("Error message if extraction failed or URL format is unexpected."),
});

// Revert to factory function
export function createParameterExtractorTool(aiInstance: Genkit): ToolAction<typeof ParameterExtractorInputSchema, typeof ParameterExtractorOutputSchema> {
    return aiInstance.defineTool(
        {
            name: 'parameterExtractor',
            description: 'Extracts required parameters (like product ID, category ID, pharmacy ID) from a given www.gesund.de URL based on common patterns.',
            inputSchema: ParameterExtractorInputSchema,
            outputSchema: ParameterExtractorOutputSchema,
        },
        async (input: z.infer<typeof ParameterExtractorInputSchema>): Promise<z.infer<typeof ParameterExtractorOutputSchema>> => {
            const url = input.url;
            const extractedParams: Record<string, string> = {};
            let error: string | null = null;
            let foundMatch = false;

            console.log(`[parameterExtractorTool] Attempting to extract IDs from URL: ${url}`);

            try {
                // Define regex patterns for known ID types
                // Make these more robust based on actual URL structures
                const patterns: Record<string, RegExp> = {
                    // Product IDs (numeric)
                    productId: /\/(?:produkt|product|details\/product)\/(\d+)/,
                    // Category IDs (numeric)
                    categoryId: /\/(?:produkte\/[^/]+\/|category|products|home\/category|search\/category)\/(\d+)/,
                    // Pharmacy IDs (UUID)
                    pharmacyId: /\/(?:apotheke|pharmacy)\/([a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12})/, // Match UUID format
                    // Campaign IDs (could be various formats, example: alphanumeric)
                    campaignId: /\/(?:campaign)\/([a-zA-Z0-9]+)/,
                    // Add more patterns as needed (e.g., physicianId, orderId, etc.)
                };

                // Iterate through patterns and try to find matches
                for (const paramName in patterns) {
                    const match = url.match(patterns[paramName]);
                    if (match && match[1]) {
                        // Map regex group name (e.g., productId) to deeplink param name (e.g., id or category)
                        // This mapping might need refinement based on your linkingConfig
                        let deeplinkParamName = paramName; // Default
                        if (paramName === 'productId') deeplinkParamName = 'id';
                        if (paramName === 'categoryId') deeplinkParamName = 'category'; // Or sometimes ':id' depending on the route
                        if (paramName === 'pharmacyId') deeplinkParamName = 'id'; // Or ':id'
                        if (paramName === 'campaignId') deeplinkParamName = 'id';

                        console.log(`[parameterExtractorTool] Found match for ${paramName}: ${match[1]} -> mapping to ${deeplinkParamName}`);
                        extractedParams[deeplinkParamName] = match[1];
                        foundMatch = true;
                        // Don't break here, allow extracting multiple IDs if present
                    }
                }

                if (!foundMatch) {
                    error = "Could not extract a known ID pattern from the provided URL.";
                    console.log(`[parameterExtractorTool] ${error}`);
                }

            } catch (err: any) {
                error = `Error during URL parsing or regex matching: ${err.message}`;
                console.error(`[parameterExtractorTool] ${error}`);
            }

            return {
                extractedParams: foundMatch ? extractedParams : null,
                error
            };
        }
    );
}