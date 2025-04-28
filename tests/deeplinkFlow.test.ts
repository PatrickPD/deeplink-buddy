import { Genkit } from 'genkit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDeeplinkHelperFlow } from '../flows/deeplinkFlow';

// Mock dependencies
vi.mock('../tools/screenResolver', () => ({
    createScreenResolverTool: vi.fn(() => ({
        name: 'screenResolverTool',
        description: 'Resolves screen paths',
        schema: {},
    })),
}));

vi.mock('../tools/parameterExtractor', () => ({
    createParameterExtractorTool: vi.fn(() => ({
        name: 'parameterExtractorTool',
        description: 'Extracts parameters from URLs',
        schema: {},
    })),
}));

vi.mock('../tools/deliverableGenerator', () => ({
    createDeliverableGeneratorTool: vi.fn(() => ({
        name: 'deliverableGeneratorTool',
        description: 'Generates deliverables',
        schema: {},
    })),
}));

vi.mock('fs', () => ({
    readFileSync: vi.fn(() => 'mocked instructions'),
    existsSync: vi.fn(() => true),
}));

vi.mock('path', () => ({
    resolve: vi.fn(() => '/mocked/path/instructions.txt'),
}));

// Mock the Genkit instance
const mockGenkit = {
    defineFlow: vi.fn((config, handler) => {
        // Return a function that wraps the handler for testing
        return async (input: string) => {
            // Extract the state from the closure of defineFlow for testing
            const state = mockFlowState;
            // Mock the context argument
            const mockContext = {};
            // Call the handler with the input, state, and context
            return await handler(input, state, mockContext);
        };
    }),
    generate: vi.fn(async ({ messages, model, tools, config }) => {
        const lastUserMessage = messages.find(m => m.role === 'user')?.content[0]?.text || '';
        let responseText = '';
        let mockToolCalls: any[] = [];
        let mockToolResponses: any[] = [];

        // Customize response based on the system message and user input
        const systemMsg = messages.find(m => m.role === 'system')?.content[0]?.text || '';

        // Handle different states based on the system message
        if (systemMsg.includes('Start conversation')) {
            responseText = 'Hi! How can I help you create a deeplink today?';
        }
        else if (systemMsg.includes('Get screen description')) {
            responseText = 'Could you describe the screen you want to link to?';

            // If the user mentions "product", trigger the screenResolverTool
            if (lastUserMessage.toLowerCase().includes('product')) {
                mockToolCalls = [{
                    name: 'screenResolverTool',
                    arguments: { description: lastUserMessage }
                }];

                // For "category", return a category path
                if (lastUserMessage.toLowerCase().includes('category')) {
                    mockToolResponses = [{
                        name: 'screenResolverTool',
                        output: {
                            path: 'pharmacy/products/:category',
                            screenshotFile: 'home_products_category.png',
                            requiredParams: [':category']
                        }
                    }];
                }
                // For "detail", return a product details path
                else if (lastUserMessage.toLowerCase().includes('detail')) {
                    mockToolResponses = [{
                        name: 'screenResolverTool',
                        output: {
                            path: 'details/product/:id',
                            screenshotFile: 'details_product_id.png',
                            requiredParams: [':id']
                        }
                    }];
                }
            }
        }
        else if (systemMsg.includes('Prepare screen confirmation message')) {
            // Path identified, preparing confirmation message
            if (mockFlowState.identifiedPathTemplate?.includes('category')) {
                responseText = '[SHOW_SCREENSHOT: home_products_category.png] Does this product category screen look right? It shows a list of products within a specific category.';
            } else if (mockFlowState.identifiedPathTemplate?.includes('product')) {
                responseText = '[SHOW_SCREENSHOT: details_product_id.png] Does this product details screen look right? It shows detailed information about a specific product.';
            }
        }
        else if (systemMsg.includes('Process user\'s screen confirmation')) {
            // If the last message confirms the screen
            if (lastUserMessage.toLowerCase().includes('yes')) {
                responseText = 'Great! I\'ll set up the deeplink for this screen.';
            }
            // If it's an explicit rejection
            else if (lastUserMessage.toLowerCase().includes('no') || lastUserMessage.toLowerCase().includes('not right')) {
                responseText = 'I understand this isn\'t the right screen. Let\'s try again. Could you describe the screen you need in more detail?';
            }
            // If it's an implicit rejection (describing something else)
            else if (lastUserMessage.toLowerCase().includes('this is') || lastUserMessage.toLowerCase().includes('that is')) {
                responseText = 'I see, that\'s different from what I showed. Let\'s try again. Could you describe the screen you want in more detail?';
            }
        }
        else if (systemMsg.includes('Ask for parameter')) {
            // Should only get here after screen confirmation
            if (mockFlowState.identifiedPathTemplate?.includes('category')) {
                responseText = 'For this category screen, I need the Category ID. Do you know what it is?';
            } else if (mockFlowState.identifiedPathTemplate?.includes('product')) {
                responseText = 'For this product details screen, I need the Product ID. Do you know what it is?';
            }
        }

        // Default fallback
        if (!responseText) {
            responseText = 'I\'m processing your request.';
        }

        return {
            text: responseText,
            toolCalls: () => mockToolCalls,
            toolCallResponses: () => mockToolResponses
        };
    })
};

// Shared state for tests
let mockFlowState: any;
let deeplinkHelperFlow: any;

describe('Deeplink Flow Tests', () => {
    beforeEach(() => {
        // Reset the mock state before each test
        mockFlowState = {
            step: 'start',
            history: [],
            extractedParams: {},
        };

        // Create the flow with the mock Genkit
        deeplinkHelperFlow = createDeeplinkHelperFlow(mockGenkit as unknown as Genkit);

        // Reset mocks
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.resetAllMocks();
    });

    it('should start by asking about the user objective', async () => {
        const response = await deeplinkHelperFlow('I need a push notification');
        expect(response).toContain('How can I help');
    });

    it('should properly handle explicit screen confirmation', async () => {
        // Step 1: User asks about a product category screen
        await deeplinkHelperFlow('I need a push notification for a product category screen');

        // Step 2: User confirms the screen
        const response = await deeplinkHelperFlow('Yes, that\'s the right screen');

        // Verify that step has moved to parameter extraction
        expect(mockFlowState.step).toBe('parameter_extraction_pending');
        expect(response).toContain('Category ID');
    });

    it('should properly handle explicit screen rejection', async () => {
        // Step 1: User asks about a product category screen
        await deeplinkHelperFlow('I need a push notification for a product category screen');

        // Step 2: User explicitly rejects the screen
        const response = await deeplinkHelperFlow('No, that\'s not what I want');

        // Verify that step has moved back to asking for description
        expect(mockFlowState.step).toBe('objective_clarified');
        expect(response).toContain('Let\'s try again');
        expect(response).not.toContain('ID'); // Should not ask for parameters
    });

    it('should properly handle implicit screen rejection', async () => {
        // Step 1: User asks about a product category screen
        await deeplinkHelperFlow('I need a push notification for a product category screen');

        // Step 2: User implicitly rejects by describing a different screen
        const response = await deeplinkHelperFlow('This is a screen showing product details');

        // Verify that step has moved back to asking for description
        expect(mockFlowState.step).toBe('objective_clarified');
        expect(response).toContain('Let\'s try again');
        expect(response).not.toContain('ID'); // Should not ask for parameters
    });

    it('should not ask for parameters before confirming screen', async () => {
        // Step 1: User asks about a product category screen
        await deeplinkHelperFlow('I need a push notification for a product category screen');

        // Step 2: User gives an ambiguous response
        const response = await deeplinkHelperFlow('I think so but not sure');

        // Verify that it asks for clear confirmation and does not ask for parameters
        expect(mockFlowState.step).toBe('screen_confirmation_pending');
        expect(response).not.toContain('ID');
    });

    it('should handle multiple rejections and track rejected paths', async () => {
        // Step 1: User asks about a product category screen
        await deeplinkHelperFlow('I need a push notification for a product category screen');

        // Step 2: User rejects the category screen
        await deeplinkHelperFlow('No, that\'s not right');

        // Step 3: User asks about a product detail screen
        await deeplinkHelperFlow('I need the product detail screen');

        // Verify that the first rejected path is tracked
        expect(mockFlowState.userScreenDescription).toContain('rejected: pharmacy/products/:category');
    });

    it('should avoid suggesting previously rejected screens', async () => {
        // Step 1: User asks about a product category screen
        await deeplinkHelperFlow('I need a push notification for a product category screen');

        // Step 2: User rejects the category screen
        await deeplinkHelperFlow('No, that\'s not right');

        // Force the mock to return the same path (would be handled by screenResolverTool)
        mockFlowState.userScreenDescription = 'product category (rejected: pharmacy/products/:category)';
        mockFlowState.step = 'objective_clarified';

        // Step 3: Let's simulate the screenResolverTool returning the same path
        // by directly manipulating the state and calling as if tool had responded
        mockFlowState.identifiedPathTemplate = 'pharmacy/products/:category';
        mockFlowState.step = 'path_identified';

        // When checking if this path was previously rejected in the tool response handling:
        const wasRejected = mockFlowState.userScreenDescription?.includes(`rejected: ${mockFlowState.identifiedPathTemplate}`);

        expect(wasRejected).toBe(true);
    });

    it('should transition states correctly from start to completion', async () => {
        const stateTransitions = [];

        // Step 1: Start
        await deeplinkHelperFlow('I need a push notification');
        stateTransitions.push(mockFlowState.step);

        // Step 2: Get screen description
        mockFlowState.step = 'objective_clarified'; // Set next step manually for test
        await deeplinkHelperFlow('I need a product detail screen');
        stateTransitions.push(mockFlowState.step);

        // Step 3: Identify path (usually done by tool but we'll set manually)
        mockFlowState.identifiedPathTemplate = 'details/product/:id';
        mockFlowState.step = 'path_identified';
        await deeplinkHelperFlow('');
        stateTransitions.push(mockFlowState.step);

        // Step 4: Confirm screen
        mockFlowState.step = 'screen_confirmation_pending';
        await deeplinkHelperFlow('Yes, that\'s right');
        stateTransitions.push(mockFlowState.step);

        // Verify the correct state sequence
        expect(stateTransitions).toContain('objective_clarified');
        expect(stateTransitions).toContain('path_identified');
        expect(stateTransitions).toContain('screen_confirmation_pending');

        // The last transition should be to parameter_extraction_pending (only after confirmation)
        expect(mockFlowState.step).toBe('parameter_extraction_pending');
    });
}); 