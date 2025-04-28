"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeeplinkFlowStateSchema = exports.TargetScreenSchema = exports.MessageSchema = void 0;
const zod_1 = require("zod");
// Schema for individual message history
exports.MessageSchema = zod_1.z.object({
    role: zod_1.z.enum(["user", "model", "tool"]),
    content: zod_1.z.string(),
});
// Schema for the target screen details identified by screenResolverTool
exports.TargetScreenSchema = zod_1.z.object({
    path: zod_1.z.string(),
    description: zod_1.z.string(),
    screenshot: zod_1.z.string().nullable(),
    requiredParams: zod_1.z.array(zod_1.z.string()).nullable(),
});
// Schema for the overall state of the deeplink helper flow
exports.DeeplinkFlowStateSchema = zod_1.z.object({
    history: zod_1.z.array(exports.MessageSchema).optional().describe("Conversation history"),
    userObjective: zod_1.z.array(zod_1.z.enum(["deeplink", "adjust_steps", "firebase_push", "qr_code"])).nullable().default(null).describe("Deliverables requested by the user"),
    targetScreen: exports.TargetScreenSchema.nullable().default(null).describe("Details of the identified target screen"),
    parameters: zod_1.z.record(zod_1.z.string(), zod_1.z.string()).default({}).describe("Parameters collected for the deeplink"),
    paramExtractionUrl: zod_1.z.string().url().nullable().default(null).describe("URL provided by user for parameter extraction"),
    confirmationNeeded: zod_1.z.enum(["screen", "parameters", "extracted_params"]).nullable().default(null).describe("Flag indicating what needs user confirmation"),
    pendingParamToExtract: zod_1.z.string().nullable().default(null).describe("Name of the parameter awaiting extraction from a URL"),
});
