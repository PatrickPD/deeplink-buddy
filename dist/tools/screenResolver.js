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
exports.createScreenResolverTool = createScreenResolverTool;
const vertexai_1 = require("@genkit-ai/vertexai");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
// Define the path to the screenshots directory relative to the project root
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || './screenshots';
// Define input schema for easier type inference
const ScreenResolverInputSchema = zod_1.z.object({
    description: zod_1.z.string().describe("User's description of the desired screen (e.g., 'product page', 'order history', etc.)"),
    uploadedScreenshot: zod_1.z.string().optional().describe("Base64-encoded screenshot provided by the user (if available)"),
});
// Define output schema with multiple potential matches
const ScreenResolverOutputSchema = zod_1.z.object({
    path: zod_1.z.string().describe("The best matching deeplink path (without gesund://)"),
    screenshotFile: zod_1.z.string().nullable().describe("Filename of the best matching screenshot if found, otherwise null"),
    requiredParams: zod_1.z.array(zod_1.z.string()).optional().describe("List of required parameters for the path"),
    alternativeMatches: zod_1.z.array(zod_1.z.object({
        path: zod_1.z.string().describe("Alternative matching path"),
        screenshotFile: zod_1.z.string().nullable().describe("Filename of the alternative screenshot if any"),
        description: zod_1.z.string().describe("Brief description of this screen")
    })).optional().describe("Alternative potential matches if available"),
    error: zod_1.z.string().nullable().optional().describe("Error message if any occurred"),
});
/**
 * Reads all available screenshots from the directory
 */
function getAllScreenshots() {
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
    }
    catch (error) {
        console.error(`[screenResolverTool] Error reading screenshots directory: ${error.message}`);
        return [];
    }
}
/**
 * Reads a screenshot file and converts it to base64
 */
function getScreenshotBase64(filename) {
    try {
        const fullPath = path.resolve(path.join(SCREENSHOT_DIR, filename));
        if (!fs.existsSync(fullPath)) {
            console.warn(`Screenshot file not found: ${fullPath}`);
            return null;
        }
        const data = fs.readFileSync(fullPath);
        return `data:image/png;base64,${data.toString('base64')}`;
    }
    catch (error) {
        console.error(`[screenResolverTool] Error reading screenshot file: ${error.message}`);
        return null;
    }
}
function createScreenResolverTool(aiInstance) {
    return aiInstance.defineTool({
        name: 'screenResolverTool',
        description: 'Resolves a user\'s description to the most likely screen by examining all available screenshots and matching to the relevant deeplink path.',
        inputSchema: ScreenResolverInputSchema,
        outputSchema: ScreenResolverOutputSchema,
    }, async (input) => {
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
            try {
                // Validate the base64 format
                const base64Prefix = 'data:image/';
                if (input.uploadedScreenshot.startsWith(base64Prefix)) {
                    imageContents.push({
                        image_url: {
                            url: input.uploadedScreenshot
                        }
                    });
                    userImageProvided = true;
                    console.log("[screenResolverTool] Including user-uploaded screenshot in LLM call.");
                }
                else {
                    // Try to add appropriate prefix if missing
                    const fixedBase64 = `data:image/jpeg;base64,${input.uploadedScreenshot.replace(/^data:image\/[^;]+;base64,/, '')}`;
                    imageContents.push({
                        image_url: {
                            url: fixedBase64
                        }
                    });
                    userImageProvided = true;
                    console.log("[screenResolverTool] Fixed and included user-uploaded screenshot in LLM call.");
                }
            }
            catch (error) {
                console.error("[screenResolverTool] Error processing uploaded screenshot:", error);
                // Continue without the user image
            }
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
        try {
            const response = await aiInstance.generate({
                model: vertexai_1.gemini25ProPreview0325,
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
            let params = [];
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
                const similarScreenshot = allScreenshots.find(s => s.toLowerCase().includes(bestMatch?.toLowerCase().replace('.png', '') || ''));
                if (similarScreenshot) {
                    console.log(`[screenResolverTool] Found similar screenshot: ${similarScreenshot}`);
                    bestMatch = similarScreenshot;
                }
                else {
                    bestMatch = null;
                }
            }
            // Extract alternative matches
            const alternativesSection = responseText.match(/ALTERNATIVES:([\s\S]*?)($|(?=\n\n))/i);
            const alternativeMatches = [];
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
                        }
                        else {
                            // Try to find a similar screenshot
                            const similarScreenshot = allScreenshots.find(s => s.toLowerCase().includes(fileName?.toLowerCase().replace('.png', '') || ''));
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
        catch (error) {
            console.error(`[screenResolverTool] Error generating response:`, error);
            return {
                path: '',
                screenshotFile: null,
                error: `Error analyzing screenshots: ${error.message || "Unknown error"}`
            };
        }
    });
}
/**
 * Helper function to convert a screenshot filename back to a likely path
 */
function convertScreenshotToPath(filename) {
    // Remove .png extension
    let path = filename.replace('.png', '');
    // Replace underscores with slashes where they likely represent path separators
    // This is an approximation and may need refinement based on your specific naming conventions
    path = path.replace(/_/g, '/');
    // Handle common special patterns (add more as needed)
    path = path.replace(/\/\//g, '/'); // Remove double slashes
    return path;
}
