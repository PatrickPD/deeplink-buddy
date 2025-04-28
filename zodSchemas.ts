import { z } from 'zod';

// Schema for individual message history
export const MessageSchema = z.object({
    role: z.enum(["user", "model", "tool"]),
    content: z.string(),
});

// Schema for the target screen details identified by screenResolverTool
export const TargetScreenSchema = z.object({
    path: z.string(),
    description: z.string(),
    screenshot: z.string().nullable(),
    requiredParams: z.array(z.string()).nullable(),
});

// Schema for the overall state of the deeplink helper flow
export const DeeplinkFlowStateSchema = z.object({
    history: z.array(MessageSchema).optional().describe("Conversation history"),
    userObjective: z.array(z.enum(["deeplink", "adjust_steps", "firebase_push", "qr_code"])).nullable().default(null).describe("Deliverables requested by the user"),
    targetScreen: TargetScreenSchema.nullable().default(null).describe("Details of the identified target screen"),
    parameters: z.record(z.string(), z.string()).default({}).describe("Parameters collected for the deeplink"),
    paramExtractionUrl: z.string().url().nullable().default(null).describe("URL provided by user for parameter extraction"),
    confirmationNeeded: z.enum(["screen", "parameters", "extracted_params"]).nullable().default(null).describe("Flag indicating what needs user confirmation"),
    pendingParamToExtract: z.string().nullable().default(null).describe("Name of the parameter awaiting extraction from a URL"),
});

// Define a type for the state based on the schema
export type DeeplinkFlowState = z.infer<typeof DeeplinkFlowStateSchema>; 