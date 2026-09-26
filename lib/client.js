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
var import_react3 = require("react");

// src/client/attachments.ts
var VISION_SOURCE = "vision";
function makeToken(fileName, taken) {
  const base = fileName.replace(/^session_[a-zA-Z0-9_-]+__/, "");
  if (!taken.includes(base)) return base;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem}_${n}${ext}`;
    if (!taken.includes(candidate)) return candidate;
  }
}
function makeRef(sessionTag2, token) {
  return `${sessionTag2}-${token}`;
}
function addRecord(records, record) {
  return [...records.filter((r) => r.token !== record.token), record];
}
function removeRecord(records, token) {
  return records.filter((r) => r.token !== token);
}
function findRecord(records, token) {
  return records.find((r) => r.token === token);
}
function activeTokens(occurrences, records) {
  const known = new Set(records.map((r) => r.ref));
  const out = [];
  for (const o of occurrences) {
    if (o.source !== VISION_SOURCE || o.invalid === true) continue;
    if (!known.has(o.ref) || out.includes(o.ref)) continue;
    out.push(o.ref);
  }
  return out;
}

// src/client/attachment-store.ts
var PREFIX = "dsh_vision_attachments_";
function sessionTag(sessionId) {
  return sessionId.replace(/^session-/, "").slice(0, 8) || "common";
}
var AttachmentStore = class {
  constructor(storage) {
    this.storage = storage;
  }
  cache = /* @__PURE__ */ new Map();
  /** Records for one session, newest last. */
  list(sessionId) {
    const cached = this.cache.get(sessionId);
    if (cached !== void 0) return cached;
    const loaded = this.load(sessionId);
    this.cache.set(sessionId, loaded);
    return loaded;
  }
  /** Token list for one session, used for collision-free minting and the lexicon. */
  tokens(sessionId) {
    return this.list(sessionId).map((r) => r.token);
  }
  /** Mint a token that does not collide within the session. */
  nextToken(sessionId, fileName) {
    return makeToken(fileName, this.tokens(sessionId));
  }
  /** The ref for a token in this session — the id the chip carries. */
  refFor(sessionId, token) {
    return makeRef(sessionTag(sessionId), token);
  }
  /** Add or replace a record. */
  add(sessionId, record) {
    this.write(sessionId, addRecord(this.list(sessionId), record));
  }
  /** Drop one record by token. */
  remove(sessionId, token) {
    this.write(sessionId, removeRecord(this.list(sessionId), token));
  }
  /** Find a record by token within one session. */
  find(sessionId, token) {
    return findRecord(this.list(sessionId), token);
  }
  /**
   * Resolve a record from its ref alone.
   * `codec.serialize(ref)` receives no session, so this is the lookup the codec uses.
   */
  byRef(ref) {
    for (const records of this.allSessions()) {
      const hit = records.find((r) => r.ref === ref);
      if (hit !== void 0) return hit;
    }
    return void 0;
  }
  allSessions() {
    const out = [...this.cache.values()];
    for (let i = 0; i < this.storageLength(); i++) {
      const key = this.storageKeyAt(i);
      if (key === null || !key.startsWith(PREFIX)) continue;
      const sessionId = key.slice(PREFIX.length);
      if (!this.cache.has(sessionId)) out.push(this.load(sessionId));
    }
    return out;
  }
  load(sessionId) {
    const raw = this.storage.getItem(PREFIX + sessionId);
    if (raw === null) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((r) => typeof r === "object" && r !== null && typeof r.token === "string" && typeof r.ref === "string");
    } catch {
      return [];
    }
  }
  write(sessionId, records) {
    this.cache.set(sessionId, records);
    try {
      this.storage.setItem(PREFIX + sessionId, JSON.stringify(records));
    } catch {
    }
  }
  /** Number of persisted keys, when the storage exposes enumeration. */
  storageLength() {
    return typeof this.storage.length === "number" ? this.storage.length : 0;
  }
  /** Nth persisted key, when the storage exposes enumeration. */
  storageKeyAt(index) {
    return typeof this.storage.key === "function" ? this.storage.key(index) : null;
  }
};

// src/client/attachment-bar.ts
var import_react = require("react");

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

// src/client/attachment-bar.ts
var CHIP_PLACEHOLDER = "\uFFFC";
var store;
function bindAttachmentStore(next) {
  store = next;
}
function attachmentStore() {
  return store;
}
var removeChip;
function bindChipRemover(remove) {
  removeChip = remove;
}
function draftWithoutChip(draft, offset) {
  if (draft[offset] !== CHIP_PLACEHOLDER) return void 0;
  return draft.slice(0, offset) + draft.slice(offset + 1);
}
function attachmentViewUrl(sessionId, relativePath) {
  const file = encodeURIComponent(relativePath);
  const session = encodeURIComponent(sessionId);
  return `/api/vision-plugin/view?file=${file}&sessionId=${session}`;
}
var lastSnapshot = null;
var lastRenderedSignature = null;
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
function removeDraftAttachment(sessionId, ref) {
  removeChip?.(sessionId, ref);
}
function AttachmentRailEntry({ sessionId, input, inputActions }) {
  (0, import_react.useEffect)(() => {
    const draft = input?.draft ?? "";
    const occurrences = input?.occurrences ?? [];
    bindChipRemover((targetSessionId, ref) => {
      if (targetSessionId !== sessionId) return;
      const occurrence = occurrences.find((o) => o.source === VISION_SOURCE && o.ref === ref);
      if (occurrence?.offset === void 0) return;
      const next = draftWithoutChip(draft, occurrence.offset);
      if (next === void 0) return;
      inputActions?.setDraft(next);
    });
    renderAttachmentBar({ sessionId, occurrences });
  });
  return null;
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
function activeRecords(snapshot) {
  if (store === void 0 || snapshot.sessionId === "") return [];
  const out = [];
  for (const ref of activeTokens(snapshot.occurrences, store.list(snapshot.sessionId))) {
    const record = store.byRef(ref);
    if (record !== void 0) out.push(record);
  }
  return out;
}
function renderAttachmentBar(snapshot) {
  ensureStylesInjected();
  lastSnapshot = snapshot;
  if (snapshot.sessionId !== "") lastActiveSessionId = snapshot.sessionId;
  const attachments = activeRecords(snapshot);
  const containerId = "dsh-vision-attachments-rail";
  const container = document.getElementById(containerId);
  const signature = `${snapshot.sessionId}\0${attachments.map((r) => r.ref).join("\0")}`;
  const railIsCurrent = container !== null;
  const railShouldExist = attachments.length > 0;
  if (signature === lastRenderedSignature && railIsCurrent === railShouldExist) return;
  lastRenderedSignature = signature;
  if (!railShouldExist) {
    if (container) container.remove();
    return;
  }
  const composerCard = document.querySelector('[data-composer-card="true"]');
  if (!composerCard) {
    return;
  }
  const scrollDiv = composerCard.querySelector("[data-input-scroll]");
  let host = container;
  if (host === null) {
    host = document.createElement("div");
    host.id = containerId;
    if (scrollDiv) {
      composerCard.insertBefore(host, scrollDiv);
    } else {
      composerCard.prepend(host);
    }
  }
  host.innerHTML = "";
  const rail = document.createElement("div");
  rail.className = "dsh-vision-rail";
  for (const record of attachments) {
    if (record.isPhoto) {
      const previewUrl = attachmentViewUrl(snapshot.sessionId, record.relativePath);
      const photoCard = document.createElement("div");
      photoCard.className = "dsh-vision-item dsh-vision-item-photo";
      const thumb = document.createElement("div");
      thumb.className = "dsh-vision-thumb";
      thumb.title = `Xem \u1EA3nh ${record.token}`;
      thumb.onclick = () => openImageLightbox(previewUrl, record.token);
      const img = document.createElement("img");
      img.src = previewUrl;
      img.alt = record.token;
      thumb.appendChild(img);
      photoCard.appendChild(thumb);
      const removeBtn = document.createElement("button");
      removeBtn.className = "dsh-vision-remove";
      removeBtn.title = `B\u1ECF \u1EA3nh ${record.token}`;
      removeBtn.innerHTML = CLOSE_ICON_SVG;
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeDraftAttachment(snapshot.sessionId, record.ref);
      };
      photoCard.appendChild(removeBtn);
      rail.appendChild(photoCard);
    } else {
      const ext = record.token.includes(".") ? record.token.split(".").pop().toUpperCase() : "FILE";
      const fileCard = document.createElement("div");
      fileCard.className = "dsh-vision-item";
      const cardInner = document.createElement("div");
      cardInner.className = "dsh-vision-file-card";
      cardInner.title = `${record.token} (${formatFileSize(record.size)})`;
      const badge = document.createElement("div");
      badge.className = "dsh-vision-file-badge";
      badge.innerText = ext.slice(0, 4);
      cardInner.appendChild(badge);
      const meta = document.createElement("div");
      meta.className = "dsh-vision-file-meta";
      meta.innerHTML = `
        <span class="dsh-vision-file-name" title="${record.token}">${record.token}</span>
        <span class="dsh-vision-file-size">${formatFileSize(record.size)}</span>
      `;
      cardInner.appendChild(meta);
      fileCard.appendChild(cardInner);
      const removeBtn = document.createElement("button");
      removeBtn.className = "dsh-vision-remove";
      removeBtn.title = `B\u1ECF t\u1EC7p ${record.token}`;
      removeBtn.innerHTML = CLOSE_ICON_SVG;
      removeBtn.onclick = (e) => {
        e.stopPropagation();
        removeDraftAttachment(snapshot.sessionId, record.ref);
      };
      fileCard.appendChild(removeBtn);
      rail.appendChild(fileCard);
    }
  }
  host.appendChild(rail);
}
if (typeof window !== "undefined") {
  let prevSessionId = null;
  setInterval(() => {
    const currentSid = detectActiveSessionId();
    if (currentSid === prevSessionId) return;
    prevSessionId = currentSid;
    if (lastSnapshot !== null && lastSnapshot.sessionId === currentSid) {
      renderAttachmentBar(lastSnapshot);
      return;
    }
    renderAttachmentBar({ sessionId: currentSid ?? "", occurrences: [] });
  }, 250);
}

// src/client/composer/attach-buttons.tsx
var import_react2 = require("react");

// src/client/instruction.ts
function instructionFor(record) {
  if (record.isPhoto) {
    return `T\xF4i v\u1EEBa t\u1EA3i l\xEAn \u1EA3nh \`${record.relativePath}\`. B\u1EA1n h\xE3y g\u1ECDi tool \`read_image\` \u0111\u1EC3 xem v\xE0 ph\xE2n t\xEDch \u1EA3nh n\xE0y nh\xE9: `;
  }
  return `T\xF4i v\u1EEBa t\u1EA3i l\xEAn file \`${record.relativePath}\`. B\u1EA1n h\xE3y \u0111\u1ECDc n\u1ED9i dung file n\xE0y (d\xF9ng tool \`read\`) v\xE0 h\u1ED7 tr\u1EE3 t\xF4i: `;
}

// src/client/reference.ts
function createVisionSource(store2) {
  return {
    trigger: "@",
    name: VISION_SOURCE,
    candidates: async (session) => store2.list(session.sessionId).map((record) => ({
      name: record.token,
      description: record.relativePath
    })),
    onPick: (pick) => {
      const record = store2.find(pick.session.sessionId, pick.candidate.name);
      const ref = record?.ref ?? store2.refFor(pick.session.sessionId, pick.candidate.name);
      return {
        kind: "insert",
        insert: {
          source: VISION_SOURCE,
          ref,
          label: pick.candidate.name,
          clipboardText: `@${pick.candidate.name}`
        }
      };
    },
    // Lets the render side decorate a typed `@token` and lets paste matching see
    // this session's names. Synchronous by contract — no fetching here.
    lexicon: (session) => store2.tokens(session.sessionId),
    codec: {
      // Reverse-resolve through the store: the session tag is not parseable out
      // of the ref reliably, and the record already holds the readable token.
      clipboardText: (ref) => `@${store2.byRef(ref)?.token ?? ref}`,
      // `ref` is globally unique (session tag + token), which is what makes this
      // resolvable without a session parameter.
      serialize: async (ref, signal) => {
        if (signal.aborted) throw new Error("aborted");
        const record = store2.byRef(ref);
        if (record === void 0) {
          throw new Error(`vision: unknown attachment reference "${ref}"`);
        }
        return instructionFor(record);
      }
    }
  };
}
function mintChip(sessions, sessionId, input, record) {
  const actx = sessions?.scope(sessionId);
  if (actx === void 0) return false;
  const payload = {
    reference: {
      source: VISION_SOURCE,
      ref: record.ref,
      label: record.token,
      clipboardText: `@${record.token}`
    },
    span: { start: input.draft.length, end: input.draft.length, draftRev: input.draftRev }
  };
  return actx.bail(actx, "slash/input-insert-reference", payload) === true;
}

// src/client/composer/attach-buttons.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function AttachButtons({ sessionId, input, store: store2, sessions, notify }) {
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const live = (0, import_react2.useRef)(input);
  live.current = input;
  const attach = (0, import_react2.useCallback)(async (isPhoto) => {
    const accept = isPhoto ? "image/png,image/jpeg,image/webp,image/gif" : "*/*";
    const files = await pickFilesFromBrowser(accept, true);
    if (files.length === 0) return;
    setBusy(true);
    try {
      const responses = await uploadMultipleFiles(sessionId, files, isPhoto);
      let cursor = { draft: live.current.draft, draftRev: live.current.draftRev };
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        if (!response.ok || response.relativePath === void 0) continue;
        const token = store2.nextToken(sessionId, response.filename ?? files[i].name);
        const record = {
          token,
          ref: store2.refFor(sessionId, token),
          relativePath: response.relativePath,
          isPhoto,
          size: files[i].size,
          uploadedAt: Date.now()
        };
        store2.add(sessionId, record);
        if (!mintChip(sessions, sessionId, cursor, record)) {
          notify("error", `Kh\xF4ng ch\xE8n \u0111\u01B0\u1EE3c tham chi\u1EBFu cho ${token}`);
          continue;
        }
        cursor = { draft: `${cursor.draft}\uFFFC `, draftRev: cursor.draftRev + 1 };
      }
    } catch (err) {
      notify("error", `L\u1ED7i t\u1EA3i t\u1EC7p: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }, [sessionId, store2, sessions, notify]);
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        title: "Th\xEAm \u1EA3nh",
        "aria-label": "Th\xEAm \u1EA3nh",
        disabled: busy,
        onClick: () => {
          void attach(true);
        },
        children: "\u{1F4F7}"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
      "button",
      {
        type: "button",
        title: "Th\xEAm t\u1EC7p",
        "aria-label": "Th\xEAm t\u1EC7p",
        disabled: busy,
        onClick: () => {
          void attach(false);
        },
        children: "\u{1F4C4}"
      }
    )
  ] });
}

// src/client/commands.ts
function sessionInput(ctx, sessionId) {
  const sessions = ctx.get("sessions");
  const actx = sessions?.scope?.(sessionId);
  if (actx === void 0) return void 0;
  return ctx.get("conversation")?.input?.for?.(actx);
}
function notifySession(ctx, sessionId, text) {
  const facade = sessionInput(ctx, sessionId);
  if (typeof facade?.notify === "function") {
    facade.notify("error", text);
    return;
  }
  console.warn(`[dsh-upload-plugin] error: ${text}`);
}
async function attachFiles(ctx, sessionId, files, isPhoto) {
  const store2 = attachmentStore();
  if (store2 === void 0) {
    notifySession(ctx, sessionId, "Kho t\u1EC7p \u0111\xEDnh k\xE8m ch\u01B0a s\u1EB5n s\xE0ng");
    return;
  }
  const sessions = ctx.get("sessions");
  const state = sessionInput(ctx, sessionId)?.state?.getSnapshot?.();
  if (state === void 0 || state === null) {
    notifySession(ctx, sessionId, "Phi\xEAn hi\u1EC7n t\u1EA1i ch\u01B0a s\u1EB5n s\xE0ng \u0111\u1EC3 ch\xE8n tham chi\u1EBFu");
    return;
  }
  const responses = await uploadMultipleFiles(sessionId, files, isPhoto);
  let cursor = { draft: state.draft, draftRev: state.draftRev };
  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    const name2 = response.filename ?? files[i].name;
    if (!response.ok || response.relativePath === void 0) {
      notifySession(ctx, sessionId, `Kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c ${name2}`);
      continue;
    }
    const token = store2.nextToken(sessionId, name2);
    const record = {
      token,
      ref: store2.refFor(sessionId, token),
      relativePath: response.relativePath,
      isPhoto,
      size: files[i].size,
      uploadedAt: Date.now()
    };
    store2.add(sessionId, record);
    if (!mintChip(sessions, sessionId, cursor, record)) {
      notifySession(ctx, sessionId, `Kh\xF4ng ch\xE8n \u0111\u01B0\u1EE3c tham chi\u1EBFu cho ${token}`);
      continue;
    }
    cursor = { draft: `${cursor.draft}\uFFFC `, draftRev: cursor.draftRev + 1 };
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
          await attachFiles(ctx, session.sessionId, files, true);
        } catch (err) {
          notifySession(ctx, session.sessionId, `L\u1ED7i upload \u1EA3nh: ${err?.message ?? err}`);
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
          await attachFiles(ctx, session.sessionId, files, false);
        } catch (err) {
          notifySession(ctx, session.sessionId, `L\u1ED7i upload file: ${err?.message ?? err}`);
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
        const store2 = attachmentStore();
        const records = store2?.list(session.sessionId) ?? [];
        const recordByPath = new Map(records.map((r) => [r.relativePath, r]));
        const apiRes = await fetchUploadedFiles(session.sessionId);
        const apiFiles = apiRes.ok ? apiRes.files : [];
        const byPath = /* @__PURE__ */ new Map();
        for (const f of apiFiles) {
          byPath.set(f.relativePath, {
            relativePath: f.relativePath,
            name: cleanDisplayName(f.name),
            size: f.size,
            isPhoto: f.isPhoto,
            previewUrl: f.viewUrl,
            uploadedAt: f.mtime,
            record: recordByPath.get(f.relativePath)
          });
        }
        for (const r of records) {
          if (byPath.has(r.relativePath)) continue;
          byPath.set(r.relativePath, {
            relativePath: r.relativePath,
            name: r.token,
            size: r.size,
            isPhoto: r.isPhoto,
            previewUrl: attachmentViewUrl(session.sessionId, r.relativePath),
            uploadedAt: r.uploadedAt,
            record: r
          });
        }
        const combined = [...byPath.values()].sort((a, b) => b.uploadedAt - a.uploadedAt);
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
          label: `${item.isPhoto ? "\u{1F5BC}\uFE0F" : "\u{1F4C4}"} ${item.name}`,
          detail: `${formatFileSize(item.size)} \xB7 ${item.relativePath}`,
          raw: item
        }));
      },
      onSelect: async (option, session) => {
        if (option.id === "empty") return;
        const item = option.raw;
        if (item?.isPhoto && item?.previewUrl) {
          openImageLightbox(item.previewUrl, item.name);
        }
        const store2 = attachmentStore();
        if (store2 === void 0) {
          notifySession(ctx, session.sessionId, "Kho t\u1EC7p \u0111\xEDnh k\xE8m ch\u01B0a s\u1EB5n s\xE0ng");
          return;
        }
        const state = sessionInput(ctx, session.sessionId)?.state?.getSnapshot?.();
        if (state === void 0 || state === null) {
          notifySession(ctx, session.sessionId, "Phi\xEAn hi\u1EC7n t\u1EA1i ch\u01B0a s\u1EB5n s\xE0ng \u0111\u1EC3 ch\xE8n tham chi\u1EBFu");
          return;
        }
        const token = item.record?.token ?? store2.nextToken(session.sessionId, item.name);
        const record = item.record ?? {
          token,
          ref: store2.refFor(session.sessionId, token),
          relativePath: item.relativePath,
          isPhoto: item.isPhoto,
          size: item.size,
          uploadedAt: Date.now()
        };
        if (item.record === void 0) store2.add(session.sessionId, record);
        if (!mintChip(ctx.get("sessions"), session.sessionId, state, record)) {
          notifySession(ctx, session.sessionId, `Kh\xF4ng ch\xE8n \u0111\u01B0\u1EE3c tham chi\u1EBFu cho ${token}`);
        }
      }
    }
  });
}

// src/client/index.ts
var name = "dsh-upload-plugin-client";
function apply(ctx) {
  registerVisionCommands(ctx);
  const store2 = new AttachmentStore(window.localStorage);
  const source = createVisionSource(store2);
  ctx.inject(["inputTriggers"], (scoped) => {
    const triggers = scoped.get("inputTriggers");
    scoped.effect(() => triggers.registerSource(source), "dsh-upload-plugin: vision reference source");
  });
  ctx.inject(["slots", "sessions"], (scoped) => {
    const slots = scoped.get("slots");
    const sessions = scoped.get("sessions");
    slots.inject("conversation.input.right", () => slots.register({
      name: "conversation.input.right",
      id: "vision-attach",
      order: 10
    }, (props) => {
      const conversation = ctx.get("conversation");
      const notify = (level, text) => {
        const actx = sessions?.scope?.(props.sessionId);
        if (actx === void 0) return;
        const facade = conversation?.input?.for?.(actx);
        if (typeof facade?.notify !== "function") {
          console.warn(`[dsh-upload-plugin] ${level}: ${text}`);
          return;
        }
        facade.notify(level, text);
      };
      return (0, import_react3.createElement)(AttachButtons, {
        sessionId: props.sessionId,
        input: props.input,
        store: store2,
        sessions,
        notify
      });
    }));
  });
  bindAttachmentStore(store2);
  ctx.inject(["slots"], (scoped) => {
    const slots = scoped.get("slots");
    slots.inject("conversation.input.right", () => slots.register({
      name: "conversation.input.right",
      id: "vision-rail",
      order: 11
    }, AttachmentRailEntry));
  });
}
return module.exports;}});
