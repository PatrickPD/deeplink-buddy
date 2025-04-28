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
exports.screenResolverToolFn = exports.screenResolverToolConfig = void 0;
exports.createScreenResolverTool = createScreenResolverTool;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const zod_1 = require("zod");
const systemPrompt_1 = require("../prompts/systemPrompt"); // Import helper
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
const ScreenResolverInputSchema = zod_1.z.object({
    userDescription: zod_1.z.string().describe("User's description of the desired screen (e.g., 'product page', 'order history', 'AGB')"),
    // LLM should provide the path it identified based on the description and reference docs
    identifiedPath: zod_1.z.string().describe("The canonical deeplink path (without gesund://) identified by the LLM from linkingConfig.ts based on the user description."),
    // LLM provides the description it found
    pathDescription: zod_1.z.string().describe("Textual description of the screen identified by the LLM from deeplink_targets.txt."),
    // LLM determines required params based on the path structure in linkingConfig
    requiredParams: zod_1.z.array(zod_1.z.string()).nullable().optional().describe("List of required parameters (e.g., [':id', ':category']) identified by the LLM for the path, or null if none."),
});
// Define output schema
const ScreenResolverOutputSchema = zod_1.z.object({
    likelyPath: zod_1.z.string().describe("The confirmed canonical deeplink path provided as input."),
    screenDescription: zod_1.z.string().describe("The textual description provided as input."),
    screenshotFilename: zod_1.z.string().nullable().describe("Filename of the corresponding screenshot (e.g., 'profile_orders.png') if found in the screenshots directory, otherwise null."),
    requiredParams: zod_1.z.array(zod_1.z.string()).nullable().describe("List of required parameters provided as input."),
    error: zod_1.z.string().nullable().describe("Error message if screenshot check failed (but identification is based on input)."),
});
// Export the configuration for the tool
exports.screenResolverToolConfig = {
    name: 'screenResolver',
    description: 'Identifies the target app screen based on user description, finds its canonical path from linkingConfig, description from targets, and checks for a corresponding screenshot. Relies on LLM context for linkingConfig/targets mapping.',
    inputSchema: ScreenResolverInputSchema,
    outputSchema: ScreenResolverOutputSchema,
};
// Export the implementation function for the tool
const screenResolverToolFn = async (input) => {
    const identifiedPath = input.identifiedPath;
    const potentialFilename = (0, systemPrompt_1.normalizePathForScreenshot)(identifiedPath);
    let foundFilename = null;
    let checkError = null;
    try {
        const fullScreenshotDir = path.resolve(SCREENSHOT_DIR);
        const fullScreenshotPath = path.join(fullScreenshotDir, potentialFilename);
        if (!fs.existsSync(fullScreenshotDir)) {
            console.warn(`Screenshots directory not found: ${fullScreenshotDir}`);
            checkError = `Screenshots directory not found at configured path: ${SCREENSHOT_DIR}`;
        }
        else if (fs.existsSync(fullScreenshotPath)) {
            console.log(`[screenResolverTool] Found screenshot: ${fullScreenshotPath}`);
            foundFilename = potentialFilename;
        }
        else {
            console.log(`[screenResolverTool] Screenshot not found: ${fullScreenshotPath}`);
        }
    }
    catch (err) {
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
exports.screenResolverToolFn = screenResolverToolFn;
// Revert to factory function
function createScreenResolverTool(aiInstance) {
    return aiInstance.defineTool({
        name: 'screenResolver',
        description: 'Identifies the target app screen..., checks for screenshot...',
        inputSchema: ScreenResolverInputSchema,
        outputSchema: ScreenResolverOutputSchema,
    }, async (input) => {
        // Restore the full original implementation logic here
        const identifiedPath = input.identifiedPath;
        const potentialFilename = (0, systemPrompt_1.normalizePathForScreenshot)(identifiedPath);
        let foundFilename = null;
        let checkError = null;
        try {
            const fullScreenshotDir = path.resolve(SCREENSHOT_DIR);
            const fullScreenshotPath = path.join(fullScreenshotDir, potentialFilename);
            if (!fs.existsSync(fullScreenshotDir)) {
                console.warn(`Screenshots directory not found: ${fullScreenshotDir}`);
                checkError = `Screenshots directory not found at configured path: ${SCREENSHOT_DIR}`;
            }
            else if (fs.existsSync(fullScreenshotPath)) {
                console.log(`[screenResolverTool] Found screenshot: ${fullScreenshotPath}`);
                foundFilename = potentialFilename;
            }
            else {
                console.log(`[screenResolverTool] Screenshot not found: ${fullScreenshotPath}`);
            }
        }
        catch (err) {
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
    });
}
