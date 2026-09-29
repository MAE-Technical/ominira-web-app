import { PLATFORM_NAME, PLATFORM_URL } from "@/lib/config/platform";
import { APP_ICON } from "@/lib/config/brand-assets";

export const ANNOUNCEMENT_FROM_ADDRESS = "cadres@projectominira.org";
export const ANNOUNCEMENT_FROM = `${PLATFORM_NAME} <${ANNOUNCEMENT_FROM_ADDRESS}>`;

const BRAND = "#be400d"; // --color-brand-500

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** In-app paths become absolute — an email has no origin to resolve against. */
export const absoluteUrl = (url: string) => (url.startsWith("/") ? `${PLATFORM_URL}${url}` : url);

/**
 * One announcement, rendered for one recipient (only the unsubscribe link
 * differs). Table layout + inline styles: what email clients reliably render.
 * Blank lines in the body become paragraphs; no `url` means no button.
 */
export function renderAnnouncement({
  title,
  body,
  url,
  unsubscribeUrl,
}: {
  title: string;
  body: string;
  url: string;
  unsubscribeUrl: string;
}): { html: string; text: string } {
  const button = url
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="background:${BRAND};border-radius:6px">
<a href="${escapeHtml(absoluteUrl(url))}" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none">Open in ${escapeHtml(PLATFORM_NAME)}</a>
</td></tr></table>`
    : `<div style="height:8px"></div>`;
  const paragraphs = body
    .trim()
    .split(/\n\s*\n/)
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2b2622">${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`
    )
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f6f3ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
<span style="display:none;max-height:0;overflow:hidden">${escapeHtml(body.trim().slice(0, 140))}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f3ef;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:8px;border:1px solid #e8e2da">
<tr><td style="padding:28px 32px 0">
<img src="${PLATFORM_URL}${APP_ICON}" width="36" height="36" alt="${escapeHtml(PLATFORM_NAME)}" style="display:block;border-radius:8px">
</td></tr>
<tr><td style="padding:20px 32px 8px">
<h1 style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:24px;line-height:1.3;color:#1c1917">${escapeHtml(title)}</h1>
${paragraphs}
${button}
</td></tr>
</table>
<p style="max-width:560px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#8a817a;text-align:center">
You're getting this because you turned on email announcements in your ${escapeHtml(PLATFORM_NAME)} account settings.<br>
<a href="${escapeHtml(unsubscribeUrl)}" style="color:#8a817a">Unsubscribe</a>
</p>
</td></tr>
</table>
</body>
</html>`;

  const link = url ? `\n\nOpen in ${PLATFORM_NAME}: ${absoluteUrl(url)}` : "";
  const text = `${title}\n\n${body.trim()}${link}\n\n—\nYou're getting this because you turned on email announcements in your ${PLATFORM_NAME} account settings.\nUnsubscribe: ${unsubscribeUrl}\n`;

  return { html, text };
}
