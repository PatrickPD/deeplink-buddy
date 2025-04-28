import * as fs from 'fs';
import { Genkit, ToolConfig } from 'genkit';
import { ToolAction } from 'genkit/tool'; // Import ToolAction
import * as path from 'path';
import { z } from 'zod';
import { normalizePathForScreenshot } from '../prompts/systemPrompt'; // Import helper

// Placeholder for accessing parsed reference data (or LLM will use prompt context)
// In a real app, you'd load/parse linkingConfig.json and targets.json here
// For now, the LLM is expected to use the context provided in the main prompt
// or this tool could be enhanced to load data from files like 'data/linkingConfig.json'
// const MOCK_LINKING_CONFIG = { /* Parsed structure */ };
// const MOCK_TARGETS = { /* Parsed structure */ };

// Define the path to the screenshots directory relative to the project root
// Adjust this path if your directory structure is different
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || './screenshots';

// Define input schema for easier type inference
const ScreenResolverInputSchema = z.object({
    userDescription: z.string().describe("User's description of the desired screen (e.g., 'product page', 'order history', 'AGB')"),
    // LLM should provide the path it identified based on the description and reference docs
    identifiedPath: z.string().describe("The canonical deeplink path (without gesund://) identified by the LLM from linkingConfig.ts based on the user description."),
    // LLM provides the description it found
    pathDescription: z.string().describe("Textual description of the screen identified by the LLM from deeplink_targets.txt."),
    // LLM determines required params based on the path structure in linkingConfig
    requiredParams: z.array(z.string()).nullable().optional().describe("List of required parameters (e.g., [':id', ':category']) identified by the LLM for the path, or null if none."),
});

// Define output schema
const ScreenResolverOutputSchema = z.object({
    likelyPath: z.string().describe("The confirmed canonical deeplink path provided as input."),
    screenDescription: z.string().describe("The textual description provided as input."),
    screenshotFilename: z.string().nullable().describe("Filename of the corresponding screenshot (e.g., 'profile_orders.png') if found in the screenshots directory, otherwise null."),
    requiredParams: z.array(z.string()).nullable().describe("List of required parameters provided as input."),
    error: z.string().nullable().describe("Error message if screenshot check failed (but identification is based on input)."),
});

// Export the configuration for the tool
export const screenResolverToolConfig: ToolConfig<typeof ScreenResolverInputSchema, typeof ScreenResolverOutputSchema> = {
    name: 'screenResolver',
    description: 'Identifies the target app screen based on user description, finds its canonical path from linkingConfig, description from targets, and checks for a corresponding screenshot. Relies on LLM context for linkingConfig/targets mapping.',
    inputSchema: ScreenResolverInputSchema,
    outputSchema: ScreenResolverOutputSchema,
};

// Define the expected function type
type ScreenResolverFn =
    (input: z.infer<typeof ScreenResolverInputSchema>) => Promise<z.infer<typeof ScreenResolverOutputSchema>>;

// Export the implementation function for the tool
export const screenResolverToolFn: ScreenResolverFn =
    async (input) => {
        const identifiedPath = input.identifiedPath;
        const potentialFilename = normalizePathForScreenshot(identifiedPath);
        let foundFilename: string | null = null;
        let checkError: string | null = null;

        try {
            const fullScreenshotDir = path.resolve(SCREENSHOT_DIR);
            const fullScreenshotPath = path.join(fullScreenshotDir, potentialFilename);

            if (!fs.existsSync(fullScreenshotDir)) {
                console.warn(`Screenshots directory not found: ${fullScreenshotDir}`);
                checkError = `Screenshots directory not found at configured path: ${SCREENSHOT_DIR}`;
            } else if (fs.existsSync(fullScreenshotPath)) {
                console.log(`[screenResolverTool] Found screenshot: ${fullScreenshotPath}`);
                foundFilename = potentialFilename;
            } else {
                console.log(`[screenResolverTool] Screenshot not found: ${fullScreenshotPath}`);
            }
        } catch (err: any) {
            console.error(`[screenResolverTool] Error checking screenshot directory: ${err.message}`);
            checkError = `Error accessing screenshot directory: ${err.message}`;
        }

        return {
            likelyPath: identifiedPath,
            screenDescription: input.pathDescription,
            screenshotFilename: foundFilename,
            requiredParams: input.requiredParams ?? null,
            error: checkError,
        };
    };

// Revert to factory function
export function createScreenResolverTool(aiInstance: Genkit): ToolAction<typeof ScreenResolverInputSchema, typeof ScreenResolverOutputSchema> {
    return aiInstance.defineTool(
        {
            name: 'screenResolver',
            description: 'Identifies the target app screen..., checks for screenshot...',
            inputSchema: ScreenResolverInputSchema,
            outputSchema: ScreenResolverOutputSchema,
        },
        async (input: z.infer<typeof ScreenResolverInputSchema>): Promise<z.infer<typeof ScreenResolverOutputSchema>> => {
            // Restore the full original implementation logic here
            const identifiedPath = input.identifiedPath;
            const potentialFilename = normalizePathForScreenshot(identifiedPath);
            let foundFilename: string | null = null;
            let checkError: string | null = null;

            try {
                const fullScreenshotDir = path.resolve(SCREENSHOT_DIR);
                const fullScreenshotPath = path.join(fullScreenshotDir, potentialFilename);

                if (!fs.existsSync(fullScreenshotDir)) {
                    console.warn(`Screenshots directory not found: ${fullScreenshotDir}`);
                    checkError = `Screenshots directory not found at configured path: ${SCREENSHOT_DIR}`;
                } else if (fs.existsSync(fullScreenshotPath)) {
                    console.log(`[screenResolverTool] Found screenshot: ${fullScreenshotPath}`);
                    foundFilename = potentialFilename;
                } else {
                    console.log(`[screenResolverTool] Screenshot not found: ${fullScreenshotPath}`);
                }
            } catch (err: any) {
                console.error(`[screenResolverTool] Error checking screenshot directory: ${err.message}`);
                checkError = `Error accessing screenshot directory: ${err.message}`;
            }

            // Return the full object matching the output schema
            return {
                likelyPath: identifiedPath,
                screenDescription: input.pathDescription,
                screenshotFilename: foundFilename,
                requiredParams: input.requiredParams ?? null,
                error: checkError,
            };
        }
    );
} 