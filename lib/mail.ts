import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

export async function sendVerificationEmail(email: string, code: string) {
  await transporter.sendMail({
    from: `"AniTime" <${process.env.GMAIL_USER}>`,
    to: email,
    subject: `${code} is your AniTime verification code`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 420px;">
        <h2 style="color:#062F24;">Verify your email</h2>
        <p style="color:#4B5C53;">Your AniTime verification code is:</p>
        <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color:#062F24;">${code}</p>
        <p style="color:#6A7A71; font-size: 13px;">This code expires in 10 minutes. If you didn't request this, you can ignore this email.</p>
      </div>
    `,
  });
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function button(href: string, label: string) {
  return `<p><a href="${href}" style="display:inline-block;background:#A7C641;color:#062F24;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:12px;">${label}</a></p>`;
}

/** Tells the AniTime admin a National ID needs a human decision. */
export async function sendIdReviewEmail(to: string, opts: { applicant: string; link: string; reason: string }) {
  await transporter.sendMail({
    from: `"AniTime" <${process.env.GMAIL_USER}>`,
    to,
    subject: `National ID review needed: ${opts.applicant}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px;">
        <h2 style="color:#062F24;">National ID awaiting your review</h2>
        <p style="color:#4B5C53;"><strong>${escapeHtml(opts.applicant)}</strong> submitted a Philippine National ID for AniTime seller verification.</p>
        <p style="color:#4B5C53;">${escapeHtml(opts.reason)}</p>
        <p style="color:#4B5C53;">Open the page below to see the front and back of the ID and confirm or reject it.</p>
        ${button(opts.link, 'Review the ID')}
        <p style="color:#6A7A71; font-size: 12px;">Anyone with this link can decide this one review, so please don't forward it.</p>
      </div>`,
  });
}

/** Asks the account owner to confirm a password change. */
export async function sendPasswordChangeEmail(to: string, opts: { name: string; link: string }) {
  await transporter.sendMail({
    from: `"AniTime" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Confirm your AniTime password change',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 460px;">
        <h2 style="color:#062F24;">Confirm your new password</h2>
        <p style="color:#4B5C53;">Hi ${escapeHtml(opts.name)}, someone asked to change the password on your AniTime account. Your password stays the same until you confirm.</p>
        ${button(opts.link, 'Yes, change my password')}
        <p style="color:#6A7A71; font-size: 13px;">This link expires in 30 minutes. If you didn't ask for this, ignore this email and your password will not change.</p>
      </div>`,
  });
}
