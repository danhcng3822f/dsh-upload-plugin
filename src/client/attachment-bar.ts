import { formatFileSize } from './uploader.js'

export interface LocalAttachment {
  id: string
  name: string
  relativePath: string
  size: number
  isPhoto: boolean
  previewUrl: string
}

let activeAttachments: LocalAttachment[] = []
let activeSessionId = ''

export function getActiveAttachments(): LocalAttachment[] {
  return activeAttachments
}

export function addAttachments(sessionId: string, newItems: LocalAttachment[]): void {
  if (activeSessionId !== sessionId) {
    activeAttachments = []
    activeSessionId = sessionId
  }
  activeAttachments = [...activeAttachments, ...newItems]
  renderAttachmentBar()
}

export function removeAttachment(id: string): void {
  activeAttachments = activeAttachments.filter(item => item.id !== id)
  renderAttachmentBar()
}

export function clearAttachments(): void {
  activeAttachments = []
  renderAttachmentBar()
}

export function openImageLightbox(imageUrl: string, title: string): void {
  const existing = document.getElementById('dsh-vision-lightbox')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.id = 'dsh-vision-lightbox'
  overlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    z-index: 999999;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
    box-sizing: border-box;
    cursor: zoom-out;
  `

  const header = document.createElement('div')
  header.style.cssText = `
    position: absolute;
    top: 16px; left: 24px; right: 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    color: #fff;
    font-family: system-ui, sans-serif;
    font-size: 14px;
  `
  header.innerHTML = `
    <span style="font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 80%;">${title}</span>
    <button id="dsh-lightbox-close" style="
      background: rgba(255,255,255,0.2);
      border: none;
      color: #fff;
      font-size: 18px;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
    ">✕ Đóng</button>
  `

  const img = document.createElement('img')
  img.src = imageUrl
  img.alt = title
  img.style.cssText = `
    max-width: 90vw;
    max-height: 85vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    cursor: default;
  `
  img.onclick = (e) => e.stopPropagation()

  overlay.appendChild(header)
  overlay.appendChild(img)

  const close = () => overlay.remove()
  overlay.onclick = close
  header.querySelector('#dsh-lightbox-close')?.addEventListener('click', close)

  document.body.appendChild(overlay)
}

export function renderAttachmentBar(): void {
  const containerId = 'dsh-vision-attachment-container'
  let container = document.getElementById(containerId)

  if (activeAttachments.length === 0) {
    if (container) container.remove()
    return
  }

  const composerCard = document.querySelector('[data-composer-card="true"]')
  if (!composerCard) {
    return
  }

  if (!container) {
    container = document.createElement('div')
    container.id = containerId
    container.style.cssText = `
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      padding: 10px 14px;
      margin-bottom: 8px;
      background: var(--dsh-attachment-bar-bg, rgba(120, 120, 120, 0.1));
      backdrop-filter: blur(12px);
      border: 1px solid var(--dsh-attachment-bar-border, rgba(150, 150, 150, 0.25));
      border-radius: 12px;
      align-items: center;
      box-sizing: border-box;
      width: 100%;
      max-height: 180px;
      overflow-y: auto;
      font-family: system-ui, -apple-system, sans-serif;
    `
    composerCard.parentElement?.insertBefore(container, composerCard)
  }

  container.innerHTML = ''

  // Title chip
  const infoHeader = document.createElement('div')
  infoHeader.style.cssText = `
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    color: var(--text-secondary, #888);
    margin-bottom: 4px;
  `
  const photoCount = activeAttachments.filter(a => a.isPhoto).length
  const fileCount = activeAttachments.filter(a => !a.isPhoto).length
  const countLabel = [
    photoCount > 0 ? `${photoCount} ảnh` : '',
    fileCount > 0 ? `${fileCount} file` : '',
  ].filter(Boolean).join(', ')

  infoHeader.innerHTML = `
    <span style="font-weight: 600;">📎 Tệp đính kèm trong phiên (${countLabel}):</span>
    <button id="dsh-vision-clear-all" style="
      background: transparent;
      border: none;
      color: var(--text-secondary, #888);
      font-size: 11px;
      cursor: pointer;
      text-decoration: underline;
    ">Xóa tất cả</button>
  `
  infoHeader.querySelector('#dsh-vision-clear-all')?.addEventListener('click', () => {
    clearAttachments()
  })
  container.appendChild(infoHeader)

  // Items container
  const itemsRow = document.createElement('div')
  itemsRow.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    width: 100%;
  `

  for (const item of activeAttachments) {
    const itemCard = document.createElement('div')
    itemCard.style.cssText = `
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      background: var(--bg-card, rgba(0, 0, 0, 0.2));
      border: 1px solid var(--border, rgba(150, 150, 150, 0.2));
      border-radius: 8px;
      font-size: 12px;
      position: relative;
      max-width: 220px;
    `

    if (item.isPhoto) {
      const thumb = document.createElement('img')
      thumb.src = item.previewUrl
      thumb.alt = item.name
      thumb.style.cssText = `
        width: 36px;
        height: 36px;
        object-fit: cover;
        border-radius: 6px;
        cursor: pointer;
        flex-shrink: 0;
      `
      thumb.title = 'Bấm để xem ảnh phóng to'
      thumb.onclick = () => openImageLightbox(item.previewUrl, item.name)
      itemCard.appendChild(thumb)
    } else {
      const icon = document.createElement('span')
      icon.innerText = '📄'
      icon.style.fontSize = '20px'
      itemCard.appendChild(icon)
    }

    const info = document.createElement('div')
    info.style.cssText = `
      display: flex;
      flex-direction: column;
      overflow: hidden;
      line-height: 1.2;
    `
    info.innerHTML = `
      <span style="font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px;" title="${item.name}">${item.name}</span>
      <span style="font-size: 10px; color: var(--text-secondary, #888);">${formatFileSize(item.size)}</span>
    `
    itemCard.appendChild(info)

    // Remove single button
    const removeBtn = document.createElement('button')
    removeBtn.innerText = '✕'
    removeBtn.style.cssText = `
      background: transparent;
      border: none;
      color: var(--text-secondary, #999);
      cursor: pointer;
      font-size: 12px;
      padding: 2px 4px;
      margin-left: auto;
    `
    removeBtn.title = 'Gỡ đính kèm này'
    removeBtn.onclick = () => removeAttachment(item.id)
    itemCard.appendChild(removeBtn)

    itemsRow.appendChild(itemCard)
  }

  container.appendChild(itemsRow)
}
