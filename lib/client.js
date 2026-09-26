window.__ModuleLoader__.load({id:"dsh-upload-plugin",factory:function(require){var module={exports:{}};
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.ts
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  name: () => name
});
module.exports = __toCommonJS(index_exports);

// src/client/uploader.ts
function getSessionShortTag(sessionId) {
  if (!sessionId) return "common";
  return sessionId.replace(/^session-/, "").slice(0, 8);
}
function cleanDisplayName(fileName) {
  return fileName.replace(/^session_[a-zA-Z0-9_-]+__/, "");
}
function buildSessionUploadFileName(sessionId, fileName) {
  const tag = getSessionShortTag(sessionId);
  return `session_${tag}__${fileName}`;
}
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function generateDraftPrompt(items) {
  if (items.length === 0) return "";
  const allPhotos = items.every((i) => i.isPhoto);
  if (allPhotos) {
    if (items.length === 1) {
      return `T\xF4i v\u1EEBa t\u1EA3i l\xEAn \u1EA3nh \`${items[0].relativePath}\`. B\u1EA1n h\xE3y g\u1ECDi tool \`read_image\` \u0111\u1EC3 xem v\xE0 ph\xE2n t\xEDch \u1EA3nh n\xE0y nh\xE9: `;
    }
    const list2 = items.map((i) => `- \`${i.relativePath}\``).join("\n");
    return `T\xF4i v\u1EEBa t\u1EA3i l\xEAn ${items.length} \u1EA3nh sau:
${list2}
B\u1EA1n h\xE3y g\u1ECDi tool \`read_image\` l\u1EA7n l\u01B0\u1EE3t \u0111\u1EC3 xem v\xE0 ph\xE2n t\xEDch c\xE1c \u1EA3nh n\xE0y nh\xE9: `;
  }
  const allFiles = items.every((i) => !i.isPhoto);
  if (allFiles) {
    if (items.length === 1) {
      return `T\xF4i v\u1EEBa t\u1EA3i l\xEAn file \`${items[0].relativePath}\`. B\u1EA1n h\xE3y \u0111\u1ECDc n\u1ED9i dung file n\xE0y (d\xF9ng tool \`read\` ho\u1EB7c tool \u0111\u1ECDc file ph\xF9 h\u1EE3p) v\xE0 h\u1ED7 tr\u1EE3 t\xF4i: `;
    }
    const list2 = items.map((i) => `- \`${i.relativePath}\``).join("\n");
    return `T\xF4i v\u1EEBa t\u1EA3i l\xEAn ${items.length} file sau:
${list2}
B\u1EA1n h\xE3y \u0111\u1ECDc n\u1ED9i dung c\xE1c file n\xE0y (d\xF9ng tool \`read\` ho\u1EB7c tool \u0111\u1ECDc file ph\xF9 h\u1EE3p) v\xE0 h\u1ED7 tr\u1EE3 t\xF4i: `;
  }
  const list = items.map((i) => `- \`${i.relativePath}\` (${i.isPhoto ? "\u1EA3nh" : "file"})`).join("\n");
  return `T\xF4i v\u1EEBa t\u1EA3i l\xEAn c\xE1c t\u1EC7p sau:
${list}
B\u1EA1n h\xE3y \u0111\u1ECDc/xem n\u1ED9i dung c\xE1c t\u1EC7p n\xE0y v\xE0 h\u1ED7 tr\u1EE3 t\xF4i: `;
}
async function checkModelVision(sessionId) {
  try {
    let provider = "";
    let model = "";
    try {
      const modelRes = await fetch("/api/session.models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "client-request",
          rpcId: `vision-check-${Date.now()}`,
          method: "session.models",
          payload: { sessionId }
        })
      });
      if (modelRes.ok) {
        const data = await modelRes.json();
        const current = data?.result?.value?.current;
        if (current?.provider && current?.model) {
          provider = current.provider;
          model = current.model;
        }
      }
    } catch {
    }
    const query = new URLSearchParams();
    query.set("sessionId", sessionId);
    if (provider) query.set("provider", provider);
    if (model) query.set("model", model);
    const res = await fetch(`/api/vision-plugin/check-vision?${query.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    return {
      hasVision: true
      // Optimistic fallback if network request fails
    };
  }
}
async function resolveWorkspaceDir(sessionId) {
  try {
    const res = await fetch("/api/workspace.list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "client-request",
        rpcId: `ws-resolve-${Date.now()}`,
        method: "workspace.list",
        payload: {}
      })
    });
    if (res.ok) {
      const data = await res.json();
      const items = data?.result?.value?.items;
      const match = items?.find((item) => item.sessionIds?.includes(sessionId));
      if (match?.path) return match.path;
      if (items?.[0]?.path) return items[0].path;
    }
  } catch {
  }
  return null;
}
function pickFilesFromBrowser(accept, multiple = true) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.display = "none";
    input.onchange = () => {
      const files = Array.from(input.files ?? []);
      document.body.removeChild(input);
      resolve(files);
    };
    input.oncancel = () => {
      document.body.removeChild(input);
      resolve([]);
    };
    document.body.appendChild(input);
    input.click();
  });
}
async function optimizeImageIfNeeded(file) {
  if (!file.type.startsWith("image/") || file.size <= 4.5 * 1024 * 1024) {
    return file;
  }
  try {
    const bitmap = await createImageBitmap(file);
    const maxDim = 2048;
    let width = bitmap.width;
    let height = bitmap.height;
    if (width > maxDim || height > maxDim) {
      if (width > height) {
        height = Math.round(height * maxDim / width);
        width = maxDim;
      } else {
        width = Math.round(width * maxDim / height);
        height = maxDim;
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise((res) => {
      canvas.toBlob(res, "image/jpeg", 0.88);
    });
    if (!blob) return file;
    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const commaIndex = result.indexOf(",");
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
async function uploadSingleFile(sessionId, workspaceDir, file, isPhoto) {
  const readyFile = isPhoto ? await optimizeImageIfNeeded(file) : file;
  const fileBase64 = await fileToBase64(readyFile);
  const targetUploadName = buildSessionUploadFileName(sessionId, readyFile.name);
  const res = await fetch("/api/vision-plugin/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      workspaceDir: workspaceDir ?? void 0,
      fileName: targetUploadName,
      fileBase64,
      isPhoto
    })
  });
  if (!res.ok) {
    throw new Error(`Upload failed with status ${res.status}`);
  }
  return await res.json();
}
async function uploadMultipleFiles(sessionId, files, isPhoto) {
  const workspaceDir = await resolveWorkspaceDir(sessionId);
  return await Promise.all(
    files.map((file) => uploadSingleFile(sessionId, workspaceDir, file, isPhoto))
  );
}
async function fetchUploadedFiles(sessionId) {
  try {
    const workspaceDir = await resolveWorkspaceDir(sessionId);
    const query = new URLSearchParams();
    query.set("sessionId", sessionId);
    if (workspaceDir) query.set("workspaceDir", workspaceDir);
    const res = await fetch(`/api/vision-plugin/list?${query.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.files)) return data;
    const tag = getSessionShortTag(sessionId);
    const sessionPrefix = `session_${tag}__`;
    const subfolderPrefix = `uploads/${sessionId}/`;
    const sessionFiles = data.files.filter((f) => {
      const base = f.name;
      return base.startsWith(sessionPrefix) || f.relativePath.startsWith(subfolderPrefix);
    });
    return {
      ok: true,
      files: sessionFiles
    };
  } catch (err) {
    return { ok: false, files: [], error: err?.message ?? "Failed to list uploads" };
  }
}
function insertPromptIntoComposer(prompt) {
  const textarea = document.querySelector("textarea[data-input-target], textarea");
  if (textarea) {
    const current = textarea.value;
    const newText = current ? `${current}
${prompt}` : prompt;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
    if (nativeSetter) {
      nativeSetter.call(textarea, newText);
    } else {
      textarea.value = newText;
    }
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus();
  }
}

// src/client/attachment-bar.ts
var STORAGE_PREFIX = "dsh_vision_uploads_";
function getSessionUploads(sessionId) {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
function saveSessionUpload(sessionId, item) {
  try {
    const existing = getSessionUploads(sessionId);
    const updated = [item, ...existing.filter((x) => x.relativePath !== item.relativePath)];
    localStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, JSON.stringify(updated.slice(0, 50)));
  } catch {
  }
}
function saveMultipleSessionUploads(sessionId, items) {
  for (const item of items) {
    saveSessionUpload(sessionId, item);
  }
}
var sessionDraftMap = /* @__PURE__ */ new Map();
var lastActiveSessionId = null;
function detectActiveSessionId() {
  const card = document.querySelector('[data-composer-card="true"]');
  if (!card) return lastActiveSessionId;
  const key = Object.keys(card).find((k) => k.startsWith("__reactFiber") || k.startsWith("__reactInternalInstance"));
  if (key) {
    let curr = card[key];
    while (curr) {
      if (curr.memoizedProps?.sessionId) return curr.memoizedProps.sessionId;
      if (typeof curr.key === "string" && curr.key.startsWith("session-")) return curr.key;
      curr = curr.return;
    }
  }
  return lastActiveSessionId;
}
function addDraftAttachments(sessionId, newItems) {
  lastActiveSessionId = sessionId;
  const current = sessionDraftMap.get(sessionId) ?? [];
  sessionDraftMap.set(sessionId, [...current, ...newItems]);
  saveMultipleSessionUploads(sessionId, newItems);
  renderAttachmentBar(sessionId);
}
function removeDraftAttachment(id) {
  const sid = detectActiveSessionId();
  if (!sid) return;
  const current = sessionDraftMap.get(sid) ?? [];
  const updated = current.filter((item) => item.id !== id);
  sessionDraftMap.set(sid, updated);
  renderAttachmentBar(sid);
  const textarea = document.querySelector("textarea[data-input-target], textarea");
  if (textarea) {
    if (updated.length === 0) {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(textarea, "");
      } else {
        textarea.value = "";
      }
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      const newPrompt = generateDraftPrompt(
        updated.map((a) => ({ relativePath: a.relativePath, isPhoto: a.isPhoto }))
      );
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      if (nativeSetter) {
        nativeSetter.call(textarea, newPrompt);
      } else {
        textarea.value = newPrompt;
      }
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
}
function clearDraftAttachments(sessionId) {
  const sid = sessionId ?? detectActiveSessionId();
  if (sid) {
    sessionDraftMap.set(sid, []);
  }
  renderAttachmentBar(sid ?? void 0);
}
function ensureStylesInjected() {
  const styleId = "dsh-upload-plugin-styles";
  if (document.getElementById(styleId)) return;
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `
    #dsh-vision-attachments-rail {
      min-width: 0;
      padding: 6px 12px 0;
      box-sizing: border-box;
      width: 100%;
    }

    .dsh-vision-rail {
      display: flex;
      gap: 10px;
      overflow-x: auto;
      overflow-y: hidden;
      scrollbar-width: none;
      align-items: center;
      padding-bottom: 2px;
    }

    .dsh-vision-rail::-webkit-scrollbar {
      display: none;
    }

    .dsh-vision-item {
      position: relative;
      flex: 0 0 auto;
      height: 64px;
    }

    .dsh-vision-item-photo {
      flex: 0 0 64px;
      width: 64px;
    }

    .dsh-vision-thumb {
      width: 64px;
      height: 64px;
      overflow: hidden;
      border: 1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(128, 128, 128, 0.2));
      border-radius: 16px;
      background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.08));
      cursor: zoom-in;
      box-sizing: border-box;
      transition: border-color 0.15s ease, transform 0.15s ease;
    }

    .dsh-vision-thumb:hover {
      border-color: var(--dsw-alias-state-business-primary, #4176e6);
    }

    .dsh-vision-thumb img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 15px;
    }

    .dsh-vision-file-card {
      height: 64px;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 12px;
      box-sizing: border-box;
      border: 1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(128, 128, 128, 0.2));
      border-radius: 16px;
      background: var(--dsw-alias-interactive-bg-hover, rgba(128, 128, 128, 0.08));
      min-width: 140px;
      max-width: 240px;
      cursor: default;
      user-select: none;
      transition: border-color 0.15s ease;
    }

    .dsh-vision-file-card:hover {
      border-color: var(--dsw-alias-state-business-primary, #4176e6);
    }

    .dsh-vision-file-badge {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: rgba(65, 118, 230, 0.12);
      color: var(--dsw-alias-state-business-primary, #4176e6);
      display: grid;
      place-items: center;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      flex-shrink: 0;
    }

    .dsh-vision-file-meta {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      line-height: 1.3;
    }

    .dsh-vision-file-name {
      font-size: 13px;
      font-weight: 500;
      color: var(--dsw-alias-label-primary, currentColor);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 140px;
    }

    .dsh-vision-file-size {
      font-size: 11px;
      color: var(--dsw-alias-label-secondary, #888);
    }

    .dsh-vision-remove {
      position: absolute;
      top: 4px;
      right: 4px;
      z-index: 2;
      display: grid;
      place-items: center;
      width: 18px;
      height: 18px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: var(--dsw-alias-button-contrast-fill, #61666b);
      color: var(--dsw-alias-label-primary-inverted, #ffffff);
      cursor: pointer;
      opacity: 0;
      transition: opacity 0.2s ease, transform 0.15s ease;
    }

    .dsh-vision-item:hover .dsh-vision-remove,
    .dsh-vision-remove:focus-visible {
      opacity: 1;
    }

    .dsh-vision-remove:hover {
      transform: scale(1.1);
    }

    @media (pointer: coarse) {
      .dsh-vision-remove {
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
}
var CLOSE_ICON_SVG = `
  <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor">
    <path d="M7 5.586L11.95 0.636a1 1 0 1 1 1.414 1.414L8.414 7l4.95 4.95a1 1 0 0 1-1.414 1.414L7 8.414l-4.95 4.95a1 1 0 0 1-1.414-1.414L5.586 7 0.636 2.05A1 1 0 0 1 2.05 0.636L7 5.586z"/>
  </svg>
`;
function openImageLightbox(imageUrl, title) {
  const existing = document.getElementById("dsh-vision-lightbox");
  if (existing) existing.remove();
  const backdrop = document.createElement("div");
  backdrop.id = "dsh-vision-lightbox";
  backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: grid;
    place-items: center;
    padding: 40px;
    box-sizing: border-box;
  `;
  const mask = document.createElement("div");
  mask.style.cssText = `
    position: absolute;
    inset: 0;
    background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.75));
    backdrop-filter: var(--dsw-mask-blur, blur(12px));
    -webkit-backdrop-filter: var(--dsw-mask-blur, blur(12px));
    cursor: zoom-out;
  `;
  backdrop.appendChild(mask);
  const img = document.createElement("img");
  img.src = imageUrl;
  img.alt = title;
  img.style.cssText = `
    position: relative;
    max-width: min(100%, 1600px);
    max-height: calc(100vh - 80px);
    object-fit: contain;
    border-radius: 12px;
    background: var(--dsw-specific-input-major, #1e1e1e);
    box-shadow: var(--dsw-shadow-lv3, 0 16px 48px rgba(0,0,0,0.5));
    cursor: default;
  `;
  backdrop.appendChild(img);
  const closeBtn = document.createElement("button");
  closeBtn.title = "\u0110\xF3ng (Esc)";
  closeBtn.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10;
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: 1px solid var(--dsw-alias-border-l2-darkmode-thin, rgba(255, 255, 255, 0.15));
    border-radius: 999px;
    background: var(--dsw-specific-input-major, #1f232b);
    color: var(--dsw-alias-label-primary, #fff);
    cursor: pointer;
    font-size: 14px;
    transition: transform 0.15s ease, background 0.15s ease;
  `;
  closeBtn.innerHTML = CLOSE_ICON_SVG;
  backdrop.appendChild(closeBtn);
  const close = () => backdrop.remove();
  mask.onclick = close;
  closeBtn.onclick = close;
  const onKeyDown = (e) => {
    if (e.key === "Escape") {
      close();
      document.removeEventListener("keydown", onKeyDown);
    }
  };
  document.addEventListener("keydown", onKeyDown);
  document.body.appendChild(backdrop);
}
function renderAttachmentBar(targetSessionId) {
  ensureStylesInjected();
  const sid = targetSessionId ?? detectActiveSessionId();
  const attachments = sid ? sessionDraftMap.get(sid) ?? [] : [];
  const containerId = "dsh-vision-attachments-rail";
  let container = document.getElementById(containerId);
  if (attachments.length === 0) {
    if (container) container.remove();
    return;
  }
  const composerCard = document.querySelector('[data-composer-card="true"]');
  if (!composerCard) {
    return;
  }
  const scrollDiv = composerCard.querySelector("[data-input-scroll]");
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    if (scrollDiv) {
      composerCard.insertBefore(container, scrollDiv);
    } else {
      composerCard.prepend(container);
    }
  }
  container.innerHTML = "";
  const rail = document.createElement("div");
  rail.className = "dsh-vision-rail";
  for (const item of attachments) {
    if (item.isPhoto && item.previewUrl) {
      const photoCard = document.createElement("div");
      photoCard.className = "dsh-vision-item dsh-vision-item-photo";
      const thumb = document.createElement("div");
      thumb.className = "dsh-vision-thumb";
      thumb.title = `Xem \u1EA3nh ${item.name}`;
      thumb.onclick = () => openImageLightbox(item.previewUrl, item.name);
      const img = document.createElement("img");
      img.src = item.previewUrl;
      img.alt = item.name;
      thumb.appendChild(img);
      photoCard.appendChild(thumb);
      const removeBtn = document.createElement("button");
      removeBtn.className = "dsh-vision-remove";
      removeBtn.title = `B\u1ECF \u1EA3nh ${item.name}`;
      removeBtn.innerHTML = CLOSE_ICON_SVG;
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeDraftAttachment(item.id);
      };
      photoCard.appendChild(removeBtn);
      rail.appendChild(photoCard);
    } else {
      const ext = item.name.includes(".") ? item.name.split(".").pop().toUpperCase() : "FILE";
      const fileCard = document.createElement("div");
      fileCard.className = "dsh-vision-item";
      const cardInner = document.createElement("div");
      cardInner.className = "dsh-vision-file-card";
      cardInner.title = `${item.name} (${formatFileSize(item.size)})`;
      const badge = document.createElement("div");
      badge.className = "dsh-vision-file-badge";
      badge.innerText = ext.slice(0, 4);
      cardInner.appendChild(badge);
      const meta = document.createElement("div");
      meta.className = "dsh-vision-file-meta";
      meta.innerHTML = `
        <span class="dsh-vision-file-name" title="${item.name}">${item.name}</span>
        <span class="dsh-vision-file-size">${formatFileSize(item.size)}</span>
      `;
      cardInner.appendChild(meta);
      fileCard.appendChild(cardInner);
      const removeBtn = document.createElement("button");
      removeBtn.className = "dsh-vision-remove";
      removeBtn.title = `B\u1ECF t\u1EC7p ${item.name}`;
      removeBtn.innerHTML = CLOSE_ICON_SVG;
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeDraftAttachment(item.id);
      };
      fileCard.appendChild(removeBtn);
      rail.appendChild(fileCard);
    }
  }
  container.appendChild(rail);
}
if (typeof window !== "undefined") {
  let prevSessionId = null;
  setInterval(() => {
    const currentSid = detectActiveSessionId();
    if (currentSid !== prevSessionId) {
      prevSessionId = currentSid;
      renderAttachmentBar(currentSid ?? void 0);
    }
  }, 250);
}

// src/client/commands.ts
function bindComposerAutoClear() {
  const textarea = document.querySelector("textarea[data-input-target], textarea");
  if (textarea && !textarea.__dsh_vision_bound) {
    textarea.__dsh_vision_bound = true;
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        setTimeout(() => clearDraftAttachments(), 300);
      }
    });
    const sendBtn = document.querySelector('button[aria-label*="Send message"], button[aria-label*="Send"]');
    sendBtn?.addEventListener("click", () => {
      setTimeout(() => clearDraftAttachments(), 300);
    });
  }
}
function registerVisionCommands(ctx) {
  const commandUi = ctx.get("commandUi");
  if (!commandUi || typeof commandUi.register !== "function") {
    return;
  }
  commandUi.register({
    name: "photos",
    description: "Add photos (Upload m\u1ED9t ho\u1EB7c nhi\u1EC1u \u1EA3nh v\xE0o workspace v\xE0 g\u1ECDi tool read_image)",
    available: () => true,
    ui: {
      kind: "popupSelect",
      options: async (session) => {
        const vision = await checkModelVision(session.sessionId);
        if (!vision.hasVision) {
          return [
            {
              id: "unsupported",
              label: `\u274C Model ${vision.model ?? ""} ch\u01B0a b\u1EADt t\xEDnh n\u0103ng xem \u1EA3nh`,
              detail: vision.reason ?? "C\u1EA7n th\xEAm input: [text, image] trong c\u1EA5u h\xECnh model"
            }
          ];
        }
        return [
          {
            id: "pick-photo",
            label: `\u{1F4F7} Ch\u1ECDn m\u1ED9t ho\u1EB7c nhi\u1EC1u \u1EA3nh (${vision.model ?? "Vision"})`,
            detail: "H\u1ED7 tr\u1EE3 ch\u1ECDn nhi\u1EC1u \u1EA3nh c\xF9ng l\xFAc (.png, .jpg, .webp, .gif) -> uploads/"
          }
        ];
      },
      onSelect: async (option, session) => {
        if (option.id === "unsupported") {
          return;
        }
        const files = await pickFilesFromBrowser("image/png,image/jpeg,image/webp,image/gif", true);
        if (files.length === 0) return;
        try {
          const uploadResponses = await uploadMultipleFiles(session.sessionId, files, true);
          const successful = uploadResponses.filter((r) => r.ok && r.relativePath);
          if (successful.length > 0) {
            const records = [];
            for (let i = 0; i < successful.length; i++) {
              const res = successful[i];
              const file = files[i];
              let previewUrl = "";
              try {
                const b64 = await fileToBase64(file);
                previewUrl = `data:${file.type || "image/png"};base64,${b64}`;
              } catch {
                previewUrl = URL.createObjectURL(file);
              }
              const displayName = cleanDisplayName(res.filename ?? file.name);
              records.push({
                id: `${Date.now()}-${i}-${res.filename}`,
                name: displayName,
                relativePath: res.relativePath ?? `uploads/${res.filename ?? file.name}`,
                size: file.size,
                isPhoto: true,
                previewUrl,
                uploadedAt: Date.now()
              });
            }
            addDraftAttachments(session.sessionId, records);
            bindComposerAutoClear();
            const prompt = generateDraftPrompt(
              successful.map((r) => ({ relativePath: r.relativePath, isPhoto: true }))
            );
            insertPromptIntoComposer(prompt);
          } else {
            alert("Upload \u1EA3nh th\u1EA5t b\u1EA1i");
          }
        } catch (err) {
          alert(`L\u1ED7i upload \u1EA3nh: ${err?.message ?? err}`);
        }
      }
    }
  });
  commandUi.register({
    name: "files",
    description: "Add files (T\u1EA3i m\u1ED9t ho\u1EB7c nhi\u1EC1u file/t\xE0i li\u1EC7u v\xE0o workspace \u0111\u1EC3 model \u0111\u1ECDc)",
    available: () => true,
    ui: {
      kind: "popupSelect",
      options: async () => [
        {
          id: "pick-file",
          label: "\u{1F4C4} Ch\u1ECDn m\u1ED9t ho\u1EB7c nhi\u1EC1u file t\u1EEB m\xE1y t\xEDnh",
          detail: "H\u1ED7 tr\u1EE3 ch\u1ECDn nhi\u1EC1u t\u1EC7p (.txt, .pdf, .json, .csv, code, zip...) -> uploads/"
        }
      ],
      onSelect: async (_option, session) => {
        const files = await pickFilesFromBrowser("*/*", true);
        if (files.length === 0) return;
        try {
          const uploadResponses = await uploadMultipleFiles(session.sessionId, files, false);
          const successful = uploadResponses.filter((r) => r.ok && r.relativePath);
          if (successful.length > 0) {
            const records = successful.map((res, i) => {
              const file = files[i];
              const displayName = cleanDisplayName(res.filename ?? file.name);
              return {
                id: `${Date.now()}-${i}-${res.filename}`,
                name: displayName,
                relativePath: res.relativePath ?? `uploads/${res.filename ?? file.name}`,
                size: file.size,
                isPhoto: false,
                uploadedAt: Date.now()
              };
            });
            addDraftAttachments(session.sessionId, records);
            bindComposerAutoClear();
            const prompt = generateDraftPrompt(
              successful.map((r) => ({ relativePath: r.relativePath, isPhoto: false }))
            );
            insertPromptIntoComposer(prompt);
          } else {
            alert("Upload file th\u1EA5t b\u1EA1i");
          }
        } catch (err) {
          alert(`L\u1ED7i upload file: ${err?.message ?? err}`);
        }
      }
    }
  });
  commandUi.register({
    name: "uploads",
    description: "Uploaded files (Xem danh s\xE1ch c\xE1c file/\u1EA3nh \u0111\xE3 t\u1EA3i l\xEAn trong session n\xE0y)",
    available: () => true,
    ui: {
      kind: "popupSelect",
      options: async (session) => {
        const localList = getSessionUploads(session.sessionId);
        const apiRes = await fetchUploadedFiles(session.sessionId);
        const apiFiles = apiRes.ok ? apiRes.files : [];
        const map = /* @__PURE__ */ new Map();
        for (const f of apiFiles) {
          map.set(f.relativePath, {
            id: f.relativePath,
            name: cleanDisplayName(f.name),
            relativePath: f.relativePath,
            size: f.size,
            isPhoto: f.isPhoto,
            previewUrl: f.viewUrl,
            uploadedAt: f.mtime
          });
        }
        for (const l of localList) {
          map.set(l.relativePath, l);
        }
        const combined = Array.from(map.values()).sort((a, b) => b.uploadedAt - a.uploadedAt);
        if (combined.length === 0) {
          return [
            {
              id: "empty",
              label: "\u{1F4C2} Ch\u01B0a c\xF3 file ho\u1EB7c \u1EA3nh n\xE0o \u0111\u01B0\u1EE3c t\u1EA3i l\xEAn trong session n\xE0y",
              detail: "D\xF9ng /photos ho\u1EB7c /files \u0111\u1EC3 t\u1EA3i t\u1EC7p v\xE0o session n\xE0y"
            }
          ];
        }
        return combined.map((item) => ({
          id: item.relativePath,
          label: `${item.isPhoto ? "\u{1F5BC}\uFE0F" : "\u{1F4C4}"} ${cleanDisplayName(item.name)}`,
          detail: `${formatFileSize(item.size)} \xB7 ${item.relativePath}`,
          raw: item
        }));
      },
      onSelect: async (option, _session) => {
        if (option.id === "empty") return;
        const item = option.raw;
        const displayName = cleanDisplayName(item.name);
        if (item?.isPhoto && item?.previewUrl) {
          openImageLightbox(item.previewUrl, displayName);
        }
        const prompt = item?.isPhoto ? `B\u1EA1n h\xE3y g\u1ECDi tool \`read_image\` \u0111\u1EC3 xem v\xE0 ph\xE2n t\xEDch l\u1EA1i \u1EA3nh \`${item.relativePath}\`: ` : `B\u1EA1n h\xE3y \u0111\u1ECDc n\u1ED9i dung file \`${item.relativePath}\` (d\xF9ng tool \`read\`) v\xE0 h\u1ED7 tr\u1EE3 t\xF4i: `;
        insertPromptIntoComposer(prompt);
      }
    }
  });
}

// src/client/index.ts
var name = "dsh-upload-plugin-client";
function apply(ctx) {
  registerVisionCommands(ctx);
}
return module.exports;}});
