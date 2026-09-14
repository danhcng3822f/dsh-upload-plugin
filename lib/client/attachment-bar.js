import { formatFileSize, generateDraftPrompt } from './uploader.js';
const STORAGE_PREFIX = 'dsh_vision_uploads_';
export function getSessionUploads(sessionId) {
    try {
        const raw = localStorage.getItem(`${STORAGE_PREFIX}${sessionId}`);
        if (!raw)
            return [];
        return JSON.parse(raw);
    }
    catch {
        return [];
    }
}
export function saveSessionUpload(sessionId, item) {
    try {
        const existing = getSessionUploads(sessionId);
        const updated = [item, ...existing.filter(x => x.relativePath !== item.relativePath)];
        localStorage.setItem(`${STORAGE_PREFIX}${sessionId}`, JSON.stringify(updated.slice(0, 50)));
    }
    catch {
        // Ignore storage quota errors
    }
}
export function saveMultipleSessionUploads(sessionId, items) {
    for (const item of items) {
        saveSessionUpload(sessionId, item);
    }
}
// Map storing active draft attachments per session ID
const sessionDraftMap = new Map();
let lastActiveSessionId = null;
export function detectActiveSessionId() {
    const card = document.querySelector('[data-composer-card="true"]');
    if (!card)
        return lastActiveSessionId;
    const key = Object.keys(card).find(k => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
    if (key) {
        let curr = card[key];
        while (curr) {
            if (curr.memoizedProps?.sessionId)
                return curr.memoizedProps.sessionId;
            if (typeof curr.key === 'string' && curr.key.startsWith('session-'))
                return curr.key;
            curr = curr.return;
        }
    }
    return lastActiveSessionId;
}
export function getDraftAttachments(sessionId) {
    const sid = sessionId ?? detectActiveSessionId();
    if (!sid)
        return [];
    return sessionDraftMap.get(sid) ?? [];
}
export function addDraftAttachments(sessionId, newItems) {
    lastActiveSessionId = sessionId;
    const current = sessionDraftMap.get(sessionId) ?? [];
    sessionDraftMap.set(sessionId, [...current, ...newItems]);
    saveMultipleSessionUploads(sessionId, newItems);
    renderAttachmentBar(sessionId);
}
export function removeDraftAttachment(id) {
    const sid = detectActiveSessionId();
    if (!sid)
        return;
    const current = sessionDraftMap.get(sid) ?? [];
    const updated = current.filter(item => item.id !== id);
    sessionDraftMap.set(sid, updated);
    renderAttachmentBar(sid);
    // Update composer prompt to match remaining attachments
    const textarea = document.querySelector('textarea[data-input-target], textarea');
    if (textarea) {
        if (updated.length === 0) {
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
            if (nativeSetter) {
                nativeSetter.call(textarea, '');
            }
            else {
                textarea.value = '';
            }
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
        else {
            const newPrompt = generateDraftPrompt(updated.map(a => ({ relativePath: a.relativePath, isPhoto: a.isPhoto })));
            const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
            if (nativeSetter) {
                nativeSetter.call(textarea, newPrompt);
            }
            else {
                textarea.value = newPrompt;
            }
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }
}
export function clearDraftAttachments(sessionId) {
    const sid = sessionId ?? detectActiveSessionId();
    if (sid) {
        sessionDraftMap.set(sid, []);
    }
    renderAttachmentBar(sid ?? undefined);
}
/**
 * Injects CSS matching DeepSeek Harness native InputBar and AttachmentRail design tokens
 */
function ensureStylesInjected() {
    const styleId = 'dsh-vision-plugin-styles';
    if (document.getElementById(styleId))
        return;
    const style = document.createElement('style');
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
const CLOSE_ICON_SVG = `
  <svg width="10" height="10" viewBox="0 0 14 14" fill="currentColor">
    <path d="M7 5.586L11.95 0.636a1 1 0 1 1 1.414 1.414L8.414 7l4.95 4.95a1 1 0 0 1-1.414 1.414L7 8.414l-4.95 4.95a1 1 0 0 1-1.414-1.414L5.586 7 0.636 2.05A1 1 0 0 1 2.05 0.636L7 5.586z"/>
  </svg>
`;
/**
 * DeepSeek Harness native-styled Image Lightbox
 */
export function openImageLightbox(imageUrl, title) {
    const existing = document.getElementById('dsh-vision-lightbox');
    if (existing)
        existing.remove();
    const backdrop = document.createElement('div');
    backdrop.id = 'dsh-vision-lightbox';
    backdrop.style.cssText = `
    position: fixed;
    inset: 0;
    z-index: 999999;
    display: grid;
    place-items: center;
    padding: 40px;
    box-sizing: border-box;
  `;
    const mask = document.createElement('div');
    mask.style.cssText = `
    position: absolute;
    inset: 0;
    background: var(--dsw-alias-bg-mask-1, rgba(0, 0, 0, 0.75));
    backdrop-filter: var(--dsw-mask-blur, blur(12px));
    -webkit-backdrop-filter: var(--dsw-mask-blur, blur(12px));
    cursor: zoom-out;
  `;
    backdrop.appendChild(mask);
    const img = document.createElement('img');
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
    const closeBtn = document.createElement('button');
    closeBtn.title = 'Đóng (Esc)';
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
        if (e.key === 'Escape') {
            close();
            document.removeEventListener('keydown', onKeyDown);
        }
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(backdrop);
}
/**
 * Render attachment rail directly inside [data-composer-card="true"]
 * scoped strictly to the current session.
 */
export function renderAttachmentBar(targetSessionId) {
    ensureStylesInjected();
    const sid = targetSessionId ?? detectActiveSessionId();
    const attachments = sid ? (sessionDraftMap.get(sid) ?? []) : [];
    const containerId = 'dsh-vision-attachments-rail';
    let container = document.getElementById(containerId);
    if (attachments.length === 0) {
        if (container)
            container.remove();
        return;
    }
    const composerCard = document.querySelector('[data-composer-card="true"]');
    if (!composerCard) {
        return;
    }
    const scrollDiv = composerCard.querySelector('[data-input-scroll]');
    if (!container) {
        container = document.createElement('div');
        container.id = containerId;
        if (scrollDiv) {
            composerCard.insertBefore(container, scrollDiv);
        }
        else {
            composerCard.prepend(container);
        }
    }
    container.innerHTML = '';
    const rail = document.createElement('div');
    rail.className = 'dsh-vision-rail';
    for (const item of attachments) {
        if (item.isPhoto && item.previewUrl) {
            const photoCard = document.createElement('div');
            photoCard.className = 'dsh-vision-item dsh-vision-item-photo';
            const thumb = document.createElement('div');
            thumb.className = 'dsh-vision-thumb';
            thumb.title = `Xem ảnh ${item.name}`;
            thumb.onclick = () => openImageLightbox(item.previewUrl, item.name);
            const img = document.createElement('img');
            img.src = item.previewUrl;
            img.alt = item.name;
            thumb.appendChild(img);
            photoCard.appendChild(thumb);
            const removeBtn = document.createElement('button');
            removeBtn.className = 'dsh-vision-remove';
            removeBtn.title = `Bỏ ảnh ${item.name}`;
            removeBtn.innerHTML = CLOSE_ICON_SVG;
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                removeDraftAttachment(item.id);
            };
            photoCard.appendChild(removeBtn);
            rail.appendChild(photoCard);
        }
        else {
            const ext = item.name.includes('.') ? item.name.split('.').pop().toUpperCase() : 'FILE';
            const fileCard = document.createElement('div');
            fileCard.className = 'dsh-vision-item';
            const cardInner = document.createElement('div');
            cardInner.className = 'dsh-vision-file-card';
            cardInner.title = `${item.name} (${formatFileSize(item.size)})`;
            const badge = document.createElement('div');
            badge.className = 'dsh-vision-file-badge';
            badge.innerText = ext.slice(0, 4);
            cardInner.appendChild(badge);
            const meta = document.createElement('div');
            meta.className = 'dsh-vision-file-meta';
            meta.innerHTML = `
        <span class="dsh-vision-file-name" title="${item.name}">${item.name}</span>
        <span class="dsh-vision-file-size">${formatFileSize(item.size)}</span>
      `;
            cardInner.appendChild(meta);
            fileCard.appendChild(cardInner);
            const removeBtn = document.createElement('button');
            removeBtn.className = 'dsh-vision-remove';
            removeBtn.title = `Bỏ tệp ${item.name}`;
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
// Watch for session switches in the sidebar to re-render attachment rail for the newly active session
if (typeof window !== 'undefined') {
    let prevSessionId = null;
    setInterval(() => {
        const currentSid = detectActiveSessionId();
        if (currentSid !== prevSessionId) {
            prevSessionId = currentSid;
            renderAttachmentBar(currentSid ?? undefined);
        }
    }, 250);
}
