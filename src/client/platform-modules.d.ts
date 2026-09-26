/**
 * Type surface of the browser platform modules this plugin imports at runtime.
 *
 * `@deepseek-ai/dsh-client-ui-primitives` is a platform module: the shell seeds it
 * into the frozen module table and `build-client.mjs` marks it external, so the
 * bundle's own `require` resolves it at runtime. It is deliberately not an npm
 * dependency of this package — the only version on the registry is a different,
 * older package than the harness ships — so without a declaration `tsc` rejects
 * the import with TS2307 and the build cannot stay clean.
 *
 * The one signature below is verbatim from the harness
 * (`packages/client/ui-primitives/src/Toast.tsx:28-33`, re-exported at
 * `src/index.ts:27`); its return type is what that implementation's
 * `createPortal` yields. Extend this file only with symbols this plugin actually
 * imports, each one checked against that source.
 */
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  /**
   * Transient top-center banner: slides in, holds at full opacity, fades out,
   * then reports done so the owner can unmount it. Re-showing the same text
   * restarts the cycle when the owner remounts the component.
   * @param props.text - resolved banner copy; the owner passes the text to show.
   * @param props.icon - optional leading glyph.
   * @param props.anchor - optional element whose horizontal center the banner follows.
   * @param props.onDone - called once the fade completes; unmount the toast here.
   */
  export function Toast(props: {
    text: string
    icon?: import('react').ReactNode
    anchor?: HTMLElement | null
    onDone: () => void
  }): import('react').ReactElement
}
