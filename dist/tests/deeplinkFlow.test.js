"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const deeplinkFlow_1 = require("../flows/deeplinkFlow");
// Mock dependencies
vitest_1.vi.mock('../tools/screenResolver', () => ({
    createScreenResolverTool: vitest_1.vi.fn(() => ({
        name: 'screenResolverTool',
        description: 'Resolves screen paths',
        schema: {},
    })),
}));
vitest_1.vi.mock('../tools/parameterExtractor', () => ({
    createParameterExtractorTool: vitest_1.vi.fn(() => ({
        name: 'parameterExtractorTool',
        description: 'Extracts parameters from URLs',
        schema: {},
    })),
}));
vitest_1.vi.mock('../tools/deliverableGenerator', () => ({
    createDeliverableGeneratorTool: vitest_1.vi.fn(() => ({
        name: 'deliverableGeneratorTool',
        description: 'Generates deliverables',
        schema: {},
    })),
}));
vitest_1.vi.mock('fs', () => ({
    readFileSync: vitest_1.vi.fn(() => 'mocked instructions'),
    existsSync: vitest_1.vi.fn(() => true),
    readdirSync: vitest_1.vi.fn(() => [
        'home.png',
        'profile.png',
        'product_details_123.png',
        'home_products_category.png',
        'basket.png'
    ]),
}));
vitest_1.vi.mock('path', () => ({
    resolve: vitest_1.vi.fn(() => '/mocked/path/instructions.txt'),
}));
// Mock the Genkit instance
const mockGenkit = {
    defineFlow: vitest_1.vi.fn((config, handler) => {
        // Return a function that wraps the handler for testing
        return async (input) => {
            // Extract the state from the closure of defineFlow for testing
            const state = mockFlowState;
            // Mock the context argument
            const mockContext = {};
            // Call the handler with the input, state, and context
            return await handler(input, state, mockContext);
        };
    }),
    generate: vitest_1.vi.fn(async ({ messages, model, tools, config }) => {
        const lastUserMessage = messages.find((m) => m.role === 'user')?.content[0]?.text || '';
        let responseText = '';
        let mockToolCalls = [];
        let mockToolResponses = [];
        // Customize response based on the system message and user input
        const systemMsg = messages.find((m) => m.role === 'system')?.content[0]?.text || '';
        // Handle different states based on the system message
        if (systemMsg.includes('Start conversation')) {
            responseText = 'Hi! How can I help you create a deeplink today?';
        }
        else if (systemMsg.includes('Get screen description')) {
            if (lastUserMessage.includes("upload screenshot") || lastUserMessage.includes("can't upload")) {
                responseText = 'I understand you\'re having trouble uploading screenshots. Please provide a detailed description of the screen instead.';
            }
            else {
                responseText = 'Could you describe the screen you want to link to? If possible, uploading a screenshot would be very helpful for accurate identification.';
            }
            // If the user mentions "product", trigger the screenResolverTool
            if (lastUserMessage.toLowerCase().includes('product')) {
                mockToolCalls = [{
                        name: 'screenResolverTool',
                        arguments: { description: lastUserMessage }
                    }];
                // For "category", return a category path with alternatives
                if (lastUserMessage.toLowerCase().includes('category')) {
                    mockToolResponses = [{
                            name: 'screenResolverTool',
                            output: {
                                path: 'pharmacy/products/:category',
                                screenshotFile: 'home_products_category.png',
                                requiredParams: [':category'],
                                alternativeMatches: [
                                    {
                                        path: 'details/product/:id',
                                        screenshotFile: 'product_details_123.png',
                                        description: 'Product details screen showing individual product information'
                                    },
                                    {
                                        path: 'basket',
                                        screenshotFile: 'basket.png',
                                        description: 'Shopping basket with added products'
                                    }
                                ]
                            }
                        }];
                }
                // For "detail", return a product details path
                else if (lastUserMessage.toLowerCase().includes('detail')) {
                    mockToolResponses = [{
                            name: 'screenResolverTool',
                            output: {
                                path: 'details/product/:id',
                                screenshotFile: 'product_details_123.png',
                                requiredParams: [':id']
                            }
                        }];
                }
                // For vague "products" description, return multiple matches
                else if (lastUserMessage.toLowerCase().includes('products') && !lastUserMessage.toLowerCase().includes('category') && !lastUserMessage.toLowerCase().includes('detail')) {
                    mockToolResponses = [{
                            name: 'screenResolverTool',
                            output: {
                                path: 'details/product/:id',
                                screenshotFile: 'product_details_123.png',
                                requiredParams: [':id'],
                                alternativeMatches: [
                                    {
                                        path: 'pharmacy/products/:category',
                                        screenshotFile: 'home_products_category.png',
                                        description: 'Product category listing screen'
                                    },
                                    {
                                        path: 'basket',
                                        screenshotFile: 'basket.png',
                                        description: 'Shopping basket with products'
                                    }
                                ]
                            }
                        }];
                }
            }
        }
        else if (systemMsg.includes('Prepare screen confirmation message')) {
            // Path identified, preparing confirmation message
            if (mockFlowState.identifiedPathTemplate?.includes('category')) {
                responseText = '[SHOW_SCREENSHOT: home_products_category.png] Does this product category screen look right? It shows a list of products within a specific category.';
            }
            else if (mockFlowState.identifiedPathTemplate?.includes('product')) {
                responseText = '[SHOW_SCREENSHOT: product_details_123.png] Does this product details screen look right? It shows detailed information about a specific product.';
            }
            else if (mockFlowState.identifiedPathTemplate?.includes('basket')) {
                responseText = '[SHOW_SCREENSHOT: basket.png] Does this shopping basket screen look right? It shows products you\'ve added to your basket.';
            }
        }
        else if (systemMsg.includes('Process user\'s screen confirmation')) {
            // If the last message confirms the screen
            if (lastUserMessage.toLowerCase().includes('yes')) {
                responseText = 'Great! I\'ll set up the deeplink for this screen.';
                // Move to parameter extraction in state directly
                mockFlowState.step = 'parameter_extraction_pending';
                mockFlowState.parameterToExtract = mockFlowState.requiredParams?.[0];
            }
            // If it's an explicit rejection
            else if (lastUserMessage.toLowerCase().includes('no') || lastUserMessage.toLowerCase().includes('not right')) {
                responseText = 'I understand this isn\'t the right screen. Let\'s try again. Could you describe the screen you need in more detail?';
                // Move back to description state
                mockFlowState.step = 'objective_clarified';
            }
            // If it's an implicit rejection (describing something else)
            else if (lastUserMessage.toLowerCase().includes('this is') || lastUserMessage.toLowerCase().includes('that is')) {
                responseText = 'I see, that\'s different from what I showed. Let\'s try again. Could you describe the screen you want in more detail?';
                // Move back to description state
                mockFlowState.step = 'objective_clarified';
            }
        }
        else if (systemMsg.includes('Ask for parameter')) {
            // Should only get here after screen confirmation
            if (mockFlowState.identifiedPathTemplate?.includes('category')) {
                responseText = 'For this category screen, I need the Category ID. Do you know what it is?';
            }
            else if (mockFlowState.identifiedPathTemplate?.includes('product')) {
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
    }),
    defineTool: vitest_1.vi.fn(() => {
        return {};
    }),
};
// Shared state for tests
let mockFlowState;
let deeplinkHelperFlow;
(0, vitest_1.describe)('Deeplink Flow Tests', () => {
    (0, vitest_1.beforeEach)(() => {
        // Reset the mock state before each test
        mockFlowState = {
            step: 'start',
            history: [],
            extractedParams: {},
        };
        // Create the flow with the mock Genkit
        deeplinkHelperFlow = (0, deeplinkFlow_1.createDeeplinkHelperFlow)(mockGenkit);
        // Reset mocks
        vitest_1.vi.clearAllMocks();
    });
    (0, vitest_1.afterEach)(() => {
        vitest_1.vi.resetAllMocks();
    });
    (0, vitest_1.it)('should start by asking about the user objective', async () => {
        vitest_1.vi.mocked(mockGenkit.generate).mockImplementationOnce(async () => ({
            text: 'Hi! How can I help you create a deeplink today?',
            toolCalls: () => [],
            toolCallResponses: () => []
        }));
        const response = await deeplinkHelperFlow('I need a push notification');
        (0, vitest_1.expect)(response).toContain('How can I help');
    });
    (0, vitest_1.it)('should properly handle explicit screen confirmation', async () => {
        // Step 1: User asks about a product category screen
        await deeplinkHelperFlow('I need a push notification for a product category screen');
        // Manually simulate the screenResolverTool response and state transition
        mockFlowState.identifiedPathTemplate = 'pharmacy/products/:category';
        mockFlowState.identifiedScreenshotFile = 'home_products_category.png';
        mockFlowState.requiredParams = [':category'];
        mockFlowState.step = 'path_identified';
        // Step 2: User confirms the screen
        const response = await deeplinkHelperFlow('Yes, that\'s the right screen');
        // Verify that step has moved to parameter extraction
        (0, vitest_1.expect)(mockFlowState.step).toBe('parameter_extraction_pending');
        (0, vitest_1.expect)(response).toContain('Category ID');
    });
    (0, vitest_1.it)('should properly handle explicit screen rejection', async () => {
        // Step 1: User asks about a product category screen
        await deeplinkHelperFlow('I need a push notification for a product category screen');
        // Manually simulate the screenResolverTool response and state transition
        mockFlowState.identifiedPathTemplate = 'pharmacy/products/:category';
        mockFlowState.identifiedScreenshotFile = 'home_products_category.png';
        mockFlowState.requiredParams = [':category'];
        mockFlowState.step = 'path_identified';
        // Step 2: User explicitly rejects the screen
        const response = await deeplinkHelperFlow('No, that\'s not what I want');
        // Verify that step has moved back to asking for description
        (0, vitest_1.expect)(mockFlowState.step).toBe('objective_clarified');
        (0, vitest_1.expect)(response).toContain('Let\'s try again');
        (0, vitest_1.expect)(response).not.toContain('ID'); // Should not ask for parameters
    });
    (0, vitest_1.it)('should properly handle implicit screen rejection', async () => {
        // Step 1: User asks about a product category screen
        await deeplinkHelperFlow('I need a push notification for a product category screen');
        // Manually simulate the screenResolverTool response and state transition
        mockFlowState.identifiedPathTemplate = 'pharmacy/products/:category';
        mockFlowState.identifiedScreenshotFile = 'home_products_category.png';
        mockFlowState.requiredParams = [':category'];
        mockFlowState.step = 'path_identified';
        // Step 2: User implicitly rejects by describing a different screen
        const response = await deeplinkHelperFlow('This is a screen showing product details');
        // Verify that step has moved back to asking for description
        (0, vitest_1.expect)(mockFlowState.step).toBe('objective_clarified');
        (0, vitest_1.expect)(response).toContain('Let\'s try again');
        (0, vitest_1.expect)(response).not.toContain('ID'); // Should not ask for parameters
    });
    (0, vitest_1.it)('should not ask for parameters before confirming screen', async () => {
        // Step 1: User asks about a product category screen
        await deeplinkHelperFlow('I need a push notification for a product category screen');
        // Manually simulate the screenResolverTool response and state transition
        mockFlowState.identifiedPathTemplate = 'pharmacy/products/:category';
        mockFlowState.identifiedScreenshotFile = 'home_products_category.png';
        mockFlowState.requiredParams = [':category'];
        mockFlowState.step = 'screen_confirmation_pending';
        // Step 2: User gives an ambiguous response
        vitest_1.vi.mocked(mockGenkit.generate).mockImplementationOnce(async () => ({
            text: 'I\'m not sure if that\'s a yes or no. Does the screen I showed/described match what you want? Please answer with \'yes\' or \'no\'.',
            toolCalls: () => [],
            toolCallResponses: () => []
        }));
        const response = await deeplinkHelperFlow('I think so but not sure');
        // Verify that it asks for clear confirmation and does not ask for parameters
        (0, vitest_1.expect)(mockFlowState.step).toBe('screen_confirmation_pending');
        (0, vitest_1.expect)(response).not.toContain('ID');
    });
    (0, vitest_1.it)('should handle multiple rejections and track rejected paths', async () => {
        // Step 1: User asks about a product category screen
        await deeplinkHelperFlow('I need a push notification for a product category screen');
        // Manually simulate the screenResolverTool response and state transition
        mockFlowState.identifiedPathTemplate = 'pharmacy/products/:category';
        mockFlowState.identifiedScreenshotFile = 'home_products_category.png';
        mockFlowState.requiredParams = [':category'];
        mockFlowState.step = 'path_identified';
        // Step 2: User rejects the category screen
        await deeplinkHelperFlow('No, that\'s not right');
        // Step 3: Set user screen description with the rejection info
        mockFlowState.userScreenDescription = 'product category (rejected: pharmacy/products/:category)';
        // The user asks for a different screen
        await deeplinkHelperFlow('I need the product detail screen');
        // Verify that the first rejected path is tracked
        (0, vitest_1.expect)(mockFlowState.userScreenDescription).toBeDefined();
        (0, vitest_1.expect)(mockFlowState.userScreenDescription).toContain('rejected: pharmacy/products/:category');
    });
    (0, vitest_1.it)('should avoid suggesting previously rejected screens', async () => {
        // Setup: User rejected a category screen
        mockFlowState.userScreenDescription = 'product category (rejected: pharmacy/products/:category)';
        mockFlowState.step = 'objective_clarified';
        // Simulate the screenResolverTool returning alternatives
        vitest_1.vi.mocked(mockGenkit.generate).mockImplementationOnce(async () => ({
            text: 'I need to identify the screen you want.',
            toolCalls: () => [{
                    name: 'screenResolverTool',
                    arguments: { description: 'product screen' }
                }],
            toolCallResponses: () => []
        })).mockImplementationOnce(async () => ({
            text: '',
            toolCalls: () => [],
            toolCallResponses: () => [{
                    name: 'screenResolverTool',
                    output: {
                        path: 'pharmacy/products/:category', // This was rejected
                        screenshotFile: 'home_products_category.png',
                        requiredParams: [':category'],
                        alternativeMatches: [
                            {
                                path: 'details/product/:id', // This is an alternative
                                screenshotFile: 'product_details_123.png',
                                description: 'Product details screen'
                            }
                        ]
                    }
                }]
        }));
        // User asks for a product screen again
        const response = await deeplinkHelperFlow('I need a product screen');
        // It should use the alternative match instead of the rejected one
        (0, vitest_1.expect)(mockFlowState.identifiedPathTemplate).toBe('details/product/:id');
        (0, vitest_1.expect)(mockFlowState.identifiedScreenshotFile).toBe('product_details_123.png');
    });
    (0, vitest_1.it)('should encourage users to upload screenshots when describing screens', async () => {
        // Step 1: User asks about a screen but is vague
        await deeplinkHelperFlow('I need a link to some screen in the app');
        // Verify the response contains encouragement to upload a screenshot
        const response = await deeplinkHelperFlow('It shows products');
        (0, vitest_1.expect)(response.toLowerCase()).toContain('screenshot');
        (0, vitest_1.expect)(response.toLowerCase()).toContain('upload');
    });
    (0, vitest_1.it)('should present multiple screenshot matches when available', async () => {
        // Mock the screenResolverTool to return multiple matches
        vitest_1.vi.mocked(mockGenkit.generate).mockImplementationOnce(async () => ({
            text: 'I need to identify the screen you want.',
            toolCalls: () => [{
                    name: 'screenResolverTool',
                    arguments: { description: 'screen with products' }
                }],
            toolCallResponses: () => []
        })).mockImplementationOnce(async () => ({
            text: '',
            toolCalls: () => [],
            toolCallResponses: () => [{
                    name: 'screenResolverTool',
                    output: {
                        path: 'details/product/:id',
                        screenshotFile: 'product_details_123.png',
                        requiredParams: [':id'],
                        alternativeMatches: [
                            {
                                path: 'pharmacy/products/:category',
                                screenshotFile: 'home_products_category.png',
                                description: 'Product category listing screen'
                            }
                        ]
                    }
                }]
        }));
        // User provides a vague description
        const response = await deeplinkHelperFlow('I need a screen that shows products');
        // Should present options to the user
        (0, vitest_1.expect)(response).toContain('Main Match');
        (0, vitest_1.expect)(response).toContain('Option 1');
        (0, vitest_1.expect)(response).toContain('product_details_123.png');
        (0, vitest_1.expect)(response).toContain('home_products_category.png');
    });
    (0, vitest_1.it)('should handle user selection from multiple screenshot options', async () => {
        // Setup state with potential matches
        mockFlowState.potentialMatches = [
            {
                path: 'details/product/:id',
                screenshotFile: 'product_details_123.png',
                requiredParams: [':id']
            },
            {
                path: 'pharmacy/products/:category',
                screenshotFile: 'home_products_category.png',
                requiredParams: [':category']
            }
        ];
        mockFlowState.step = 'objective_clarified';
        // User selects option 1 (index 1 in the array)
        const response = await deeplinkHelperFlow('I want option 1');
        // Verify the correct screen was selected
        (0, vitest_1.expect)(mockFlowState.identifiedPathTemplate).toBe('pharmacy/products/:category');
        (0, vitest_1.expect)(mockFlowState.identifiedScreenshotFile).toBe('home_products_category.png');
        (0, vitest_1.expect)(mockFlowState.step).toBe('path_identified');
    });
    (0, vitest_1.it)('should handle upload issues gracefully', async () => {
        // User mentions they can't upload a screenshot
        const response = await deeplinkHelperFlow('I can\'t upload a screenshot');
        (0, vitest_1.expect)(response.toLowerCase()).toContain('detailed description');
    });
});
