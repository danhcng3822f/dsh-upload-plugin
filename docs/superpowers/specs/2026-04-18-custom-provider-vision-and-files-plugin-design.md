# Design Spec: Custom Provider Vision & Files Plugin for DeepSeek Harness

**Date:** 2026-04-18  
**Status:** Approved by User  
**Target Repository:** `D:\dsh-vision-plugim`

---

## 1. Overview

This plugin extends DeepSeek Harness (DSH) to enable AI models (specifically custom provider models with vision capability) to inspect photos and read uploaded files through the chat interface.

### Key Goals:
1. Add **"Add photos"** and **"Add files"** actions inside the plus (`+`) menu of the DeepSeek Harness chat composer.
2. Ensure **"Add photos"** strictly checks and only allows models that declare vision capability (`input: [text, image]` or `inputModalities: ['text', 'image']`). If the current model does not support vision, display a clear warning.
3. Automatically store uploaded files and photos into an `uploads/` folder within the current session's workspace.
4. Prompt the model with the exact workspace relative path so that:
   - For photos: The model triggers its vision tool (`read_image`).
   - For files: The model reads the file contents using its filesystem reading tool (`read` or suitable document reader).

---

## 2. Architecture & File Structure

The plugin is structured as a standard Cordis dual-face plugin (Host + Client) compatible with DeepSeek Harness plugin conventions.

```text
D:\dsh-vision-plugim/
├── package.json
├── cordis.patch.yml
├── tsconfig.json
├── tsdown.config.ts
├── src/
│   ├── index.ts                      # Host plugin entry point
│   ├── types.ts                      # Shared types between host & client
│   ├── host/
│   │   ├── upload-service.ts         # Handles file uploads to <workspace>/uploads/
│   │   └── vision-service.ts         # Checks model vision capability via ctx.llm
│   └── client/
│       ├── index.ts                  # Client plugin entry point (dsh.client)
│       ├── commands.ts               # Registers "photos" & "files" into plus (+) command menu
│       ├── uploader.ts               # Triggers browser file dialog and calls upload API
│       └── locales.ts                # Vietnamese & English strings
└── docs/
    └── superpowers/specs/
        └── 2026-04-18-custom-provider-vision-and-files-plugin-design.md
```

---

## 3. Host-Side Design

The host plugin integrates with Cordis lifecycle and requires services: `['webServer', 'workspaceRegistry', 'llm']`.

### 3.1 HTTP Endpoints

1. **`GET /api/vision-plugin/check-vision?sessionId=<sessionId>`**
   - Resolves the current session's active model from the session header / agent options.
   - Queries `ctx.llm.resolveModelInfo(provider, model)`.
   - Returns JSON:
     ```json
     {
       "hasVision": true,
       "provider": "my-gateway",
       "model": "vision-model",
       "modalities": ["text", "image"]
     }
     ```
     Or if false:
     ```json
     {
       "hasVision": false,
       "provider": "my-gateway",
       "model": "text-model",
       "reason": "Model does not declare 'image' input modality"
     }
     ```

2. **`POST /api/vision-plugin/upload`**
   - Accepts payload: `sessionId`, `fileName`, `fileData` (base64 or binary data), `isPhoto`.
   - Resolves the workspace directory corresponding to `sessionId`.
   - Ensures directory `<workspace>/uploads/` exists.
   - Generates safe filename (deduplicating if filename already exists).
   - Writes file to disk at `<workspace>/uploads/<filename>`.
   - Returns JSON:
     ```json
     {
       "ok": true,
       "filename": "photo.png",
       "relativePath": "uploads/photo.png",
       "fullPath": "/path/to/workspace/uploads/photo.png",
       "isPhoto": true
     }
     ```

---

## 4. Client-Side Design

The client plugin declares `dsh.client` in `package.json` with dependencies `['commandUi', 'sessions']`.

### 4.1 Plus (`+`) Menu Integration
- DeepSeek Harness chat composer triggers the `commandUi` menu when the plus button (`+`) is clicked.
- The client plugin calls `ctx.commandUi.register` for:
  - **`photos` ("Add photos")**:
    - Description: *"Tải ảnh lên workspace và yêu cầu model xem ảnh qua tool read_image"*
    - Handler:
      1. Calls `GET /api/vision-plugin/check-vision?sessionId=...`.
      2. If `hasVision === false`: Shows warning toast notifying user that the current model cannot process images, aborts.
      3. If `hasVision === true`: Opens file picker accepting `.png, .jpg, .jpeg, .webp, .gif`.
      4. On file selection: Uploads to `/api/vision-plugin/upload`.
      5. Inserts draft prompt into chat input:
         ```markdown
         Tôi vừa tải lên ảnh `uploads/photo.png`. Bạn hãy gọi tool `read_image` để xem và phân tích ảnh này nhé: 
         ```
  - **`files` ("Add files")**:
    - Description: *"Tải tài liệu/file lên workspace để model đọc qua tool read"*
    - Handler:
      1. Opens file picker accepting all file types.
      2. On file selection: Uploads to `/api/vision-plugin/upload`.
      3. Inserts draft prompt into chat input:
         ```markdown
         Tôi vừa tải lên file `uploads/document.pdf`. Bạn hãy đọc nội dung file này (dùng tool `read` hoặc tool đọc file phù hợp) và hỗ trợ tôi: 
         ```

---

## 5. Verification & Acceptance Criteria
1. Plugin builds cleanly with `tsdown` and passes TypeScript compilation.
2. Plus (`+`) menu in DSH chat UI displays both "Add photos" and "Add files".
3. Selecting "Add photos" with a non-vision model displays a refusal/warning.
4. Selecting "Add photos" with a vision-capable model allows selecting an image, uploads it to `uploads/`, and pastes the prompt referencing `read_image`.
5. Selecting "Add files" allows selecting any file, uploads it to `uploads/`, and pastes the prompt referencing `read`.
