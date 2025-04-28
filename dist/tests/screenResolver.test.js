"use strict";
// import { gemini25ProPreview0325 } from '@genkit-ai/vertexai';
// import * as fs from 'fs';
// import { Genkit, MessageData, ToolAction } from 'genkit'; // Import ToolAction type
// import * as path from 'path';
// import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// import { z } from 'zod';
// import { createScreenResolverTool } from '../tools/screenResolver';
// // Mock the generate method we expect aiInstance to have
// const mockGenerate = vi.fn();
// // Create a minimal mock aiInstance
// const mockAiInstance = {
//     generate: mockGenerate,
//     defineTool: <I extends z.ZodTypeAny, O extends z.ZodTypeAny>(
//         _def: any,
//         action: (input: z.infer<I>) => Promise<z.infer<O>>
//     ): ToolAction<I, O> => {
//         // Return an object that conforms minimally to ToolAction, exposing the action
//         return {
//             __action: action, // Store the action function
//             // Add other necessary properties if ToolAction requires them, possibly mocked
//             name: _def.name || 'mockTool',
//             description: _def.description || '',
//             inputSchema: _def.inputSchema,
//             outputSchema: _def.outputSchema,
//         } as ToolAction<I, O>;
//     },
//     // Add other methods if createScreenResolverTool calls them
// } as unknown as Genkit; // Cast to Genkit, accepting potential inaccuracies for test setup
// // Mock filesystem operations
// vi.mock('fs');
// vi.mock('path', async (importOriginal) => {
//     const originalPath = await importOriginal<typeof path>();
//     return {
//         ...originalPath,
//         resolve: (...paths: string[]) => originalPath.join(...['/', ...paths]), // Simulate root
//     };
// });
// describe('screenResolverTool', () => {
//     let screenResolverToolAction: (input: any) => Promise<any>;
//     beforeEach(() => {
//         // Create a fresh tool instance for each test
//         const tool = createScreenResolverTool(mockAiInstance);
//         // Access the action function from the mocked structure
//         screenResolverToolAction = tool.__action;
//         vi.clearAllMocks(); // Reset mocks before each test
//     });
//     afterEach(() => {
//         vi.restoreAllMocks();
//     });
//     const MOCK_SCREENSHOT_DIR = './screenshots';
//     const FAKE_B64_USER = 'data:image/png;base64,userImageData';
//     const FAKE_B64_REF1 = 'data:image/png;base64,ref1Data';
//     const FAKE_B64_REF2 = 'data:image/png;base64,ref2Data';
//     it('should pass user-uploaded screenshot to LLM', async () => {
//         // Arrange
//         vi.spyOn(fs, 'existsSync').mockReturnValue(true);
//         vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
//         mockGenerate.mockResolvedValue({ text: 'BEST_MATCH: user_upload.png\nPATH: user/upload\nPARAMS: []' });
//         const input = {
//             description: 'Screen from user upload',
//             uploadedScreenshot: FAKE_B64_USER
//         };
//         // Act: Call the extracted action function
//         await screenResolverToolAction(input);
//         // Assert
//         expect(mockGenerate).toHaveBeenCalledOnce();
//         const generateArgs = mockGenerate.mock.calls[0][0];
//         expect(generateArgs.model).toBe(gemini25ProPreview0325); // Verify correct model
//         const userMessageContent = generateArgs.messages.find((m: MessageData) => m.role === 'user')?.content;
//         expect(userMessageContent).toBeDefined();
//         expect(userMessageContent).toContainEqual({ image_url: { url: FAKE_B64_USER } });
//         expect(userMessageContent).not.toContainEqual({ image_url: { url: FAKE_B64_REF1 } });
//         expect(userMessageContent).not.toContainEqual({ image_url: { url: FAKE_B64_REF2 } });
//     });
//     it('should pass reference screenshots to LLM when no user upload', async () => {
//         // Arrange
//         vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === path.resolve(MOCK_SCREENSHOT_DIR) || p.toString().endsWith('.png'));
//         vi.spyOn(fs, 'readdirSync').mockReturnValue(['ref1.png', 'ref2.png'] as any);
//         vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
//             if (p === path.resolve(MOCK_SCREENSHOT_DIR, 'ref1.png')) return Buffer.from('ref1Data');
//             if (p === path.resolve(MOCK_SCREENSHOT_DIR, 'ref2.png')) return Buffer.from('ref2Data');
//             return Buffer.from('');
//         });
//         mockGenerate.mockResolvedValue({ text: 'BEST_MATCH: ref1.png\nPATH: reference/one\nPARAMS: []' });
//         const input = { description: 'Screen from reference' };
//         // Act
//         await screenResolverToolAction(input);
//         // Assert
//         expect(mockGenerate).toHaveBeenCalledOnce();
//         const generateArgs = mockGenerate.mock.calls[0][0];
//         expect(generateArgs.model).toBe(gemini25ProPreview0325);
//         const userMessageContent = generateArgs.messages.find((m: MessageData) => m.role === 'user')?.content;
//         expect(userMessageContent).toBeDefined();
//         expect(userMessageContent).not.toContainEqual({ image_url: { url: FAKE_B64_USER } });
//         expect(userMessageContent).toContainEqual({ image_url: { url: FAKE_B64_REF1 } });
//         expect(userMessageContent).toContainEqual({ image_url: { url: FAKE_B64_REF2 } });
//     });
//     it('should pass both user and reference screenshots to LLM', async () => {
//         // Arrange
//         vi.spyOn(fs, 'existsSync').mockImplementation((p) => p === path.resolve(MOCK_SCREENSHOT_DIR) || p.toString().endsWith('.png'));
//         vi.spyOn(fs, 'readdirSync').mockReturnValue(['ref1.png', 'ref2.png'] as any);
//         vi.spyOn(fs, 'readFileSync').mockImplementation((p) => {
//             if (p === path.resolve(MOCK_SCREENSHOT_DIR, 'ref1.png')) return Buffer.from('ref1Data');
//             if (p === path.resolve(MOCK_SCREENSHOT_DIR, 'ref2.png')) return Buffer.from('ref2Data');
//             return Buffer.from('');
//         });
//         mockGenerate.mockResolvedValue({ text: 'BEST_MATCH: user_upload.png\nPATH: user/upload\nPARAMS: []' });
//         const input = {
//             description: 'Screen from user upload, check references too',
//             uploadedScreenshot: FAKE_B64_USER
//         };
//         // Act
//         await screenResolverToolAction(input);
//         // Assert
//         expect(mockGenerate).toHaveBeenCalledOnce();
//         const generateArgs = mockGenerate.mock.calls[0][0];
//         expect(generateArgs.model).toBe(gemini25ProPreview0325);
//         const userMessageContent = generateArgs.messages.find((m: MessageData) => m.role === 'user')?.content;
//         expect(userMessageContent).toBeDefined();
//         expect(userMessageContent).toContainEqual({ image_url: { url: FAKE_B64_USER } });
//         expect(userMessageContent).toContainEqual({ image_url: { url: FAKE_B64_REF1 } });
//         expect(userMessageContent).toContainEqual({ image_url: { url: FAKE_B64_REF2 } });
//     });
// }); 
