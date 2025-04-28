"use strict";
/**
 * Integration Test for Deeplink Flow
 *
 * This test simulates actual conversation scenarios to verify
 * the agent behavior when users reject screens with different types of responses.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.testScenarios = exports.fixValidationChecklist = exports.bugReproductionCase = void 0;
// Manual test scenarios that can be run to verify agent behavior
// These should be run after applying fixes to verify the implementation works correctly
const testScenarios = {
    /**
     * Test Scenario 1: User describes a product category screen
     * but the agent incorrectly shows a product detail page,
     * which gets rejected
     */
    explicitRejectionScenario: [
        {
            user: "I need a push notification that links to a product category page in my app",
            expectedAgentResponse: "Okay, it looks like you want to link to the Product List screen which displays products within a specified category. Does this look right?",
            expectedState: "screen_confirmation_pending"
        },
        {
            user: "No, that's not right",
            expectedAgentResponse: "I understand that's not the right screen. Let's try again. Could you describe the specific screen you want to link to in more detail?",
            expectedState: "objective_clarified",
            // Critical check: should NOT contain phrases asking for parameters
            shouldNotContain: ["ID", "product ID", "category ID"]
        }
    ],
    /**
     * Test Scenario 2: User says the displayed screen is something else
     * (the EXACT scenario where the bug occurred)
     */
    implicitRejectionScenario: [
        {
            user: "I need a push notification that links to a product category page in my app",
            expectedAgentResponse: "Okay, it looks like you want to link to the Product List screen which displays products within a specified category. Does this look right?",
            expectedState: "screen_confirmation_pending"
        },
        {
            user: "this is a screen with the details about a specific product.",
            expectedAgentResponse: "I understand that's not the right screen. Let's try again. Could you describe the specific screen you want to link to in more detail?",
            expectedState: "objective_clarified",
            // Critical check: should NOT contain phrases asking for parameters
            shouldNotContain: ["ID", "product ID", "category ID"]
        }
    ],
    /**
     * Test Scenario 3: User rejects multiple screens before confirming
     */
    multipleRejectionScenario: [
        {
            user: "I need a push notification that links to a product category page",
            expectedAgentResponse: "Okay, it looks like you want to link to the Product List screen which displays products within a specified category. Does this look right?",
            expectedState: "screen_confirmation_pending"
        },
        {
            user: "No, that's not right",
            expectedAgentResponse: "I understand that's not the right screen. Let's try again. Could you describe the specific screen you want to link to in more detail?",
            expectedState: "objective_clarified"
        },
        {
            user: "I want the page that shows offers and discounts",
            expectedAgentResponse: "Okay, it looks like you want to link to the Offers & Discounts screen which displays current promotions. Does this look right?",
            expectedState: "screen_confirmation_pending"
        },
        {
            user: "This is more like a section of the homepage",
            expectedAgentResponse: "I understand that's not the right screen. Let's try again. Could you describe the specific screen you want to link to in more detail?",
            expectedState: "objective_clarified",
            shouldNotContain: ["ID", "product ID", "category ID"]
        }
    ],
    /**
     * Test Scenario 4: Happy path - confirmation then parameters
     */
    correctSequenceScenario: [
        {
            user: "I need a push notification that links to a product details page",
            expectedAgentResponse: "Okay, it looks like you want to link to the Product Details screen which shows information about a specific product. Does this look right?",
            expectedState: "screen_confirmation_pending"
        },
        {
            user: "Yes, that's right",
            expectedAgentResponse: "Great! For this Product Details screen, I need the Product ID. Do you know what it is?",
            expectedState: "parameter_extraction_pending",
            // Here it's correct to ask for parameter AFTER screen confirmation
            shouldContain: ["ID", "Product ID"]
        }
    ]
};
exports.testScenarios = testScenarios;
/**
 * Real-world error case that occurred in production
 * (exact transcript from the user conversation)
 */
const bugReproductionCase = [
    {
        user: "I need a push notification that links to a product category page in my app",
        expectedAgentResponse: "Okay, it looks like you want to link to the Product List screen which displays products within a specified category. Does this look right?"
    },
    {
        user: "this is a screen with the details about a specific product.",
        expectedAgentResponse: "I understand that's not the right screen. Let's try again. Could you describe the specific screen you want to link to in more detail?"
        // In the bug case, it instead asked for product ID
        // Bug response was: "Okay, I understand. You need a push notification that links to a product details screen, not a product category list. Let's try again. What is the product ID? I need that to create the deep link."
    },
    {
        user: "hm still not this one",
        // Should offer a different screen or ask for more details
        // Should NEVER ask for an ID at this point
    }
];
exports.bugReproductionCase = bugReproductionCase;
/**
 * How to manually test after code fixes:
 *
 * 1. Start the deeplink agent in development mode
 * 2. Run through each conversation thread in the test scenarios
 * 3. Verify the agent behaves according to the expected states and responses
 * 4. Pay special attention to the bugReproductionCase, which should now work correctly
 *
 * Key validation points:
 * - Agent NEVER asks for parameters before explicit screen confirmation
 * - Agent correctly identifies both explicit and implicit rejections
 * - Agent doesn't repeat rejected screens
 * - Agent provides appropriate responses that help guide the user
 */
// Checklist for verifying the fix
const fixValidationChecklist = [
    "✅ Agent detects explicit 'no' responses as rejections",
    "✅ Agent detects implicit rejections like 'this is a screen with...'",
    "✅ Agent NEVER asks for parameters before screen confirmation",
    "✅ Agent tracks rejected screens to avoid suggesting them again",
    "✅ Agent provides helpful prompts when screens are rejected"
];
exports.fixValidationChecklist = fixValidationChecklist;
