import { jsx as _jsx } from "react/jsx-runtime";
/**
 * A camera: a viewfinder bump, a rounded body, and a lens cut out of it.
 *
 * The lens is a second subpath inside the same `d`, resolved by `evenodd` into a
 * hole — the technique the harness's own two-part glyphs use.
 * @param props.size - square edge in px; defaults to the drawn 16.
 * @param props.className - extra class for layout placement.
 * @returns the glyph, colored by the surrounding `currentColor`.
 */
export function IconCameraOutline16({ size = 16, className }) {
    return (_jsx("svg", { width: size, height: size, className: className, viewBox: "0 0 16 16", fill: "none", xmlns: "http://www.w3.org/2000/svg", children: _jsx("path", { d: "M5.6 2.2h4.8v2.6H5.6zM2.6 4.4h10.8a1.8 1.8 0 0 1 1.8 1.8v5.8a1.8 1.8 0 0 1-1.8 1.8H2.6a1.8 1.8 0 0 1-1.8-1.8V6.2a1.8 1.8 0 0 1 1.8-1.8zM8 6.6a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z", fillRule: "evenodd", clipRule: "evenodd", fill: "currentColor" }) }));
}
