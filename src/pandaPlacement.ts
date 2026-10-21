// Where the editor panda and its bubble go, as CSS. Pure functions, so they
// can be tested without VS Code.

export const SIZE_PX = 64;


export interface Placement {
  /** How many character cells right of this line's text end the panda's box starts. */
  offsetCh: number;
  /** Width of this line's text, in cells: the distance back to column 0. */
  lineCh: number;
  /** Bubble above the panda, or below it when the line is near the top of the screen. */
  bubbleBelow: boolean;
}

/** Visual width of a line in character cells, with tabs expanded. */
export function visualWidth(text: string, tabSize: number): number {
  let w = 0;
  for (const ch of text.replace(/\s+$/, "")) w = ch === "\t" ? w + tabSize - (w % tabSize) : w + 1;
  return w;
}

/**
 * Put the panda two cells right of the longest nearby line, so it never sits
 * on top of code, and keep the column steady while it walks through a region.
 */
export function placePanda(lines: string[], line: number, visibleTop: number, tabSize: number): Placement {
  const from = Math.max(0, line - 3);
  const to = Math.min(lines.length - 1, line + 2);
  let widest = 0;
  for (let i = from; i <= to; i++) widest = Math.max(widest, visualWidth(lines[i], tabSize));
  const column = Math.min(widest + 2, 120);
  const lineCh = visualWidth(lines[line] ?? "", tabSize);
  return { offsetCh: Math.max(1, column - lineCh), lineCh, bubbleBelow: line - visibleTop < 4 };
}

/** CSS for the panda box. Injected through `textDecoration`, which VS Code copies into a style rule. */
export function pandaCss(spriteUrl: string, offsetCh: number): string {
  return [
    "none",
    "position: absolute",
    `margin-left: ${offsetCh}ch`,
    `top: -${SIZE_PX - 20}px`,
    `width: ${SIZE_PX}px`,
    `height: ${SIZE_PX}px`,
    `background: url("${spriteUrl}") center / contain no-repeat`,
    "pointer-events: none",
    "z-index: 20",
  ].join("; ");
}

const BUBBLE_W = 250;

export function bubbleCss(place: Placement): string {
  return [
    "none",
    "position: absolute",
    // The bubble's right edge sits just past the panda's middle and it extends left, over the
    // code above (or below) the line, but never past column 0.
    `margin-left: max(calc(${place.offsetCh}ch - ${BUBBLE_W - SIZE_PX / 2 - 12}px), -${place.lineCh}ch)`,
    place.bubbleBelow ? `top: ${SIZE_PX - 12}px` : `bottom: ${SIZE_PX + 2}px`,
    `width: ${BUBBLE_W}px`,
    "box-sizing: border-box",
    "white-space: normal",
    "line-height: 1.45",
    "padding: 7px 11px",
    "border-radius: 12px",
    "background: var(--vscode-editorHoverWidget-background)",
    "color: var(--vscode-editorHoverWidget-foreground)",
    "border: 1px solid var(--vscode-editorHoverWidget-border)",
    "box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35)",
    "font-family: var(--vscode-font-family)",
    "font-size: 12px",
    "font-style: normal",
    "font-weight: normal",
    "pointer-events: none",
    "z-index: 21",
  ].join("; ");
}

