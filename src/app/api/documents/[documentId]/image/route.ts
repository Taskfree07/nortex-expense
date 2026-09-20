import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/session";
import { db } from "@/lib/db";
import { PACK_DIR } from "@/lib/ingest/pipeline";

/** Serves a bill image out of the pack, for people who are signed in. */
export async function GET(
  _request: Request,
  { params }: RouteContext<"/api/documents/[documentId]/image">,
) {
  const { documentId } = await params;
  await requireActor();

  const doc = await db.document.findUnique({ where: { id: documentId } });
  if (!doc) return NextResponse.json({ error: "No such document" }, { status: 404 });

  // An uploaded bill lives in the row; the pack's bills live beside the app.
  if (doc.fileData) {
    return new NextResponse(new Uint8Array(Buffer.from(doc.fileData, "base64")), {
      headers: {
        "content-type": doc.mimeType ?? "application/octet-stream",
        "cache-control": "private, max-age=3600",
      },
    });
  }

  if (!doc.imagePath) return NextResponse.json({ error: "No image on this document" }, { status: 404 });

  // The stored path is relative to the pack; resolve it and refuse anything outside.
  const resolved = path.resolve(PACK_DIR, doc.imagePath);
  if (!resolved.startsWith(path.resolve(PACK_DIR))) {
    return NextResponse.json({ error: "Bad path" }, { status: 400 });
  }

  try {
    const bytes = await readFile(resolved);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": resolved.endsWith(".png") ? "image/png" : "image/jpeg",
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return NextResponse.json({ error: "The file is not in the pack" }, { status: 404 });
  }
}
