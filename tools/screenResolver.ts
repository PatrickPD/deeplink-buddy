import { gemini25ProPreview0325 } from '@genkit-ai/vertexai';
import * as fs from 'fs';
import { Genkit } from 'genkit';
import { ToolAction } from 'genkit/tool';
import * as path from 'path';
import { z } from 'zod';

// Define the path to the screenshots directory relative to the project root
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || './screenshots';

// Define input schema for easier type inference
const ScreenResolverInputSchema = z.object({
    description: z.string().describe("User's description of the desired screen (e.g., 'product page', 'order history', etc.)"),
    uploadedScreenshot: z.string().optional().describe("Base64-encoded screenshot provided by the user (if available)"),
});

// Define output schema with multiple potential matches
const ScreenResolverOutputSchema = z.object({
    path: z.string().describe("The best matching deeplink path (without gesund://)"),
    screenshotFile: z.string().nullable().describe("Filename of the best matching screenshot if found, otherwise null"),
    requiredParams: z.array(z.string()).optional().describe("List of required parameters for the path"),
    alternativeMatches: z.array(z.object({
        path: z.string().describe("Alternative matching path"),
        screenshotFile: z.string().nullable().describe("Filename of the alternative screenshot if any"),
        description: z.string().describe("Brief description of this screen")
    })).optional().describe("Alternative potential matches if available"),
    error: z.string().nullable().optional().describe("Error message if any occurred"),
});

/**
 * Reads all available screenshots from the directory
 */
function getAllScreenshots(): string[] {
    try {
        const fullScreenshotDir = path.resolve(SCREENSHOT_DIR);
        if (!fs.existsSync(fullScreenshotDir)) {
            console.warn(`Screenshots directory not found: ${fullScreenshotDir}`);
            return [];
        }
        const files = fs.readdirSync(fullScreenshotDir);
        const screenshots = files.filter(file => file.toLowerCase().endsWith('.png'));
        console.log(`[screenResolverTool] Found ${screenshots.length} screenshots`);
        return screenshots;
    } catch (error: any) {
        console.error(`[screenResolverTool] Error reading screenshots directory: ${error.message}`);
        return [];
    }
}

/**
 * Reads a screenshot file and converts it to base64
 */
function getScreenshotBase64(filename: string): string | null {
    try {
        const fullPath = path.resolve(path.join(SCREENSHOT_DIR, filename));
        if (!fs.existsSync(fullPath)) {
            console.warn(`Screenshot file not found: ${fullPath}`);
            return null;
        }
        const data = fs.readFileSync(fullPath);
        return `data:image/png;base64,${data.toString('base64')}`;
    } catch (error: any) {
        console.error(`[screenResolverTool] Error reading screenshot file: ${error.message}`);
        return null;
    }
}

export function createScreenResolverTool(aiInstance: Genkit): ToolAction<typeof ScreenResolverInputSchema, typeof ScreenResolverOutputSchema> {
    return aiInstance.defineTool(
        {
            name: 'screenResolverTool',
            description: 'Resolves a user\'s description to the most likely screen by examining all available screenshots and matching to the relevant deeplink path.',
            inputSchema: ScreenResolverInputSchema,
            outputSchema: ScreenResolverOutputSchema,
        },
        async (input: z.infer<typeof ScreenResolverInputSchema>): Promise<z.infer<typeof ScreenResolverOutputSchema>> => {
            console.log(`[screenResolverTool] Called with description: "${input.description}"`);

            // Get all available screenshots
            const allScreenshots = getAllScreenshots();
            if (allScreenshots.length === 0) {
                return {
                    path: '',
                    screenshotFile: null,
                    error: 'No screenshots available in the directory'
                };
            }

            // Load the images to send to the model - limit to a reasonable number to avoid token limits
            // For production, consider implementing a more sophisticated selection approach
            const MAX_IMAGES = 200; // Adjust based on your needs and model capabilities

            // Filter screenshots to a manageable number
            // In a production system, you'd use a more sophisticated selection strategy
            // For now, we'll just take a sample of screenshots to demonstrate the concept
            const samplesToUse = allScreenshots.slice(0, MAX_IMAGES);

            // Create image content items for the message
            const imageContents = [];
            let userImageProvided = false; // Flag to know if user uploaded an image

            // Add user-provided screenshot if available
            if (input.uploadedScreenshot) {
                imageContents.push({
                    image_url: {
                        url: input.uploadedScreenshot
                    }
                });
                userImageProvided = true;
                console.log("[screenResolverTool] Including user-uploaded screenshot in LLM call.");
            }

            // Add reference screenshots
            for (const screenshot of samplesToUse) {
                const base64Data = getScreenshotBase64(screenshot);
                if (base64Data) {
                    imageContents.push({
                        image_url: {
                            url: base64Data
                        }
                    });
                }
            }

            // List all screenshots for reference, even if we don't send all as images
            const screenshotsList = allScreenshots.map(file => `- ${file}`).join('\n');

            // --- Refined System Prompt ---            
            const systemPromptText = `You are a screen matching expert for a mobile app. Your task is to find the best matching screenshot filename from the provided library based on the user's request (description and potentially an uploaded image).

${userImageProvided ? "**IMPORTANT: The user has uploaded an image. First, visually compare the user's uploaded image (the first image in the list provided) against the reference library screenshots (subsequent images). If you find an identical or visually near-identical match in the library, you MUST select that library screenshot's filename as the BEST_MATCH.** Only if no strong visual match is found should you rely more heavily on the user's text description and general visual similarity." : "Analyze the user's description and the available library screenshots to find the best match."}

I'm providing you with ${samplesToUse.length} sample reference screenshots from our app library to help you.

Available library screenshots (${allScreenshots.length} total):
${screenshotsList}

Screenshot filenames follow these conventions:
1. Path segments are separated by underscores (e.g., "profile_orders.png" for "profile/orders")
2. Special characters like ':', '?', '=', '@' are replaced with underscores
3. Some screenshots may have descriptive names rather than exact paths

Based on your analysis (prioritizing visual identity if user uploaded an image):
1. Identify the most likely matching screenshot *filename from the library*.
2. Determine the corresponding deeplink path (convert underscores back to slashes where appropriate for the path).
3. Identify any required parameters (marked with ':' or '?' in the path).
4. If there are multiple good matches, include them as alternatives.

Your response MUST be in this format:
BEST_MATCH: [library_screenshot_filename.png]
PATH: [corresponding path]
PARAMS: [list of parameters if any]
ALTERNATIVES: [list other potential matches with brief descriptions]

Example:
BEST_MATCH: profile_orders.png
PATH: profile/orders
PARAMS: []
ALTERNATIVES:
- profile_personal-info.png (profile/personal-info): User profile information screen
- pharmacy_orders.png (pharmacy/orders): Orders from pharmacies
`;
            // --- End Refined System Prompt ---

            // Create a prompt that includes screenshots for the LLM to analyze
            const response = await aiInstance.generate({
                model: gemini25ProPreview0325,
                messages: [
                    {
                        role: 'system',
                        content: [{ text: systemPromptText }] // Use the refined prompt
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                text: `User description: "${input.description}"`
                            },
                            ...imageContents
                        ]
                    }
                ]
            });

            // Parse the response to extract screenshot, path, and parameters
            const responseText = response.text || '';
            console.log(`[screenResolverTool] Raw LLM response: ${responseText.substring(0, 200)}...`);

            // Parse LLM output for best match
            const bestMatchMatch = responseText.match(/BEST_MATCH:\s*(.+?)(\n|$)/i);
            const pathMatch = responseText.match(/PATH:\s*(.+?)(\n|$)/i);
            const paramsMatch = responseText.match(/PARAMS:\s*\[(.*?)\]/i);

            let bestMatch = bestMatchMatch ? bestMatchMatch[1].trim() : null;
            let path = pathMatch ? pathMatch[1].trim() : '';
            let params: string[] = [];

            if (paramsMatch && paramsMatch[1]) {
                params = paramsMatch[1].split(',')
                    .map(p => p.trim())
                    .filter(p => p.length > 0)
                    .map(p => p.replace(/['"]/g, ''));
            }

            // Verify that the bestMatch screenshot actually exists
            if (bestMatch && !allScreenshots.includes(bestMatch)) {
                console.warn(`[screenResolverTool] Warning: LLM identified screenshot "${bestMatch}" not found in directory`);
                // Try to find a close match
                const similarScreenshot = allScreenshots.find(s =>
                    s.toLowerCase().includes(bestMatch?.toLowerCase().replace('.png', '') || '')
                );
                if (similarScreenshot) {
                    console.log(`[screenResolverTool] Found similar screenshot: ${similarScreenshot}`);
                    bestMatch = similarScreenshot;
                } else {
                    bestMatch = null;
                }
            }

            // Extract alternative matches
            const alternativesSection = responseText.match(/ALTERNATIVES:([\s\S]*?)($|(?=\n\n))/i);
            const alternativeMatches: Array<{ path: string, screenshotFile: string | null, description: string }> = [];

            if (alternativesSection && alternativesSection[1]) {
                const alternativesText = alternativesSection[1].trim();
                const alternativeLines = alternativesText.split('\n');

                for (const line of alternativeLines) {
                    // Format could be: - filename.png (path/to/screen): Description
                    const altMatch = line.match(/\s*-\s*([\w\-._]+)(?:\s*\(([\w\-./{}:?=&]+)\))?:?\s*(.*)/);
                    if (altMatch) {
                        const [_, fileName, altPath, description] = altMatch;

                        // Only add if the file exists
                        if (fileName && allScreenshots.includes(fileName.trim())) {
                            alternativeMatches.push({
                                path: altPath?.trim() || convertScreenshotToPath(fileName.trim()),
                                screenshotFile: fileName.trim(),
                                description: description?.trim() || 'Alternative match'
                            });
                        } else {
                            // Try to find a similar screenshot
                            const similarScreenshot = allScreenshots.find(s =>
                                s.toLowerCase().includes(fileName?.toLowerCase().replace('.png', '') || '')
                            );
                            if (similarScreenshot) {
                                alternativeMatches.push({
                                    path: altPath?.trim() || convertScreenshotToPath(similarScreenshot),
                                    screenshotFile: similarScreenshot,
                                    description: description?.trim() || 'Alternative match'
                                });
                            }
                        }
                    }
                }
            }

            // If no clear path was identified but we have a screenshot, derive path from screenshot
            if (!path && bestMatch) {
                path = convertScreenshotToPath(bestMatch);
            }

            // If we still don't have a path but have alternatives, use the first alternative
            if (!path && alternativeMatches.length > 0) {
                path = alternativeMatches[0].path;
                bestMatch = alternativeMatches[0].screenshotFile;
                alternativeMatches.shift(); // Remove the first one as it's now the main match
            }

            // If still no path, return an error
            if (!path) {
                return {
                    path: '',
                    screenshotFile: null,
                    error: 'Could not identify a matching screen based on the description'
                };
            }

            return {
                path,
                screenshotFile: bestMatch,
                requiredParams: params.length > 0 ? params : undefined,
                alternativeMatches: alternativeMatches.length > 0 ? alternativeMatches : undefined,
                error: null
            };
        }
    );
}

/**
 * Helper function to convert a screenshot filename back to a likely path
 */
function convertScreenshotToPath(filename: string): string {
    // Remove .png extension
    let path = filename.replace('.png', '');

    // Replace underscores with slashes where they likely represent path separators
    // This is an approximation and may need refinement based on your specific naming conventions
    path = path.replace(/_/g, '/');

    // Handle common special patterns (add more as needed)
    path = path.replace(/\/\//g, '/'); // Remove double slashes

    return path;
} 