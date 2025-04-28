# Manual Test Script for Deeplink Agent

## Purpose

This document provides step-by-step instructions to manually verify that the deeplink agent correctly handles screen confirmation and rejection, especially focusing on ensuring it never asks for parameters before screen confirmation.

## Setup

1. Make sure you have implemented all the changes to `flows/deeplinkFlow.ts`
2. Start your development environment
3. Launch the agent for testing

## Test Cases

### Test Case 1: Explicit Rejection

This tests the agent's ability to handle a direct "no" response.

| Step | User Input                                                                   | Expected Agent Response                                                           | State Check                   |
| ---- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ----------------------------- |
| 1    | "I need a push notification that links to a product category page in my app" | Should display a product category screen and ask for confirmation                 | `screen_confirmation_pending` |
| 2    | "No, that's not right"                                                       | Should acknowledge rejection and ask for more details. Should NOT ask for any ID. | `objective_clarified`         |
| 3    | "I want the homepage"                                                        | Should show a different screen                                                    | `screen_confirmation_pending` |

**PASS if**: Agent never asks for parameters after rejection

### Test Case 2: Implicit Rejection (Bug Reproduction Case)

This tests the exact scenario you encountered where the agent misinterpreted "this is a screen with..." as a screen confirmation.

| Step | User Input                                                                   | Expected Agent Response                                                                         | State Check                   |
| ---- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- |
| 1    | "I need a push notification that links to a product category page in my app" | Should display a product category screen and ask for confirmation                               | `screen_confirmation_pending` |
| 2    | "this is a screen with the details about a specific product."                | Should recognize this as a rejection and ask for more details. Should NOT ask for a product ID. | `objective_clarified`         |
| 3    | "hm still not this one"                                                      | Should recognize this as another rejection and offer more help, not ask for parameters          | -                             |

**PASS if**: Agent never asks for product ID after step 2

### Test Case 3: Ambiguous Response

Tests how the agent handles unclear confirmations.

| Step | User Input                                                         | Expected Agent Response                                                                   | State Check                   |
| ---- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- | ----------------------------- |
| 1    | "I need a push notification that links to a product category page" | Should display a screen and ask for confirmation                                          | `screen_confirmation_pending` |
| 2    | "I think so but I'm not sure"                                      | Should ask for a clearer yes/no confirmation. Should NOT proceed to parameter extraction. | `screen_confirmation_pending` |

**PASS if**: Agent requests explicit confirmation and doesn't proceed to parameters

### Test Case 4: Happy Path - Full Confirmation

Tests the correct sequence of confirmation followed by parameter extraction.

| Step | User Input                                                        | Expected Agent Response                                          | State Check                    |
| ---- | ----------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------ |
| 1    | "I need a push notification that links to a product details page" | Should display a product details screen and ask for confirmation | `screen_confirmation_pending`  |
| 2    | "Yes, that's correct"                                             | Should acknowledge confirmation and then ask for the product ID  | `parameter_extraction_pending` |

**PASS if**: Agent only asks for product ID after explicit confirmation

### Test Case 5: Multiple Rejections

Tests that the agent can handle sequential rejections and doesn't show the same screens again.

| Step | User Input                   | Expected Agent Response                                          | State Check                   |
| ---- | ---------------------------- | ---------------------------------------------------------------- | ----------------------------- |
| 1    | "I need a push notification" | Should ask what screen to link to                                | `objective_clarified`         |
| 2    | "To a product page"          | Should display a product-related screen and ask for confirmation | `screen_confirmation_pending` |
| 3    | "No, that's wrong"           | Should acknowledge and ask for more details                      | `objective_clarified`         |
| 4    | "It's for discounts"         | Should show a different screen than before                       | `screen_confirmation_pending` |
| 5    | "No, still not right"        | Should acknowledge and ask for more details                      | `objective_clarified`         |

**PASS if**: Agent doesn't repeat the same screens, and never asks for parameters

## Critical Success Criteria

For all tests, the following should be true:

1. ✅ The agent NEVER asks for parameters (IDs, etc.) before receiving explicit screen confirmation
2. ✅ The agent correctly identifies both explicit rejections ("no") and implicit rejections ("this is...")
3. ✅ The agent provides helpful guidance when screens are rejected
4. ✅ The agent tracks rejected paths to avoid suggesting them again

## Test Results

Record your test results here:

| Test Case              | PASS/FAIL | Notes |
| ---------------------- | --------- | ----- |
| 1. Explicit Rejection  |           |       |
| 2. Implicit Rejection  |           |       |
| 3. Ambiguous Response  |           |       |
| 4. Happy Path          |           |       |
| 5. Multiple Rejections |           |       |
