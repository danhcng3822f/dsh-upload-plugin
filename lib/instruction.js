/**
 * The model-facing instruction for one attachment.
 *
 * ONE definition, read by both halves of the plugin. It used to live in
 * `client/instruction.ts` and was consumed only by the reference codec, which
 * spliced the result into the text of the user's own chat message. R25-B2 moved
 * the delivery to a host-side context injection (`src/host/context-injection.ts`)
 * while the client kept minting the refs, so the wording would have had to exist
 * twice — and the two copies would drift exactly where it matters most, in the
 * `read_image`-versus-`read` distinction and the `relativePath` interpolation.
 * The module therefore sits at the plugin root, which both bundles reach:
 * `lib/index.js` (host, `tsc`) and `lib/client.js` (client, esbuild) each compile
 * their own copy of it.
 *
 * It imports nothing at runtime, so the host bundle pulls in no client module.
 *
 * Second person, not first: this text now arrives as a context injection rather
 * than as something the user typed, so "I just uploaded a file" would be the
 * plugin claiming to be the user. The sentences name the path and the tool, and
 * stop there.
 * @param record - the attachment the model is being pointed at.
 * @returns the sentence naming the path and the tool that reads it.
 */
export function instructionFor(record) {
    if (record.isPhoto) {
        return `Bạn vừa được gửi kèm ảnh \`${record.relativePath}\`. Hãy gọi tool \`read_image\` để xem và phân tích ảnh này:`;
    }
    return `Bạn vừa được gửi kèm file \`${record.relativePath}\`. Hãy đọc nội dung file này (dùng tool \`read\`) và hỗ trợ người dùng:`;
}
