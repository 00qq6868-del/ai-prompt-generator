// src/app/api/qr/route.ts
// GET /api/qr — returns a QR code PNG of this server's current LAN URL
// The Host header tells us the exact IP:port the user is already using

import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

export async function GET(req: NextRequest) {
  const host     = req.headers.get("host") ?? "localhost:3000";
  const protocol = req.headers.get("x-forwarded-proto") ?? "http";
  const lanUrl   = `${protocol}://${host}`;

  try {
    const pngBuffer = await QRCode.toBuffer(lanUrl, {
      type:  "png",
      width: 300,
      margin: 2,
      color: { dark: "#000000", light: "#FFFFFF" },
      errorCorrectionLevel: "M",
    });

    return new NextResponse(pngBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type":  "image/png",
        "Cache-Control": "no-store", // always fresh — IP may change
      },
    });
  } catch (err: any) {
    console.error("[qr]", err);
    return NextResponse.json({ error: "QR generation failed" }, { status: 500 });
  }
}
