import { NextResponse } from "next/server";

const RELEASES_URL = "https://github.com/00qq6868-del/ai-prompt-generator/releases/latest";
const GITHUB_API_URL = "https://api.github.com/repos/00qq6868-del/ai-prompt-generator/releases/latest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(GITHUB_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "ai-prompt-generator-download-page",
      },
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return NextResponse.redirect(RELEASES_URL, 302);
    }

    const release = await response.json();
    const assets = Array.isArray(release.assets) ? release.assets : [];
    const zip = assets.find((asset: { name?: string; browser_download_url?: string }) => {
      const name = asset.name?.toLowerCase() ?? "";
      return name.endsWith(".zip") && (name.includes("mac") || name.includes("darwin"));
    }) ?? assets.find((asset: { name?: string; browser_download_url?: string }) => {
      const name = asset.name?.toLowerCase() ?? "";
      return name.endsWith(".zip");
    });

    if (zip?.browser_download_url) {
      return NextResponse.redirect(zip.browser_download_url, 302);
    }
  } catch {
    // Fall through to the releases page when GitHub API is temporarily unavailable.
  }

  return NextResponse.redirect(RELEASES_URL, 302);
}
