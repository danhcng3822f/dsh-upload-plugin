/**
 * The two fields the instruction is built from.
 *
 * The parameter is this structural minimum rather than the full
 * `AttachmentRecord`, because the two callers hold different things: the client
 * has the whole record, while the host holds only the projection the client
 * pushed (`PendingAttachment` in `src/types.ts`). Demanding the full record from
 * the host would force it to carry `token`, `size` and `uploadedAt` it never
 * reads, just to satisfy a signature — the fields are named here so neither side
 * can pass something the renderer cannot use.
 */
export interface InstructionSubject {
    /** Workspace-relative path, interpolated into the sentence verbatim. */
    relativePath: string;
    /** Which tool the instruction asks for: `read_image` when true, `read` when false. */
    isPhoto: boolean;
}
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
export declare function instructionFor(record: InstructionSubject): string;
