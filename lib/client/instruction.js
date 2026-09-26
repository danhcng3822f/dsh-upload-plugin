/**
 * The model-facing instruction for one attachment.
 *
 * This text never enters the draft: the draft holds a chip, and this string is
 * produced by the reference codec at submit time.
 */
export function instructionFor(record) {
    if (record.isPhoto) {
        return `Tôi vừa tải lên ảnh \`${record.relativePath}\`. Bạn hãy gọi tool \`read_image\` để xem và phân tích ảnh này nhé: `;
    }
    return `Tôi vừa tải lên file \`${record.relativePath}\`. Bạn hãy đọc nội dung file này (dùng tool \`read\`) và hỗ trợ tôi: `;
}
