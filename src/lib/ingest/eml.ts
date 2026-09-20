/**
 * A small .eml reader. The pack's messages are plain RFC 5322 with one optional
 * multipart boundary, so a focused reader beats a general MIME library here and
 * keeps the attachment placeholders the pack uses ("[ATTACHMENT: see ...]") intact.
 */

import type { RawEmail } from "./types";

export function parseEml(filename: string, content: string): RawEmail {
  const normalised = content.replace(/\r\n/g, "\n");
  const split = normalised.indexOf("\n\n");
  const headerBlock = split === -1 ? normalised : normalised.slice(0, split);
  const bodyBlock = split === -1 ? "" : normalised.slice(split + 2);

  const headers = readHeaders(headerBlock);
  const boundary = headers["content-type"]?.match(/boundary="?([^";]+)"?/i)?.[1];

  let body = bodyBlock;
  const attachments: { filename: string; path?: string }[] = [];

  if (boundary) {
    const parts = bodyBlock.split(`--${boundary}`).filter((p) => p.trim() && p.trim() !== "--");
    const textParts: string[] = [];
    for (const part of parts) {
      const partSplit = part.indexOf("\n\n");
      const partHeaders = readHeaders(partSplit === -1 ? part : part.slice(0, partSplit));
      const partBody = partSplit === -1 ? "" : part.slice(partSplit + 2);
      const disposition = partHeaders["content-disposition"] ?? "";
      const contentType = partHeaders["content-type"] ?? "";

      if (/attachment/i.test(disposition)) {
        const name =
          disposition.match(/filename="?([^";]+)"?/i)?.[1] ??
          contentType.match(/name="?([^";]+)"?/i)?.[1] ??
          "attachment";
        const packPath = partBody.match(/\[ATTACHMENT:\s*see\s+([^\]\s]+)/i)?.[1];
        attachments.push({ filename: name, path: packPath });
      } else if (/text\/plain/i.test(contentType) || !contentType) {
        textParts.push(partBody.trim());
      }
    }
    body = textParts.join("\n\n");
  }

  return {
    filename,
    from: headers["from"] ?? "",
    to: headers["to"] ?? "",
    subject: headers["subject"] ?? "",
    date: headers["date"] ?? "",
    messageId: headers["message-id"] ?? "",
    body: body.trim(),
    attachments,
  };
}

function readHeaders(block: string): Record<string, string> {
  const headers: Record<string, string> = {};
  let currentKey = "";
  for (const rawLine of block.split("\n")) {
    if (/^\s/.test(rawLine) && currentKey) {
      headers[currentKey] += " " + rawLine.trim(); // folded header
      continue;
    }
    const idx = rawLine.indexOf(":");
    if (idx === -1) continue;
    currentKey = rawLine.slice(0, idx).trim().toLowerCase();
    headers[currentKey] = rawLine.slice(idx + 1).trim();
  }
  return headers;
}
