import { vertexAI } from '@genkit-ai/vertexai'; // Vertex AI plugin
import { initializeApp } from 'firebase-admin/app'; // Firebase Admin SDK
import { genkit } from 'genkit'; // Main Genkit import
// Firebase imports removed due to persistent resolution issues
// import { firebase, firestoreStateStore } from '@genkit-ai/firebase'; 
import { startFlowServer } from '@genkit-ai/express'; // Correct import path
import { createDeeplinkHelperFlow } from './flows/deeplinkFlow'; // Import the factory function instead of the flow directly

// Import flow management functions if needed later - check v1.x docs
// import { FlowState, getFlowState, resumeFlow, runFlow } from 'genkit'; 

// Initialize Firebase Admin SDK 
initializeApp();

// Initialize Genkit with plugins
export const ai = genkit({
    plugins: [
        // Configure Vertex AI plugin with explicit projectId
        vertexAI({
            location: 'us-central1',
            projectId: 'deeplink-buddy' // <<<--- Add your Project ID here
        }),
    ],
});

// Create the flow using the factory and the initialized ai instance
const deeplinkHelperFlow = createDeeplinkHelperFlow(ai);

/* Commenting out the custom Express server for now.
// ... (rest of commented out Express code) ...
*/

// Export the created flow
export { deeplinkHelperFlow };

// Start the flow server, passing the created flow
startFlowServer({ flows: [deeplinkHelperFlow] }); 
