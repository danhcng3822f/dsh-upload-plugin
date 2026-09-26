/**
 * Local glyphs for this plugin's composer controls.
 *
 * The harness's `ic_ds_*` set (`ui-primitives/src/icons/index.tsx`) has no camera
 * or photo glyph — its closest, `IconBrowseOutline16`, is a document — so the
 * attach-photo button would otherwise have to fall back on an emoji, which reads
 * as foreign next to the shell's monochrome 16px icons. This one is drawn in the
 * same idiom: a 16x16 viewBox, `fill="currentColor"`, no stroke.
 */
import type { IconProps } from '@deepseek-ai/dsh-client-ui-primitives';
/**
 * A camera: a viewfinder bump, a rounded body, and a lens cut out of it.
 *
 * The lens is a second subpath inside the same `d`, resolved by `evenodd` into a
 * hole — the technique the harness's own two-part glyphs use.
 * @param props.size - square edge in px; defaults to the drawn 16.
 * @param props.className - extra class for layout placement.
 * @returns the glyph, colored by the surrounding `currentColor`.
 */
export declare function IconCameraOutline16({ size, className }: IconProps): import("react").JSX.Element;
