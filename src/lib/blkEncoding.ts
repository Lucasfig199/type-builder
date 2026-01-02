/**
 * BLK Column Encoding/Decoding for Notes
 *
 * Format (v1): {"v":1,"n":[["NOTE:<id>",x,y,w,h,fs,"tc","bg",b,i,"texto"]]}
 *
 * - No URL encoding. Text is stored as-is (JSON.stringify will escape correctly).
 * - Each note entry is self-sufficient: id, position, size, style, and text.
 */

import type { FlowNode, NoteData } from "@/types/workflow";

export interface BlkV1 {
  v: 1;
  n: BlkNoteEntry[];
}

// Note entry: [id, x, y, w, h, fs, tc, bg, b, i, texto]
export type BlkNoteEntry = [
  string, // id: MUST start with NOTE:
  number, // x
  number, // y
  number, // w
  number, // h
  number, // fontSize
  string, // textColor
  string, // bgColor
  0 | 1, // bold
  0 | 1, // italic
  string, // texto
];

export interface ParsedBlkNote {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  noteData: NoteData;
}

const DEFAULT_BG_COLOR = "#1e3a5f";
const DEFAULT_TEXT_COLOR = "#ffffff";

function withNotePrefix(id: string): string {
  return id.startsWith("NOTE:") ? id : `NOTE:${id}`;
}

function htmlToPlainTextPreserveNewlines(html: string): string {
  // Preserve <br> as newlines, then strip remaining tags.
  return html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function textToSafeHtml(text: string): string {
  // Render multiline text safely inside dangerouslySetInnerHTML
  return escapeHtml(text).replace(/\n/g, "<br />");
}

/**
 * Encode note nodes into BLK JSON string (minified)
 * Returns null if no non-empty notes exist.
 */
export function encodeBlk(nodes: FlowNode[]): string | null {
  const noteNodes = nodes.filter((n) => n.type === "note");

  const validNotes = noteNodes.filter((n) => {
    const noteData = n.data.note;
    const hasText = (noteData?.textPreview ?? "").trim();
    const hasHtml = (noteData?.html ?? "").trim();
    return Boolean(hasText || hasHtml);
  });

  if (validNotes.length === 0) return null;

  const entries: BlkNoteEntry[] = validNotes.map((node) => {
    const noteData = node.data.note || {};
    const style = noteData.style || {};

    // Content: prefer textPreview; fallback to html -> plain text
    const texto =
      (noteData.textPreview ?? "").trimEnd() ||
      (noteData.html ? htmlToPlainTextPreserveNewlines(noteData.html) : "");

    // Flags: rely on existing formatting detection (minimal change)
    const hasBold =
      noteData.html?.includes("<b>") || noteData.html?.includes("<strong>") ? 1 : 0;
    const hasItalic =
      noteData.html?.includes("<i>") || noteData.html?.includes("<em>") ? 1 : 0;

    return [
      withNotePrefix(node.id),
      Math.round(node.position.x),
      Math.round(node.position.y),
      node.width || 280,
      node.height || 180,
      style.fontSize || 14,
      style.textColor || DEFAULT_TEXT_COLOR,
      style.bgColor || DEFAULT_BG_COLOR,
      hasBold as 0 | 1,
      hasItalic as 0 | 1,
      texto,
    ];
  });

  return JSON.stringify({ v: 1, n: entries } satisfies BlkV1);
}

/**
 * Decode BLK JSON string into ParsedBlkNote[]
 * Robust: returns [] on any invalid/corrupted input.
 */
export function decodeBlk(blk: string | null | undefined): ParsedBlkNote[] {
  if (!blk || typeof blk !== "string") return [];
  const trimmed = blk.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed) as Partial<BlkV1>;

    if (parsed.v !== 1 || !Array.isArray(parsed.n)) return [];

    return parsed.n
      .filter((entry): entry is BlkNoteEntry => Array.isArray(entry) && entry.length >= 11)
      .filter((entry) => typeof entry[0] === "string" && entry[0].startsWith("NOTE:"))
      .map((entry) => {
        const [id, x, y, w, h, fs, tc, bg, b, i, texto] = entry;
        const plainText = typeof texto === "string" ? texto : "";

        // Rebuild safe HTML for preview/rendering
        let html = textToSafeHtml(plainText);
        if (b === 1) html = `<strong>${html}</strong>`;
        if (i === 1) html = `<em>${html}</em>`;

        const noteData: NoteData = {
          title: "",
          html,
          textPreview: plainText,
          style: {
            fontSize: typeof fs === "number" ? fs : 14,
            textColor: typeof tc === "string" ? tc : DEFAULT_TEXT_COLOR,
            bgColor: typeof bg === "string" ? bg : DEFAULT_BG_COLOR,
          },
        };

        return {
          id,
          x: typeof x === "number" ? x : 0,
          y: typeof y === "number" ? y : 0,
          width: typeof w === "number" ? w : 280,
          height: typeof h === "number" ? h : 180,
          noteData,
        };
      });
  } catch (e) {
    console.warn("Failed to parse BLK column:", e);
    return [];
  }
}

/** Convert parsed BLK notes into FlowNode array */
export function blkNotesToFlowNodes(notes: ParsedBlkNote[]): FlowNode[] {
  return notes.map((note) => ({
    id: note.id,
    type: "note" as const,
    position: { x: note.x, y: note.y },
    width: note.width,
    height: note.height,
    data: {
      label: "Bloco de Notas",
      note: note.noteData,
    },
  }));
}

