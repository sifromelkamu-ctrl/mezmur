import { Router } from "express";
import { prisma } from "../prisma.js";

const router = Router();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Renders the public landing page a shared mezmur-api link actually opens to
// (as opposed to the broken capacitor://localhost link the app used to
// share, which only ever meant something inside the app's own WebView).
// Real Open Graph tags so Messages/WhatsApp/etc. show a proper rich
// preview (name + photo), and on load it immediately attempts
// mezmur://<path> — the custom URL scheme registered in
// ios/App/App/Info.plist and android/.../AndroidManifest.xml, picked up by
// App.tsx's appUrlOpen listener — to jump straight into the app if it's
// already installed. The page underneath is what a visitor without the app
// actually sees, since nothing changes for them when that attempt silently
// does nothing.
//
// No real App Store/Play Store listing exists yet (this build is still
// ad-hoc/developer-signed, installed directly via Xcode) — rather than
// link to a URL that doesn't exist, the "don't have the app" section says
// so plainly. Swap storeUrl in once a real listing exists; everything else
// here already works.
function renderSharePage(opts: {
  title: string;
  description: string;
  imageUrl: string | null;
  deepLinkPath: string;
  pageUrl: string;
}): string {
  const { title, description, imageUrl, deepLinkPath, pageUrl } = opts;
  const storeUrl: string | null = null;
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const deepLink = `mezmur://${deepLinkPath.replace(/^\/+/, "")}`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeTitle} — Mezmur</title>
<meta property="og:title" content="${safeTitle}" />
<meta property="og:description" content="${safeDescription}" />
<meta property="og:url" content="${escapeHtml(pageUrl)}" />
<meta property="og:type" content="profile" />
${imageUrl ? `<meta property="og:image" content="${escapeHtml(imageUrl)}" />` : ""}
<meta name="twitter:card" content="${imageUrl ? "summary_large_image" : "summary"}" />
<meta name="twitter:title" content="${safeTitle}" />
<meta name="twitter:description" content="${safeDescription}" />
${imageUrl ? `<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />` : ""}
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.25rem;
    padding: 2rem 1.5rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
    text-align: center;
    background: #ece7dc;
    color: #1a1a1a;
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1a1a1a; color: #ece7dc; }
  }
  img.cover {
    width: 160px;
    height: 160px;
    border-radius: 20px;
    object-fit: cover;
    box-shadow: 0 16px 40px -16px rgba(0,0,0,0.45);
  }
  h1 { font-size: 1.4rem; margin: 0; }
  p.sub { margin: 0; opacity: 0.7; font-size: 0.95rem; max-width: 26rem; }
  a.open-btn {
    display: inline-block;
    margin-top: 0.5rem;
    padding: 0.85rem 2rem;
    border-radius: 999px;
    background: #d4af37;
    color: #111;
    font-weight: 700;
    text-decoration: none;
    font-size: 0.95rem;
  }
  .fallback { margin-top: 2.5rem; font-size: 0.85rem; opacity: 0.6; max-width: 22rem; }
</style>
</head>
<body>
  ${imageUrl ? `<img class="cover" src="${escapeHtml(imageUrl)}" alt="" />` : ""}
  <h1>${safeTitle}</h1>
  ${description ? `<p class="sub">${safeDescription}</p>` : ""}
  <a class="open-btn" href="${deepLink}">Open in Mezmur</a>
  <div class="fallback">
    ${
      storeUrl
        ? `Don't have Mezmur yet? <a href="${escapeHtml(storeUrl)}">Get it here</a>.`
        : "Don't have Mezmur yet? It's not on the App Store yet — ask whoever sent you this link to share the app with you directly."
    }
  </div>
  <script>
    // Best-effort auto-open — most mobile browsers/in-app webviews honor an
    // immediate navigation to a custom scheme the OS has a handler for, and
    // simply no-op (staying on this page) if nothing does. The visible
    // "Open in Mezmur" button above covers browsers that block this.
    window.location.href = ${JSON.stringify(deepLink)};
  </script>
</body>
</html>`;
}

router.get("/artist/:id", async (req, res) => {
  const artist = await prisma.artist.findUnique({
    where: { id: req.params.id },
    select: { id: true, name: true, bio: true, photoUrl: true },
  });
  if (!artist) {
    res.status(404).send(
      renderSharePage({
        title: "Artist not found",
        description: "This artist may have been removed.",
        imageUrl: null,
        deepLinkPath: "/",
        pageUrl: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
      })
    );
    return;
  }
  res.send(
    renderSharePage({
      title: artist.name,
      description: artist.bio?.trim() || "Listen on Mezmur.",
      imageUrl: artist.photoUrl,
      deepLinkPath: `/artist/${artist.id}`,
      pageUrl: `${req.protocol}://${req.get("host")}${req.originalUrl}`,
    })
  );
});

export default router;
