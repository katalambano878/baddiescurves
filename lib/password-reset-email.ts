// Password-reset email. Server only: sent from the /auth/v1/recover handler.

import { emailLayout, sendEmail } from '@/lib/notifications';
import { escapeHtml } from '@/lib/sanitize';
import { RECOVERY_TTL_MINUTES } from '@/lib/db/auth';

/**
 * Where the reset link points. NEXT_PUBLIC_APP_URL when set, otherwise the
 * origin the request came in on (as seen through the proxy).
 */
export function siteOrigin(req: Request): string {
    const configured = (process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
    if (configured) return configured;

    const forwardedHost = req.headers.get('x-forwarded-host')?.split(',')[0].trim();
    if (forwardedHost) {
        const proto = req.headers.get('x-forwarded-proto')?.split(',')[0].trim() || 'https';
        return `${proto}://${forwardedHost}`;
    }
    return new URL(req.url).origin;
}

export async function sendPasswordResetEmail(opts: {
    to: string;
    firstName: string | null;
    token: string;
    origin: string;
}): Promise<boolean> {
    const link = `${opts.origin}/auth/reset-password?token=${encodeURIComponent(opts.token)}`;
    const greeting = opts.firstName ? `Hi ${escapeHtml(opts.firstName)},` : 'Hi,';

    const html = emailLayout(
        `
<h2 style="margin:0 0 16px;color:#111827;font-size:22px;">Reset your password</h2>
<p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 12px;">${greeting}</p>
<p style="color:#374151;font-size:14px;line-height:1.7;margin:0 0 12px;">We got a request to reset the password for your BADDIECURVES account. Use the button below to choose a new one. The link works once and expires in ${RECOVERY_TTL_MINUTES} minutes.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto;"><tr>
<td style="background-color:#2563eb;border-radius:8px;"><a href="${link}" target="_blank" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.3px;">Choose a new password</a></td>
</tr></table>
<p style="color:#6b7280;font-size:13px;line-height:1.7;margin:0 0 12px;">If the button does not open, copy this link into your browser:<br><a href="${link}" style="color:#2563eb;word-break:break-all;">${link}</a></p>
<p style="color:#6b7280;font-size:13px;line-height:1.7;margin:0;">If you did not ask for this, you can ignore this email. Your password stays the same.</p>
`,
        'Choose a new password for your BADDIECURVES account'
    );

    const result: any = await sendEmail({
        to: opts.to,
        subject: 'Reset your BADDIECURVES password',
        html,
    });
    // sendEmail returns null when Resend is not configured or throws; Resend
    // itself reports API failures as `{ error }` without throwing.
    return Boolean(result) && !result.error;
}
