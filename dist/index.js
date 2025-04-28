"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deeplinkHelperFlow = exports.ai = void 0;
const vertexai_1 = require("@genkit-ai/vertexai"); // Vertex AI plugin
const app_1 = require("firebase-admin/app"); // Firebase Admin SDK
const genkit_1 = require("genkit"); // Main Genkit import
// Firebase imports removed due to persistent resolution issues
// import { firebase, firestoreStateStore } from '@genkit-ai/firebase'; 
const express_1 = require("@genkit-ai/express"); // Correct import path
const deeplinkFlow_1 = require("./flows/deeplinkFlow"); // Import the factory function instead of the flow directly
// Import flow management functions if needed later - check v1.x docs
// import { FlowState, getFlowState, resumeFlow, runFlow } from 'genkit'; 
// Initialize Firebase Admin SDK 
(0, app_1.initializeApp)();
// Initialize Genkit with plugins
exports.ai = (0, genkit_1.genkit)({
    plugins: [
        // Configure Vertex AI plugin with explicit projectId
        (0, vertexai_1.vertexAI)({
            location: 'us-central1',
            projectId: 'deeplink-buddy' // <<<--- Add your Project ID here
        }),
    ],
});
// Create the flow using the factory and the initialized ai instance
const deeplinkHelperFlow = (0, deeplinkFlow_1.createDeeplinkHelperFlow)(exports.ai);
exports.deeplinkHelperFlow = deeplinkHelperFlow;
// Start the flow server, passing the created flow
(0, express_1.startFlowServer)({ flows: [deeplinkHelperFlow] });
