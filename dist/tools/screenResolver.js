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
        // Create a prompt that includes screenshots for the LLM to analyze
        const response = await aiInstance.generate({
            messages: [
                {
                    role: 'system',
                    content: [
                        {
                            text: `You are a screen matching expert for a mobile app. Your task is to find the best matching screenshot and path based on the user's description.

Available screenshots (${allScreenshots.length}):
${allScreenshots.map(file => `- ${file}`).join('\n')}

Screenshot filenames follow these conventions:
1. Path segments are separated by underscores (e.g., "profile_orders.png" for "profile/orders")
2. Special characters like ':', '?', '=', '@' are replaced with underscores
3. Some screenshots may have descriptive names rather than exact paths

Analyze the user's description and the available screenshots to:
1. Identify the most likely matching screenshot
2. Determine the corresponding deeplink path (convert underscores back to slashes where appropriate)
3. Identify any required parameters (marked with ':' or '?' in the path)
4. If there are multiple good matches, include them as alternatives

Your response should be in this format:
BEST_MATCH: [screenshot filename]
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
`
                        }
                    ]
                },
                {
                    role: 'user',
                    content: [
                        {
                            text: `User description: "${input.description}"`
                        }
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
