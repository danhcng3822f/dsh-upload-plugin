import type { AttachmentRecord } from './attachments.js';
/**
 * The model-facing instruction for one attachment.
 *
 * This text never enters the draft: the draft holds a chip, and this string is
 * produced by the reference codec at submit time.
 */
export declare function instructionFor(record: AttachmentRecord): string;
