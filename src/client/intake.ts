/**
 * The native image-intake pre-check, and the copy for its refusals.
 *
 * The 📷 button admits photos as **native draft images** instead of uploading
 * them into the plugin's own store. The composer's own intake wrapper is not
 * reachable from a slot entry — it is the `conversation.composer.bar` entry's
 * inject face (`ui-conversation/src/client/apply.ts:308-323`), and the
 * `intakeImages` callback that consumes it is private to `InputBar`
 * (`ui-conversation/src/client/skeleton/InputBar.tsx:440-465`). A plugin
 * registering into `conversation.input.right` therefore composes the two calls
 * that wrapper composes — `ConversationController.createDraftImages`
 * (`service.ts:164-172`) and `InputActions.addImages` (`input/contract.ts:37`) —
 * and reproduces the wrapper's checks here, in the wrapper's own order and
 * against the wrapper's own thresholds.
 *
 * Nothing in this module touches the DOM, React or DSH, so the arithmetic that
 * decides whether a batch may be admitted is node-testable.
 */

import { formatFileSize } from './uploader.js'

/**
 * The deployment's image-intake limits: the `imageLimits` session projection.
 *
 * `ImageAttachmentLimits` as the host publishes it
 * (`apiproxy/src/api/sessions.schema.ts:229-235`, view built at
 * `api-proxy.ts:1290` from `attachments.imageLimits`). The projection unit is
 * registered only while an attachment service is composed, so the whole value —
 * not merely a field of it — is absent in a deployment without one.
 */
export interface ImageLimits {
  /** Media types the deployment accepts; the same set `imageMediaType` validates against. */
  readonly mediaTypes: readonly string[]
  /** Cap on the images one message may carry. */
  readonly maxImagesPerMessage: number
  /** Cap on one image's bytes. */
  readonly maxImageBytes: number
  /** Cap on the summed bytes of one message's images. */
  readonly maxMessageImageBytes: number
}

/** The two facts every check reads off a picked file (`File.type`, `File.size`). */
export interface IntakeFile {
  readonly type: string
  readonly size: number
}

/**
 * Why a batch was refused: the check that refused it, plus the threshold it
 * broke. The checks stay free of copy — `intakeRefusalText` renders it — so the
 * same refusal can be tested without asserting on user-facing strings.
 */
export type IntakeRefusal =
  /** A file the deployment's `mediaTypes` does not list. */
  | { readonly reason: 'unsupportedType' }
  /** The draft's images plus this batch would exceed `maxImagesPerMessage`. */
  | { readonly reason: 'tooMany'; readonly limit: number }
  /** At least one file exceeds `maxImageBytes`. */
  | { readonly reason: 'fileTooLarge'; readonly limit: number }
  /** The draft's images plus this batch would exceed `maxMessageImageBytes`. */
  | { readonly reason: 'totalTooLarge'; readonly limit: number }

/**
 * The composer's own intake pre-check, reproduced (`InputBar.tsx:442-463`).
 *
 * Order is part of the contract, not an accident of the code: format precedes
 * every limit check, so a batch holding a non-image announces the format problem
 * rather than a count or size it could never pass anyway. `current` is the
 * draft's live images, because both remaining checks are projections over the
 * whole message rather than over the picked batch alone.
 *
 * An absent `limits` value is capability absence, not a zero limit: with no
 * attachment service composed there is nothing to check against, and the host
 * enforces the same limits at submit for callers that bypass the composer
 * (`InputBar.tsx:437-439`).
 * @param files - the batch the user just picked.
 * @param current - the draft's live native images.
 * @param limits - the projected limits, or undefined while no attachment service is composed.
 * @returns the refusal, or null when the whole batch may be admitted.
 */
export function checkImageIntake(
  files: readonly IntakeFile[],
  current: readonly IntakeFile[],
  limits: ImageLimits | undefined,
): IntakeRefusal | null {
  if (files.length === 0 || limits === undefined) return null

  if (files.some(file => !limits.mediaTypes.includes(file.type))) {
    return { reason: 'unsupportedType' }
  }
  if (current.length + files.length > limits.maxImagesPerMessage) {
    return { reason: 'tooMany', limit: limits.maxImagesPerMessage }
  }
  if (files.some(file => file.size > limits.maxImageBytes)) {
    return { reason: 'fileTooLarge', limit: limits.maxImageBytes }
  }
  const total = current.reduce((sum, file) => sum + file.size, 0)
    + files.reduce((sum, file) => sum + file.size, 0)
  if (total > limits.maxMessageImageBytes) {
    return { reason: 'totalTooLarge', limit: limits.maxMessageImageBytes }
  }
  return null
}

/**
 * The user-facing copy for one refusal.
 *
 * Vietnamese, like the rest of this plugin's UI, and naming the limit that
 * refused the batch the way the harness's own strings do (`locales.ts:44-47`
 * names the count and the byte size). The harness's `conversation`-namespace
 * strings are not reachable here: `t` for that namespace is the composer-bar
 * entry's locale seat (`slots.ts:545`), and this entry registers without a
 * locale.
 * @param refusal - the check that refused the batch.
 * @returns the notice body.
 */
export function intakeRefusalText(refusal: IntakeRefusal): string {
  switch (refusal.reason) {
    case 'unsupportedType':
      return 'Chỉ hỗ trợ ảnh PNG, JPG, WebP, GIF'
    case 'tooMany':
      return `Một tin nhắn chỉ được thêm tối đa ${refusal.limit} ảnh`
    case 'fileTooLarge':
      return `Mỗi ảnh phải nhỏ hơn ${formatFileSize(refusal.limit)}`
    case 'totalTooLarge':
      return `Tổng dung lượng ảnh vượt quá ${formatFileSize(refusal.limit)}, hãy bỏ bớt ảnh`
  }
}
