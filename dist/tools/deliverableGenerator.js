"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeliverableGeneratorTool = createDeliverableGeneratorTool;
const zod_1 = require("zod");
// QR code generation might require an external library if generating data URLs
// For now, we'll provide instructions or an Adjust link URL for QR codes.
// import * as qrcode from 'qrcode';
// Define the structure for the Firebase Push Payload based on instructions
const FirebasePushPayloadSchema = zod_1.z.object({
    notification: zod_1.z.object({
        title: zod_1.z.string().describe("Notification title (placeholder, user should replace)"),
        body: zod_1.z.string().describe("Notification body (placeholder, user should replace)"),
    }),
    data: zod_1.z.object({
        href: zod_1.z.string().describe("The full gesund:// deeplink"),
        // TODO: Determine if navigation array logic is needed/possible here
        // navigation: z.array(z.string()).optional().describe("Navigation hint array (if applicable)"),
        linkLabel: zod_1.z.string().optional().describe("Optional label for a button in the push notification"),
    }),
    // Add android/apns specific config placeholders if needed by Firebase setup
    // android: z.object({}).optional(),
    // apns: z.object({}).optional(),
}).describe("Structure for Firebase Cloud Messaging push notification payload");
// NOTE: z.record currently breaks @genkit-ai/vertexai's schema conversion (it produces a schema
// with additionalProperties but no explicit `properties`, causing a crash in convertSchemaProperty).
// To work around this, we encode the `parameters` map as an *array* of key/value objects, which
// converts cleanly to JSON Schema (type: "array").
const DeliverableGeneratorInputSchema = zod_1.z.object({
    confirmedPath: zod_1.z.string().describe("The validated canonical path (e.g., 'profile/orders', 'details/product/:id'). Must not contain unsubstituted placeholders like /:id."),
    parameters: zod_1.z.array(zod_1.z.object({ key: zod_1.z.string(), value: zod_1.z.string() })).optional().describe("List of parameter key/value pairs (e.g., [{ key: 'id', value: '12345' }])."),
    requestedDeliverables: zod_1.z.array(zod_1.z.enum(["deeplink", "adjust_steps", "firebase_push", "qr_code"])).min(1).describe("List of asset types requested by the user."),
});
// Define output schema
const DeliverableGeneratorOutputSchema = zod_1.z.object({
    fullDeeplink: zod_1.z.string().nullable().describe("The complete gesund:// deeplink, or null if not requested/applicable."),
    adjustSteps: zod_1.z.string().nullable().describe("Markdown text guiding the user through Adjust Campaign Lab UI steps, or null if not requested."),
    firebasePushPayload: FirebasePushPayloadSchema.nullable().describe("JSON structure for Firebase push notification payload, or null if not requested."),
    qrCodeInfo: zod_1.z.string().nullable().describe("Instructions or a URL for generating the QR code, or null if not requested."),
    testingChecklist: zod_1.z.string().describe("Standard testing checklist text."),
    notes: zod_1.z.string().nullable().describe("Any additional notes or warnings (e.g., Dynamic Links deprecation)."),
    error: zod_1.z.string().nullable().describe("Error message if generation failed (e.g., path still contains placeholders)."),
});
// Revert to factory function
function createDeliverableGeneratorTool(aiInstance) {
    return aiInstance.defineTool({
        name: 'deliverableGenerator',
        description: 'Generates the final deeplink asset(s) (full deeplink, push payload, Adjust UI steps, QR code info) based on the confirmed screen path and parameters.',
        inputSchema: DeliverableGeneratorInputSchema,
        outputSchema: DeliverableGeneratorOutputSchema,
    }, async (input) => {
        let fullDeeplink = null;
        let adjustSteps = null;
        let firebasePushPayload = null;
        let qrCodeInfo = null;
        const notes = [];
        let error = null;
        let pathWithParams = input.confirmedPath;
        console.log(`[deliverableGeneratorTool] Generating for path: ${input.confirmedPath}, params: ${JSON.stringify(input.parameters)}, deliverables: ${input.requestedDeliverables.join(', ')}`);
        // 1. Substitute parameters into the path
        if (input.parameters) {
            // Convert the array of key/value objects into a Record<string,string> for easier lookup
            const paramRecord = {};
            for (const { key, value } of input.parameters) {
                paramRecord[key] = value;
            }
            try {
                let tempPath = input.confirmedPath;
                for (const key in paramRecord) {
                    const value = paramRecord[key];
                    const requiredPlaceholder = `:${key}`;
                    const optionalPlaceholder = `:${key}?`;
                    if (tempPath.includes(requiredPlaceholder)) {
                        tempPath = tempPath.replace(requiredPlaceholder, encodeURIComponent(value));
                    }
                    else if (tempPath.includes(optionalPlaceholder)) {
                        tempPath = tempPath.replace(optionalPlaceholder, encodeURIComponent(value));
                    }
                    else {
                        console.warn(`[deliverableGeneratorTool] Parameter '${key}' provided but no matching placeholder found in path segment: ${tempPath}`);
                    }
                }
                // NEW: Remove any remaining optional placeholders (those for which no value was provided)
                // Regex: /:([a-zA-Z0-9_]+)\\?/g finds all occurrences of ':<paramName>?'
                tempPath = tempPath.replace(/:([a-zA-Z0-9_]+)\?/g, '');
                // Optional: Clean up trailing slashes if an optional param was at the end
                tempPath = tempPath.replace(/\/$/, ''); // Remove trailing slash if present
                // Check if we still have required placeholders after removing optional ones and substituting others
                if (/:[^/?]+/.test(tempPath)) { // Check against tempPath *before* splitting off query string
                    throw new Error(`Path still contains unsubstituted required parameters after optional removal: ${tempPath}`);
                }
                const [basePath, queryString] = tempPath.split('?');
                if (queryString) {
                    const params = new URLSearchParams(queryString);
                    const encodedParams = new URLSearchParams();
                    let queryContainsPlaceholders = false;
                    params.forEach((value, key) => {
                        if (value.startsWith(':')) {
                            console.error(`[deliverableGeneratorTool] Error: Query parameter '${key}' still contains placeholder '${value}'.`);
                            queryContainsPlaceholders = true;
                        }
                        else {
                            encodedParams.set(key, encodeURIComponent(params.get(key) || value));
                        }
                    });
                    if (queryContainsPlaceholders) {
                        throw new Error("Query string contains unsubstituted placeholders.");
                    }
                    pathWithParams = encodedParams.toString() ? `${basePath}?${encodedParams.toString()}` : basePath;
                }
                else {
                    pathWithParams = basePath;
                }
                // Check for remaining *required* placeholders AFTER removing optional ones
                if (/:[^/?]+/.test(pathWithParams)) {
                    throw new Error(`Path still contains unsubstituted required parameters: ${pathWithParams}`);
                }
                console.log(`[deliverableGeneratorTool] Path after param substitution: ${pathWithParams}`);
            }
            catch (e) {
                console.error(`[deliverableGeneratorTool] Error during parameter substitution: ${e.message}`);
                error = `Failed to substitute parameters: ${e.message}`;
                // Return error object matching output schema
                return { fullDeeplink: null, adjustSteps: null, firebasePushPayload: null, qrCodeInfo: null, testingChecklist: "Error during parameter substitution.", notes: null, error };
            }
        }
        // 2. Generate requested deliverables
        const gesundScheme = "gesund://";
        const finalDeeplink = `${gesundScheme}${pathWithParams}`;
        if (input.requestedDeliverables.includes("deeplink")) {
            fullDeeplink = finalDeeplink;
        }
        if (input.requestedDeliverables.includes("adjust_steps")) {
            adjustSteps = `
Okay, here's how to create the Adjust link for \`${pathWithParams}\`:\n1. Go to Adjust Campaign Lab → Custom Links.\n2. Click 'New link'.\n3. Select App: \`gesund.de\` (or the correct app variant).\n4. Fill in the Channel/Campaign/Adgroup/Creative details.\n5. Under 'User destinations', click 'Add condition'.\n6. Choose 'In-app screen' or 'Deeplink'.\n7. Paste the path: \`${pathWithParams}\` (make sure to remove the \`${gesundScheme}\` scheme if Adjust adds it automatically).\n8. Configure fallback destinations (App Store, Play Store).\n9. Review your settings and click 'Create link'.\nRemember to use the correct Adjust environment prefix (\`nnm2\`, \`8nhh\`, etc.) for the short URL (e.g., https://nnm2.adj.st/xxxxxx).\n`;
        }
        if (input.requestedDeliverables.includes("firebase_push")) {
            firebasePushPayload = {
                notification: {
                    title: "Example Title (Replace Me)",
                    body: "Example Body (Replace Me)",
                },
                data: {
                    href: finalDeeplink,
                    linkLabel: "Optional Button Label",
                },
            };
        }
        if (input.requestedDeliverables.includes("qr_code")) {
            qrCodeInfo = `It's recommended to generate an Adjust link first (using the steps above if requested). Then, create a QR code pointing to the **Adjust short URL** (e.g., https://nnm2.adj.st/xxxxxx) rather than the direct deeplink (\`${finalDeeplink}\`). Using the Adjust link ensures better tracking and fallback behavior if the app isn't installed. Ensure the QR code is at least 2cm x 2cm with Medium (M) error correction.`;
        }
        notes.push("Remember Google Dynamic Links will be deprecated after August 25, 2025. Adjust links are the recommended replacement.");
        const testingChecklist = `
**Testing Checklist:**
*   **Latest App Version:** Paste the Adjust link or direct deeplink (\`${fullDeeplink ?? 'N/A'}\`) into WhatsApp/Signal and tap it.
*   **Older App Version:** Paste the link into Notes/Email and tap it.
*   **App Not Installed:** Tap the Adjust link/scan QR → Go to Store → Install → Open → Verify correct screen.
*   **QR Code:** Ensure it's min 2cm², error-correction 'M', points to the **Adjust link**, and scans easily.
*   **Adjust Reset:** If testing attribution, go to Adjust Dashboard → Test Devices → Remove your device → Relaunch app *before* clicking the Adjust link.

Does this work for you? Do you need help testing?
`;
        console.log("[deliverableGeneratorTool] Generation complete.");
        // Return full object matching output schema
        return {
            fullDeeplink,
            adjustSteps,
            firebasePushPayload,
            qrCodeInfo,
            testingChecklist,
            notes: notes.length > 0 ? notes.join('\n') : null,
            error: null, // Explicitly null if no error
        };
    });
}
