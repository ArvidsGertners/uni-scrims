// HTML version of the account mails (ARCHITECTURE §5.8), the template of
// docs/design_handoff_emails as it is: tables, inline styles and Outlook comments, because mail
// clients understand little else. One addition: on phones the button table takes the full width,
// so the button does as the handoff asks. The plain text stays part of the mail (lib/mail.ts).
import type { Locale } from "@uni-scrims/core/config/locale";
import { accountMailMessages } from "../i18n/mail.ts";
import { mainBaseURL } from "./admin-url.ts";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

// After the preheader, so inbox previews don't go on with the heading (the subject once more).
const PREHEADER_FILL = "&zwnj;&nbsp;".repeat(90);

/** Every value goes into the template escaped, the link above all. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

export type AccountMailParts = {
  locale: Locale;
  /** The subject, as the document title and the heading. */
  title: string;
  /** Hidden; the line mail clients show next to the subject. */
  preheader: string;
  lead: string;
  cta: string;
  url: string;
  validity: string;
  ignore: string;
};

/** The whole HTML document of an account mail; logo and footer links point to BETTER_AUTH_URL. */
export function accountMailHtml(parts: AccountMailParts): string {
  const t = accountMailMessages[parts.locale].html;
  const base = mainBaseURL().origin;
  const e = {
    lang: escapeHtml(parts.locale),
    title: escapeHtml(parts.title),
    preheader: escapeHtml(parts.preheader),
    lead: escapeHtml(parts.lead),
    cta: escapeHtml(parts.cta),
    url: escapeHtml(parts.url),
    validity: escapeHtml(parts.validity),
    ignore: escapeHtml(parts.ignore),
    hello: escapeHtml(t.hello),
    fallback: escapeHtml(t.fallback),
    tagline: escapeHtml(t.tagline),
    impressum: escapeHtml(t.impressum),
    privacy: escapeHtml(t.privacy),
    support: escapeHtml(t.support),
    logo: escapeHtml(`${base}/brand/uniscrims-avatar-512.png`),
    impressumUrl: escapeHtml(`${base}/impressum`),
    privacyUrl: escapeHtml(`${base}/datenschutz`),
    supportUrl: escapeHtml(`${base}/support`),
  };
  return `<!DOCTYPE html>
<html lang="${e.lang}" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${e.title}</title>
<!--[if mso]><style>table,td,a,span,p{font-family:Arial,sans-serif!important}</style><![endif]-->
<style>
@media (max-width:620px){.us-pad{padding-left:24px!important;padding-right:24px!important}.us-h1{font-size:26px!important;line-height:32px!important}.us-btn{width:100%!important}.us-btn a{display:block!important}}
</style>
</head>
<body style="margin:0;padding:0;background-color:#0E1116;">
<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;max-height:0;max-width:0;overflow:hidden;mso-hide:all;">${e.preheader}${PREHEADER_FILL}</span>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="#0E1116" style="background-color:#0E1116;">
<tr><td align="center" style="padding:40px 12px;">
<!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:600px;width:100%;">
<tr><td class="us-pad" style="padding:0 40px 24px 40px;">
<img src="${e.logo}" width="40" height="40" alt="Uni Scrims" style="display:block;border:0;outline:none;width:40px;height:40px;border-radius:8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#F2F4F7;">
</td></tr>
<tr><td bgcolor="#141820" style="background-color:#141820;border:1px solid #262C36;border-radius:12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
<tr><td class="us-pad" style="padding:40px 40px 0 40px;font-family:'Space Grotesk',Arial,Helvetica,sans-serif;">
<h1 class="us-h1" style="margin:0;font-size:30px;line-height:36px;mso-line-height-rule:exactly;font-weight:bold;letter-spacing:-0.5px;color:#F2F4F7;">${e.title}</h1>
</td></tr>
<tr><td class="us-pad" style="padding:16px 40px 0 40px;font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:16px;line-height:24px;mso-line-height-rule:exactly;color:#C3C8D1;">
<p style="margin:0 0 12px 0;">${e.hello}</p>
<p style="margin:0;">${e.lead}</p>
</td></tr>
<tr><td class="us-pad" style="padding:28px 40px 0 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="us-btn">
<tr><td bgcolor="#3D7BFF" style="background-color:#3D7BFF;border-radius:8px;mso-padding-alt:16px 28px;">
<a href="${e.url}" target="_blank" style="display:inline-block;padding:16px 28px;font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:17px;line-height:20px;mso-line-height-rule:exactly;font-weight:bold;color:#0E1116;text-decoration:none;border-radius:8px;text-align:center;">${e.cta}</a>
</td></tr>
</table>
</td></tr>
<tr><td class="us-pad" style="padding:24px 40px 0 40px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0">
<tr><td bgcolor="#1A1F27" style="background-color:#1A1F27;border-radius:999px;padding:5px 12px;font-family:'Courier New',Courier,monospace;font-size:13px;line-height:16px;mso-line-height-rule:exactly;font-weight:bold;color:#F5B84B;">&#9679;&nbsp;${e.validity}</td></tr>
</table>
</td></tr>
<tr><td class="us-pad" style="padding:28px 40px 0 40px;"><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td height="1" style="height:1px;line-height:1px;font-size:1px;background-color:#262C36;">&nbsp;</td></tr></table></td></tr>
<tr><td class="us-pad" style="padding:20px 40px 0 40px;font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#8B93A1;">
${e.fallback}<br>
<a href="${e.url}" target="_blank" style="color:#5A8FFF;text-decoration:underline;word-break:break-all;font-family:'Courier New',Courier,monospace;font-size:13px;">${e.url}</a>
</td></tr>
<tr><td class="us-pad" style="padding:16px 40px 40px 40px;font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#8B93A1;">${e.ignore}</td></tr>
</table>
</td></tr>
<tr><td class="us-pad" style="padding:24px 40px 0 40px;font-family:'Space Grotesk',Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;mso-line-height-rule:exactly;color:#8B93A1;">
${e.tagline}<br>
<a href="${e.impressumUrl}" target="_blank" style="color:#8B93A1;text-decoration:underline;">${e.impressum}</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${e.privacyUrl}" target="_blank" style="color:#8B93A1;text-decoration:underline;">${e.privacy}</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${e.supportUrl}" target="_blank" style="color:#8B93A1;text-decoration:underline;">${e.support}</a>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}
