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
var import_react5 = require("react");

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

// src/client/ref-sync.ts
var REFS_ENDPOINT = "/api/vision-plugin/refs";
var lastPushed = /* @__PURE__ */ new Map();
function signatureOf(refs) {
  return refs.map((record) => `${record.ref}\0${record.relativePath}\0${record.isPhoto ? "1" : "0"}`).join("");
}
function liveRecords(occurrences, records, byRef) {
  const out = [];
  for (const ref of activeTokens(occurrences, records)) {
    const record = byRef(ref);
    if (record !== void 0) out.push(record);
  }
  return out;
}
function syncActiveRefs(sessionId, refs, fetchImpl = typeof fetch === "function" ? fetch : null) {
  if (sessionId === "") return false;
  if (fetchImpl === null) return false;
  const signature = signatureOf(refs);
  if (lastPushed.get(sessionId) === signature) return false;
  lastPushed.set(sessionId, signature);
  const body = JSON.stringify({
    sessionId,
    refs: refs.map((record) => ({
      ref: record.ref,
      relativePath: record.relativePath,
      isPhoto: record.isPhoto
    }))
  });
  let request;
  try {
    request = Promise.resolve(fetchImpl(REFS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body
    }));
  } catch {
    lastPushed.delete(sessionId);
    return false;
  }
  void request.then(
    (response) => {
      if (!response.ok) lastPushed.delete(sessionId);
    },
    () => {
      lastPushed.delete(sessionId);
    }
  );
  return true;
}

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
  return liveRecords(snapshot.occurrences, store.list(snapshot.sessionId), (ref) => store?.byRef(ref));
}
function renderAttachmentBar(snapshot) {
  ensureStylesInjected();
  lastSnapshot = snapshot;
  if (snapshot.sessionId !== "") lastActiveSessionId = snapshot.sessionId;
  const attachments = activeRecords(snapshot);
  syncActiveRefs(snapshot.sessionId, attachments);
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
var import_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/intake.ts
var PHOTO_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
function checkImageIntake(files, current, limits) {
  if (files.length === 0 || limits === void 0) return null;
  if (files.some((file) => !limits.mediaTypes.includes(file.type))) {
    return { reason: "unsupportedType" };
  }
  if (current.length + files.length > limits.maxImagesPerMessage) {
    return { reason: "tooMany", limit: limits.maxImagesPerMessage };
  }
  if (files.some((file) => file.size > limits.maxImageBytes)) {
    return { reason: "fileTooLarge", limit: limits.maxImageBytes };
  }
  const total = current.reduce((sum, file) => sum + file.size, 0) + files.reduce((sum, file) => sum + file.size, 0);
  if (total > limits.maxMessageImageBytes) {
    return { reason: "totalTooLarge", limit: limits.maxMessageImageBytes };
  }
  return null;
}
function intakeRefusalText(refusal) {
  switch (refusal.reason) {
    case "unsupportedType":
      return "Ch\u1EC9 h\u1ED7 tr\u1EE3 \u1EA3nh PNG, JPG, WebP, GIF";
    case "tooMany":
      return `M\u1ED9t tin nh\u1EAFn ch\u1EC9 \u0111\u01B0\u1EE3c th\xEAm t\u1ED1i \u0111a ${refusal.limit} \u1EA3nh`;
    case "fileTooLarge":
      return `M\u1ED7i \u1EA3nh ph\u1EA3i nh\u1ECF h\u01A1n ${formatFileSize(refusal.limit)}`;
    case "totalTooLarge":
      return `T\u1ED5ng dung l\u01B0\u1EE3ng \u1EA3nh v\u01B0\u1EE3t qu\xE1 ${formatFileSize(refusal.limit)}, h\xE3y b\u1ECF b\u1EDBt \u1EA3nh`;
  }
}
function intakePhotos(request) {
  const { files, faces, limits, vision, notify } = request;
  const conversation = faces.conversation;
  if (conversation === void 0) {
    notify("error", "D\u1ECBch v\u1EE5 h\u1ED9i tho\u1EA1i ch\u01B0a s\u1EB5n s\xE0ng \u0111\u1EC3 th\xEAm \u1EA3nh");
    return;
  }
  const draft = faces.draft;
  if (draft === void 0) {
    notify("error", "Phi\xEAn hi\u1EC7n t\u1EA1i ch\u01B0a s\u1EB5n s\xE0ng \u0111\u1EC3 th\xEAm \u1EA3nh");
    return;
  }
  const current = conversation.draftImages(draft.imageIds);
  const refusal = checkImageIntake(files, current.map((image) => image.file), limits);
  if (refusal !== null) {
    notify("info", intakeRefusalText(refusal));
    return;
  }
  let images;
  try {
    images = conversation.createDraftImages(files);
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    notify("info", error.name === "UnsupportedImageMediaTypeError" ? intakeRefusalText({ reason: "unsupportedType" }) : `Kh\xF4ng th\xEAm \u0111\u01B0\u1EE3c \u1EA3nh: ${error.message}`);
    return;
  }
  if (!draft.addImages(images.map((image) => image.id))) {
    conversation.releaseDraftImages(images);
    notify("info", "Ch\u01B0a th\xEAm \u0111\u01B0\u1EE3c \u1EA3nh: h\xE3y th\u1EED l\u1EA1i sau khi tin nh\u1EAFn hi\u1EC7n t\u1EA1i g\u1EEDi xong");
    return;
  }
  void vision.then(
    (check) => {
      if (check.hasVision) return;
      notify("info", `\u26A0\uFE0F Model ${check.model ?? ""} ch\u01B0a b\u1EADt t\xEDnh n\u0103ng xem \u1EA3nh \u2014 ${check.reason ?? "c\u1EA7n th\xEAm input: [text, image] trong c\u1EA5u h\xECnh model"}`);
    },
    // The check reports its own failures optimistically, so this arm exists only
    // so a throw from the notice channel cannot escape as an unhandled rejection.
    (err) => {
      console.warn("[dsh-upload-plugin] vision check:", err);
    }
  );
}

// src/client/reference.ts
var ZERO_WIDTH_PLACEHOLDER = "\u200B";
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
      // R25-B2 — the instruction NO LONGER travels in the message text.
      //
      // It used to be `instructionFor(record)`, which the composer spliced into
      // the prompt at the chip's offset (`facade.ts:436`), so the user's own chat
      // bubble contained a sentence they never typed. The instruction is now a
      // host-side context injection (`src/host/context-injection.ts`), and this
      // codec's whole remaining job is to resolve the ref so an unknown one still
      // blocks the send.
      //
      // It must return something NON-EMPTY, and this is the trap the first attempt
      // at this change fell into. The harness silently refuses a message with no
      // text and no images:
      //
      //   ui-conversation/src/client/input/hub.ts:155
      //   if (text === '' && imageIds.length === 0) return
      //
      // Nothing is sent, no error is raised, no notice appears and the draft is
      // not even cleared — the button simply dies. A file-only send is exactly
      // `text === ''` once this stops returning prose, so the chip's serialization
      // is the only thing keeping it alive.
      //
      // U+200B ZERO WIDTH SPACE, and it survives the harness's own trim:
      // `facade.ts:440` passes the spliced prompt through `out.trim()`, and `trim`
      // removes WhiteSpace and LineTerminator code points. U+200B is neither — it
      // is category Cf (format), not Zs — so it passes through untouched and the
      // send stays non-empty. Verified against the Unicode property, not by eye:
      // `'\u200B'.trim() === '\u200B'` holds in the Node the plugin builds under.
      //
      // A zero-width character rather than a space on purpose: a space would be
      // invisible too, but it would survive into the model-facing prompt as
      // trailing whitespace, while this contributes no glyph, no width and no
      // token to the message the user can see.
      serialize: async (ref, signal) => {
        if (signal.aborted) throw new Error("aborted");
        const record = store2.byRef(ref);
        if (record === void 0) {
          throw new Error(`vision: unknown attachment reference "${ref}"`);
        }
        return ZERO_WIDTH_PLACEHOLDER;
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
function nextChipCursor(cursor) {
  return { draft: `${cursor.draft}\uFFFC `, draftRev: cursor.draftRev + 1 };
}

// src/client/composer/icons.tsx
var import_jsx_runtime = require("react/jsx-runtime");
function IconCameraOutline16({ size = 16, className }) {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      width: size,
      height: size,
      className,
      viewBox: "0 0 16 16",
      fill: "none",
      xmlns: "http://www.w3.org/2000/svg",
      children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
        "path",
        {
          d: "M5.6 2.2h4.8v2.6H5.6zM2.6 4.4h10.8a1.8 1.8 0 0 1 1.8 1.8v5.8a1.8 1.8 0 0 1-1.8 1.8H2.6a1.8 1.8 0 0 1-1.8-1.8V6.2a1.8 1.8 0 0 1 1.8-1.8zM8 6.6a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
          fillRule: "evenodd",
          clipRule: "evenodd",
          fill: "currentColor"
        }
      )
    }
  );
}

// src/client/composer/attach-buttons.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var ICON_BUTTON = { width: 28, padding: 0 };
function AttachButtons({
  sessionId,
  input,
  store: store2,
  sessions,
  notify,
  conversation,
  inputActions,
  useProjection
}) {
  const [busy, setBusy] = (0, import_react2.useState)(false);
  const live = (0, import_react2.useRef)(input);
  live.current = input;
  const imageLimits = useProjection("imageLimits");
  const attachPhoto = (0, import_react2.useCallback)(async () => {
    const vision = checkModelVision(sessionId);
    const files = await pickFilesFromBrowser(PHOTO_ACCEPT, true);
    if (files.length === 0) return;
    intakePhotos({
      files,
      faces: {
        conversation,
        // The slot hands over a point-in-time snapshot; the `live` ref is
        // refreshed on every render, so the batch is checked against the draft as
        // it stands at the click rather than as it stood at mount.
        draft: {
          imageIds: live.current.imageIds,
          addImages: (ids) => inputActions.addImages(ids)
        }
      },
      // The composer's own projection — the same key and the same seat its
      // pre-check reads (`InputBar.tsx:91`), so there is no second source of truth.
      limits: imageLimits,
      vision,
      notify
    });
  }, [sessionId, conversation, inputActions, imageLimits, notify]);
  const attachFile = (0, import_react2.useCallback)(async () => {
    const files = await pickFilesFromBrowser("*/*", true);
    if (files.length === 0) return;
    setBusy(true);
    try {
      const responses = await uploadMultipleFiles(sessionId, files, false);
      let cursor = { draft: live.current.draft, draftRev: live.current.draftRev };
      for (let i = 0; i < responses.length; i++) {
        const response = responses[i];
        if (!response.ok || response.relativePath === void 0) continue;
        const token = store2.nextToken(sessionId, response.filename ?? files[i].name);
        const record = {
          token,
          ref: store2.refFor(sessionId, token),
          relativePath: response.relativePath,
          isPhoto: false,
          size: files[i].size,
          uploadedAt: Date.now()
        };
        store2.add(sessionId, record);
        if (!mintChip(sessions, sessionId, cursor, record)) {
          notify("error", `Kh\xF4ng ch\xE8n \u0111\u01B0\u1EE3c tham chi\u1EBFu cho ${token}`);
          continue;
        }
        cursor = nextChipCursor(cursor);
      }
    } catch (err) {
      notify("error", `L\u1ED7i t\u1EA3i t\u1EC7p: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }, [sessionId, store2, sessions, notify]);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives.Button,
      {
        variant: "toolbar",
        size: "sm",
        icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(IconCameraOutline16, { size: 16 }),
        style: ICON_BUTTON,
        title: "Th\xEAm \u1EA3nh",
        "aria-label": "Th\xEAm \u1EA3nh",
        disabled: busy,
        onClick: () => {
          void attachPhoto();
        }
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      import_dsh_client_ui_primitives.Button,
      {
        variant: "toolbar",
        size: "sm",
        icon: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(import_dsh_client_ui_primitives.IconPaperclipOutline16, { size: 16 }),
        style: ICON_BUTTON,
        title: "Th\xEAm t\u1EC7p",
        "aria-label": "Th\xEAm t\u1EC7p",
        disabled: busy,
        onClick: () => {
          void attachFile();
        }
      }
    )
  ] });
}

// src/client/composer/effort-control.tsx
var import_react3 = require("react");
var import_dsh_client_ui_primitives2 = require("@deepseek-ai/dsh-client-ui-primitives");

// src/client/effort.ts
var CUSTOM_EFFORT_KEY = "custom";
var THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];
function isThinkingLevel(value) {
  return THINKING_LEVELS.includes(value);
}
var THINKING_LEVEL_NAMES = THINKING_LEVELS.join(", ");
function effortChoices(reasoning, current) {
  if (reasoning === void 0 || reasoning.efforts.length === 0) return [];
  const effective = current ?? reasoning.defaultEffort;
  const rows = reasoning.efforts.map((effort) => ({
    key: `effort:${effort.id}`,
    effort: effort.id,
    label: effort.name,
    ...effort.description === void 0 ? {} : { description: effort.description },
    selected: effort.id === effective
  }));
  rows.push({ key: CUSTOM_EFFORT_KEY, label: "Custom\u2026", selected: false, custom: true });
  return rows;
}
function effortLabel(reasoning, current) {
  if (reasoning === void 0) return void 0;
  const effective = current ?? reasoning.defaultEffort;
  if (effective === void 0) return void 0;
  return reasoning.efforts.find((e) => e.id === effective)?.name ?? effective;
}

// src/client/reasoning-setting.ts
function declaredEfforts(row) {
  const declared = row.reasoningEfforts;
  if (typeof declared !== "object" || declared === null || Array.isArray(declared)) return void 0;
  return declared;
}
function addEffort(models, modelId, level) {
  return models.map((row) => {
    if (row.id !== modelId) return row;
    const declared = declaredEfforts(row);
    if (declared === void 0) return row;
    return { ...row, reasoningEfforts: { ...declared, [level]: level === "off" ? null : level } };
  });
}
function planTypedEffort(typed, offered) {
  if (!isThinkingLevel(typed)) {
    return {
      kind: "refuse",
      reason: `"${typed}" kh\xF4ng ph\u1EA3i t\xEAn m\u1EE9c suy lu\u1EADn h\u1EE3p l\u1EC7. Ch\u1EC9 nh\u1EADn: ${THINKING_LEVEL_NAMES}.`
    };
  }
  if (offered.includes(typed)) return { kind: "select", effort: typed };
  return { kind: "read", level: typed };
}
function planDeclaration(level, models, modelId) {
  if (models === void 0) {
    return {
      kind: "refuse",
      reason: `Kh\xF4ng t\xECm th\u1EA5y provider c\u1EE7a model "${modelId}" trong c\u1EA5u h\xECnh n\xEAn kh\xF4ng th\xEAm \u0111\u01B0\u1EE3c m\u1EE9c "${level}".`
    };
  }
  const row = models.find((candidate) => candidate.id === modelId);
  if (row === void 0) {
    return {
      kind: "refuse",
      reason: `Model "${modelId}" kh\xF4ng c\xF3 d\xF2ng khai b\xE1o trong c\u1EA5u h\xECnh (route n\xE0y ph\u1EE5c v\u1EE5 catalog c\xE0i s\u1EB5n), n\xEAn kh\xF4ng th\xEAm \u0111\u01B0\u1EE3c m\u1EE9c "${level}". Khai b\xE1o model k\xE8m reasoningEfforts trong Settings r\u1ED3i th\xEAm l\u1EA1i.`
    };
  }
  if (declaredEfforts(row) === void 0) {
    return {
      kind: "refuse",
      reason: `Model "${modelId}" kh\xF4ng khai b\xE1o reasoningEfforts: c\xE1c m\u1EE9c hi\u1EC7n c\xF3 \u0111\u1EBFn t\u1EEB catalog c\xE0i s\u1EB5n v\xE0 c\xE1ch vi\u1EBFt tr\xEAn \u0111\u01B0\u1EDDng truy\u1EC1n c\u1EE7a ch\xFAng ch\u1EC9 catalog bi\u1EBFt, n\xEAn th\xEAm m\u1ED9t m\u1EE9c s\u1EBD ph\u1EA3i khai b\xE1o l\u1EA1i ch\xFAng. Khai b\xE1o reasoningEfforts cho model n\xE0y trong Settings r\u1ED3i th\xEAm m\u1EE9c "${level}" l\u1EA1i.`
    };
  }
  return { kind: "declare", models: addEffort(models, modelId, level) };
}

// src/client/settings/document.ts
var SETTINGS_NAMESPACE = "llm-pi-ai";
function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}
function isRowObject(row) {
  return typeof row === "object" && row !== null && !Array.isArray(row);
}
function readProviders(value) {
  if (typeof value !== "object" || value === null) return [];
  const providers = value.providers;
  if (typeof providers !== "object" || providers === null || Array.isArray(providers)) return [];
  return Object.entries(providers).map(([id, profile]) => {
    const fields = typeof profile === "object" && profile !== null && !Array.isArray(profile) ? profile : {};
    return {
      id,
      displayName: typeof fields.displayName === "string" ? fields.displayName : void 0,
      models: Array.isArray(fields.models) ? fields.models.filter(isRowObject) : []
    };
  });
}
function providerModels(value, providerId) {
  return readProviders(value).find((provider) => provider.id === providerId)?.models;
}

// src/client/composer/effort-control.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var ROOT_STYLE = { position: "relative", display: "inline-flex", alignItems: "center" };
var MENU_STYLE = {
  position: "absolute",
  bottom: "calc(100% + 4px)",
  left: 0,
  zIndex: 20,
  minWidth: 160,
  padding: 4,
  border: "1px solid var(--dsw-alias-border-inverted)",
  borderRadius: 12,
  background: "var(--dsw-specific-menu)",
  boxShadow: "var(--dsw-shadow-lv3)"
};
var ROW_STYLE = { width: "100%", justifyContent: "flex-start" };
function usableReasoning(reasoning) {
  if (reasoning === void 0 || !Array.isArray(reasoning.efforts)) return void 0;
  return reasoning;
}
function EffortControl({ available, directory, load, select, settings, onError }) {
  const [snapshot, setSnapshot] = (0, import_react3.useState)(() => directory.getSnapshot());
  const [open, setOpen] = (0, import_react3.useState)(false);
  const [customOpen, setCustomOpen] = (0, import_react3.useState)(false);
  const [customValue, setCustomValue] = (0, import_react3.useState)("");
  const [declaring, setDeclaring] = (0, import_react3.useState)(false);
  const [toast, setToast] = (0, import_react3.useState)(null);
  const toastSeq = (0, import_react3.useRef)(0);
  const rootRef = (0, import_react3.useRef)(null);
  (0, import_react3.useEffect)(() => directory.subscribe(() => {
    setSnapshot(directory.getSnapshot());
  }), [directory]);
  (0, import_react3.useEffect)(() => {
    if (!available) return;
    load();
  }, [available, load]);
  (0, import_react3.useEffect)(() => {
    if (!open) return;
    const closeOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
        setCustomOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOutside);
    return () => {
      document.removeEventListener("mousedown", closeOutside);
    };
  }, [open]);
  const current = snapshot.current;
  const currentModel = (0, import_react3.useMemo)(() => {
    if (current === null) return void 0;
    for (const group of snapshot.groups) {
      for (const model of group.models) {
        if (group.id === current.provider && model.id === current.model) return model;
      }
    }
    return void 0;
  }, [snapshot.groups, current]);
  const reasoning = usableReasoning(currentModel?.reasoning);
  const choices = (0, import_react3.useMemo)(
    () => effortChoices(reasoning, current?.reasoningEffort),
    [reasoning, current?.reasoningEffort]
  );
  const offered = (0, import_react3.useMemo)(() => reasoning?.efforts.map((effort) => effort.id) ?? [], [reasoning]);
  if (!available) return null;
  if (reasoning === void 0) return null;
  const report = (message) => {
    onError(message);
    toastSeq.current += 1;
    setToast({ seq: toastSeq.current, text: message });
  };
  const settle = (accepted, prefix) => {
    if (accepted) {
      setOpen(false);
      setCustomOpen(false);
      return;
    }
    const message = directory.getSnapshot().error ?? "Kh\xF4ng \u0111\u1ED5i \u0111\u01B0\u1EE3c model";
    report(prefix === void 0 ? message : `${prefix} ${message}`);
  };
  const chooseEffort = (effort, declared = false) => {
    if (current === null || effort === void 0) return;
    void select({ provider: current.provider, model: current.model, reasoningEffort: effort }).then((accepted) => {
      settle(accepted, declared ? `\u0110\xE3 th\xEAm m\u1EE9c "${effort}" nh\u01B0ng ch\u01B0a ch\u1ECDn \u0111\u01B0\u1EE3c.` : void 0);
      if (accepted && declared) load();
    });
  };
  const declareEffort = async (level) => {
    if (current === null) return;
    const { provider, model } = current;
    setDeclaring(true);
    try {
      const described = await settings.describe({});
      if (!described.result.ok) {
        report(`Kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh model: ${described.result.error.message}`);
        return;
      }
      const view = described.result.value.namespaces.find((candidate) => candidate.ns === SETTINGS_NAMESPACE);
      if (view === void 0) {
        report(`Kh\xF4ng t\xECm th\u1EA5y namespace "${SETTINGS_NAMESPACE}" trong c\u1EA5u h\xECnh.`);
        return;
      }
      const plan = planDeclaration(level, providerModels(view.value, provider), model);
      if (plan.kind === "refuse") {
        report(plan.reason);
        return;
      }
      const response = await settings.mutate({
        ns: SETTINGS_NAMESPACE,
        ops: [{ op: "set", path: ["providers", provider, "models"], value: plan.models }],
        expectedRevision: view.revision
      });
      if (!response.result.ok) {
        report(response.result.error.code === "settings-conflict" ? `C\u1EA5u h\xECnh v\u1EEBa b\u1ECB thay \u0111\u1ED5i \u1EDF n\u01A1i kh\xE1c n\xEAn ch\u01B0a th\xEAm \u0111\u01B0\u1EE3c m\u1EE9c "${level}". Th\u1EED l\u1EA1i.` : `Kh\xF4ng th\xEAm \u0111\u01B0\u1EE3c m\u1EE9c "${level}": ${response.result.error.message}`);
        return;
      }
      report(`\u0110\xE3 th\xEAm m\u1EE9c "${level}" cho model "${model}".`);
      chooseEffort(level, true);
    } catch (err) {
      report(`Kh\xF4ng th\xEAm \u0111\u01B0\u1EE3c m\u1EE9c "${level}": ${messageOf(err)}`);
    } finally {
      setDeclaring(false);
    }
  };
  const submitCustom = (typed) => {
    if (current === null) {
      report("Ch\u01B0a ch\u1ECDn \u0111\u01B0\u1EE3c model cho phi\xEAn n\xE0y.");
      return;
    }
    const plan = planTypedEffort(typed, offered);
    if (plan.kind === "refuse") {
      report(plan.reason);
      return;
    }
    if (plan.kind === "select") {
      chooseEffort(plan.effort);
      return;
    }
    void declareEffort(plan.level);
  };
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { ref: rootRef, style: ROOT_STYLE, children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
      import_dsh_client_ui_primitives2.Button,
      {
        variant: "toolbar",
        size: "sm",
        "aria-haspopup": "menu",
        "aria-expanded": open,
        title: "M\u1EE9c suy lu\u1EADn",
        onClick: () => {
          setOpen(!open);
          setCustomOpen(false);
        },
        children: [
          effortLabel(reasoning, current?.reasoningEffort) ?? "\u2014",
          /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.IconChevronDownOutline14, { size: 14 })
        ]
      }
    ),
    open && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { role: "menu", style: MENU_STYLE, children: [
      choices.filter((choice) => !choice.custom).map((choice) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          variant: "ghost",
          size: "sm",
          style: ROW_STYLE,
          role: "menuitemradio",
          "aria-checked": choice.selected,
          disabled: snapshot.status === "selecting" || declaring,
          onClick: () => {
            chooseEffort(choice.effort);
          },
          children: choice.label
        },
        choice.key
      )),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        import_dsh_client_ui_primitives2.Button,
        {
          variant: "ghost",
          size: "sm",
          style: ROW_STYLE,
          disabled: snapshot.status === "selecting" || declaring,
          onClick: () => {
            setCustomOpen(true);
          },
          children: "Custom\u2026"
        }
      ),
      customOpen && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
        "form",
        {
          style: { display: "flex", gap: 4, padding: 4 },
          onSubmit: (event) => {
            event.preventDefault();
            const value = customValue.trim();
            if (value !== "") submitCustom(value);
          },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
              "input",
              {
                value: customValue,
                onChange: (event) => {
                  setCustomValue(event.target.value);
                },
                placeholder: "reasoning effort",
                "aria-label": "Custom reasoning effort",
                disabled: declaring
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(import_dsh_client_ui_primitives2.Button, { variant: "ghost", size: "sm", type: "submit", disabled: declaring, children: "OK" })
          ]
        }
      )
    ] }),
    toast !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      import_dsh_client_ui_primitives2.Toast,
      {
        text: toast.text,
        anchor: rootRef.current?.closest("[data-composer-card]") ?? null,
        onDone: () => {
          setToast(null);
        }
      },
      toast.seq
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
function notifySession(ctx, sessionId, level, text) {
  const facade = sessionInput(ctx, sessionId);
  if (typeof facade?.notify === "function") {
    facade.notify(level, text);
    return;
  }
  console.warn(`[dsh-upload-plugin] ${level}: ${text}`);
}
function draftAdmission(ctx, sessionId) {
  const facade = sessionInput(ctx, sessionId);
  if (typeof facade?.addImages !== "function") return void 0;
  const state = facade.state?.getSnapshot?.();
  if (state === void 0 || state === null) return void 0;
  return {
    imageIds: state.imageIds,
    addImages: (ids) => facade.addImages(ids)
  };
}
async function attachFiles(ctx, sessionId, files, isPhoto) {
  const store2 = attachmentStore();
  if (store2 === void 0) {
    notifySession(ctx, sessionId, "error", "Kho t\u1EC7p \u0111\xEDnh k\xE8m ch\u01B0a s\u1EB5n s\xE0ng");
    return;
  }
  const sessions = ctx.get("sessions");
  const ready = sessionInput(ctx, sessionId)?.state?.getSnapshot?.();
  if (ready === void 0 || ready === null) {
    notifySession(ctx, sessionId, "error", "Phi\xEAn hi\u1EC7n t\u1EA1i ch\u01B0a s\u1EB5n s\xE0ng \u0111\u1EC3 ch\xE8n tham chi\u1EBFu");
    return;
  }
  const responses = await uploadMultipleFiles(sessionId, files, isPhoto);
  const live = sessionInput(ctx, sessionId)?.state?.getSnapshot?.();
  if (live === void 0 || live === null) {
    notifySession(ctx, sessionId, "error", "Phi\xEAn hi\u1EC7n t\u1EA1i ch\u01B0a s\u1EB5n s\xE0ng \u0111\u1EC3 ch\xE8n tham chi\u1EBFu");
    return;
  }
  let cursor = { draft: live.draft, draftRev: live.draftRev };
  for (let i = 0; i < responses.length; i++) {
    const response = responses[i];
    const name2 = response.filename ?? files[i].name;
    if (!response.ok || response.relativePath === void 0) {
      notifySession(ctx, sessionId, "error", `Kh\xF4ng t\u1EA3i \u0111\u01B0\u1EE3c ${name2}`);
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
      notifySession(ctx, sessionId, "error", `Kh\xF4ng ch\xE8n \u0111\u01B0\u1EE3c tham chi\u1EBFu cho ${token}`);
      continue;
    }
    cursor = nextChipCursor(cursor);
  }
}
function registerVisionCommands(ctx) {
  const commandUi = ctx.get("commandUi");
  if (!commandUi || typeof commandUi.register !== "function") {
    return;
  }
  commandUi.register({
    name: "photos",
    description: "Add photos (Th\xEAm m\u1ED9t ho\u1EB7c nhi\u1EC1u \u1EA3nh v\xE0o b\u1EA3n nh\xE1p \u0111\u1EC3 model xem tr\u1EF1c ti\u1EBFp)",
    available: () => true,
    ui: {
      kind: "popupSelect",
      options: async () => [
        {
          id: "pick-photo",
          label: "\u{1F4F7} Ch\u1ECDn m\u1ED9t ho\u1EB7c nhi\u1EC1u \u1EA3nh",
          detail: "H\u1ED7 tr\u1EE3 ch\u1ECDn nhi\u1EC1u \u1EA3nh c\xF9ng l\xFAc (.png, .jpg, .webp, .gif)"
        }
      ],
      onSelect: async (_option, session) => {
        const sessionId = session.sessionId;
        const vision = checkModelVision(sessionId);
        const files = await pickFilesFromBrowser(PHOTO_ACCEPT, true);
        if (files.length === 0) return;
        intakePhotos({
          files,
          faces: {
            // The service the button is handed as a prop, reached the way this
            // file already reaches `sessions` and `conversation.input`.
            conversation: ctx.get("conversation"),
            draft: draftAdmission(ctx, sessionId)
          },
          // No limits are passed on purpose. `imageLimits` arrives through
          // `useProjection`, a hook that exists only inside a slot component
          // (`web-react/src/session-provider.tsx:96-114`), and a command is not one.
          // Absent limits are capability absence, not a zero limit: the admission
          // then defers to the host's submit-time enforcement, which is the
          // posture the composer documents for callers that bypass it
          // (`InputBar.tsx:437-439`).
          limits: void 0,
          vision,
          notify: (level, text) => {
            notifySession(ctx, sessionId, level, text);
          }
        });
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
          notifySession(ctx, session.sessionId, "error", `L\u1ED7i upload file: ${err?.message ?? err}`);
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
              detail: "D\xF9ng /files \u0111\u1EC3 t\u1EA3i t\u1EC7p v\xE0o session n\xE0y"
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
          notifySession(ctx, session.sessionId, "error", "Kho t\u1EC7p \u0111\xEDnh k\xE8m ch\u01B0a s\u1EB5n s\xE0ng");
          return;
        }
        const state = sessionInput(ctx, session.sessionId)?.state?.getSnapshot?.();
        if (state === void 0 || state === null) {
          notifySession(ctx, session.sessionId, "error", "Phi\xEAn hi\u1EC7n t\u1EA1i ch\u01B0a s\u1EB5n s\xE0ng \u0111\u1EC3 ch\xE8n tham chi\u1EBFu");
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
          notifySession(ctx, session.sessionId, "error", `Kh\xF4ng ch\xE8n \u0111\u01B0\u1EE3c tham chi\u1EBFu cho ${token}`);
        }
      }
    }
  });
}

// src/client/settings/vision-section.tsx
var import_react4 = require("react");

// src/client/vision-setting.ts
function hasVision(row) {
  return Array.isArray(row.input) && row.input.includes("image");
}
function setVision(models, modelId, on) {
  return models.map((row) => {
    if (row.id !== modelId) return row;
    const next = { ...row };
    if (on) {
      next.input = ["text", "image"];
    } else {
      delete next.input;
    }
    return next;
  });
}

// src/client/settings/vision-section.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
function isAddressable(row) {
  return typeof row.id === "string" && row.id.length > 0;
}
function VisionSection({ api, onDocumentUpdated }) {
  const [providers, setProviders] = (0, import_react4.useState)([]);
  const [writable, setWritable] = (0, import_react4.useState)(false);
  const [loadError, setLoadError] = (0, import_react4.useState)(null);
  const [writeError, setWriteError] = (0, import_react4.useState)(null);
  const [busy, setBusy] = (0, import_react4.useState)(false);
  const [loading, setLoading] = (0, import_react4.useState)(true);
  const load = (0, import_react4.useCallback)(async () => {
    try {
      const response = await api.settings.describe({});
      if (!response.result.ok) {
        setLoadError(response.result.error.message);
        return;
      }
      const view = response.result.value.namespaces.find((candidate) => candidate.ns === SETTINGS_NAMESPACE);
      if (view === void 0) {
        setProviders([]);
        setWritable(false);
        setLoadError(`Kh\xF4ng t\xECm th\u1EA5y namespace "${SETTINGS_NAMESPACE}"`);
        return;
      }
      setProviders(readProviders(view.value));
      setWritable(response.result.value.writable);
      setLoadError(null);
    } catch (err) {
      setLoadError(messageOf(err));
    } finally {
      setLoading(false);
    }
  }, [api]);
  (0, import_react4.useEffect)(() => {
    void load();
  }, [load]);
  (0, import_react4.useEffect)(() => onDocumentUpdated(() => {
    void load();
  }), [onDocumentUpdated, load]);
  const toggle = (0, import_react4.useCallback)(async (providerId, modelId, on) => {
    setBusy(true);
    try {
      const described = await api.settings.describe({});
      if (!described.result.ok) {
        setWriteError(described.result.error.message);
        return;
      }
      const view = described.result.value.namespaces.find((candidate) => candidate.ns === SETTINGS_NAMESPACE);
      const provider = view === void 0 ? void 0 : readProviders(view.value).find((row) => row.id === providerId);
      if (view === void 0 || provider === void 0) {
        setWriteError(`Kh\xF4ng t\xECm th\u1EA5y provider "${providerId}" trong "${SETTINGS_NAMESPACE}"`);
        return;
      }
      const response = await api.settings.mutate({
        ns: SETTINGS_NAMESPACE,
        ops: [{
          op: "set",
          path: ["providers", providerId, "models"],
          value: setVision(provider.models, modelId, on)
        }],
        expectedRevision: view.revision
      });
      if (!response.result.ok) {
        setWriteError(response.result.error.code === "settings-conflict" ? "C\u1EA5u h\xECnh v\u1EEBa b\u1ECB thay \u0111\u1ED5i \u1EDF n\u01A1i kh\xE1c. Th\u1EED l\u1EA1i." : response.result.error.message);
        return;
      }
      setWriteError(null);
      await load();
    } catch (err) {
      setWriteError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }, [api, load]);
  if (loadError !== null) {
    return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { children: [
        "Kh\xF4ng \u0111\u1ECDc \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh model: ",
        loadError
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: () => {
        void load();
      }, children: "Th\u1EED l\u1EA1i" })
    ] });
  }
  const total = providers.reduce((sum, provider) => sum + provider.models.length, 0);
  const declared = providers.filter((provider) => provider.models.length > 0);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { children: [
      "B\u1EADt/t\u1EAFt kh\u1EA3 n\u0103ng \u0111\u1ECDc \u1EA3nh cho t\u1EEBng model. B\u1EADt s\u1EBD khai b\xE1o ",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("code", { children: 'input: ["text","image"]' }),
      "."
    ] }),
    loading && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: "\u0110ang t\u1EA3i\u2026" }),
    !loading && !writable && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("p", { children: "C\u1EA5u h\xECnh hi\u1EC7n ch\u1EC9 cho \u0111\u1ECDc n\xEAn kh\xF4ng l\u01B0u \u0111\u01B0\u1EE3c thay \u0111\u1ED5i." }),
    !loading && total === 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { children: [
      "Ch\u01B0a c\xF3 provider n\xE0o khai b\xE1o model trong ",
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("code", { children: SETTINGS_NAMESPACE }),
      "."
    ] }),
    writeError !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { children: [
      "Kh\xF4ng c\u1EADp nh\u1EADt \u0111\u01B0\u1EE3c c\u1EA5u h\xECnh model: ",
      writeError
    ] }),
    declared.map((provider) => {
      const rows = provider.models.filter(isAddressable);
      const skipped = provider.models.length - rows.length;
      return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("section", { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("h3", { children: provider.displayName ?? provider.id }),
        rows.map((model, index) => (
          // The key pairs the row's position with its id: `setVision` flips
          // every row whose id matches, so a malformed document may hold
          // duplicate ids and the position is what stays unique.
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "input",
              {
                type: "checkbox",
                checked: hasVision(model),
                disabled: busy || !writable,
                onChange: (event) => {
                  void toggle(provider.id, model.id, event.target.checked);
                }
              }
            ),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: model.name ?? model.id })
          ] }, `${model.id}#${String(index)}`)
        )),
        skipped > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("p", { children: [
          skipped,
          " model thi\u1EBFu id n\xEAn b\u1ECF qua."
        ] })
      ] }, provider.id);
    })
  ] });
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
        const facade = actx === void 0 ? void 0 : conversation?.input?.for?.(actx);
        if (typeof facade?.notify !== "function") {
          console.warn(`[dsh-upload-plugin] ${level}: ${text}`);
          return;
        }
        facade.notify(level, text);
      };
      return (0, import_react5.createElement)(AttachButtons, {
        sessionId: props.sessionId,
        input: props.input,
        store: store2,
        sessions,
        notify,
        // R25-B1 — the native intake face. `conversation` is already resolved
        // above for the notice channel; `inputActions` and `useProjection` are
        // the session standard kit's own seats, delivered to every session-scope
        // slot entry (`web-react/src/scoped-slots.tsx:376-378`) and the same two
        // the composer's bar reads (`InputBar.tsx:48-51,91`).
        conversation,
        inputActions: props.inputActions,
        useProjection: props.useProjection
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
  ctx.inject(["slots", "sessions", "modelDirectories", "connection"], (scoped) => {
    const slots = scoped.get("slots");
    const sessions = scoped.get("sessions");
    const directories = scoped.get("modelDirectories");
    const connection = scoped.get("connection");
    slots.inject("conversation.input.right", () => slots.register({
      name: "conversation.input.right",
      id: "vision-effort",
      order: 12,
      // The render machinery memoizes an entry's inject face per entry x session
      // scope (web-react `scoped-slots.tsx`, sessionInjectCache), so `load` and
      // `select` keep their identity across re-renders and the control's mount
      // effect fires once per session. Built inline in a render callback
      // instead, `load` would be a fresh function on every composer render and
      // that effect would re-issue `session.models` on every keystroke.
      inject: (sessionId) => {
        const available = sessions?.subagentAddress?.(sessionId) === void 0;
        const directory = directories.directoryFor(sessionId);
        return {
          available,
          directory: directory.store,
          load: () => {
            if (available) directory.load().catch(() => {
            });
          },
          select: (selection) => available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false),
          settings: connection.api.settings,
          onError: (message) => {
            console.warn("[dsh-upload-plugin] effort control:", message);
          }
        };
      }
    }, EffortControl));
  });
  ctx.inject(["slots", "connection", "remote"], (scoped) => {
    const slots = scoped.get("slots");
    const connection = scoped.get("connection");
    const remote = scoped.get("remote");
    const reloaders = /* @__PURE__ */ new Set();
    scoped.effect(() => {
      const dispose = remote.$on("settings/document-updated", (ns) => {
        if (ns !== SETTINGS_NAMESPACE) return;
        for (const reload of reloaders) reload();
      });
      return () => {
        dispose();
        reloaders.clear();
      };
    }, "dsh-upload-plugin: vision settings document invalidations");
    slots.inject("settings.section", () => slots.register({
      name: "settings.section",
      id: "vision",
      order: 20,
      label: () => "Vision",
      // Annotated with the component's own props type on purpose: `slots` is
      // `any` (the harness's `SlotCore`/`SlotMap` types are not installable in
      // this package — see the note in `platform-modules.d.ts`), so without this
      // nothing checks that the face this entry hands over is the face the
      // section reads.
      inject: () => ({
        api: connection.api,
        onDocumentUpdated: (reload) => {
          reloaders.add(reload);
          return () => {
            reloaders.delete(reload);
          };
        }
      })
    }, VisionSection));
  });
}
return module.exports;}});
