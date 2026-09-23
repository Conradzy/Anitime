
/**
 * SMS delivery through PhilSMS (https://app.philsms.com).
 *
 * The API token is a server secret and must never reach the browser, so this
 * module is server-only and is called from route handlers.
 *
 * Without PHILSMS_API_TOKEN set, nothing is sent: the code is printed to the
 * dev terminal instead, so the whole verification flow can be tested locally.
 */

const API_URL = 'https://app.philsms.com/api/v3/sms/send';
const TOKEN = process.env.PHILSMS_API_TOKEN;
const SENDER_ID = process.env.PHILSMS_SENDER_ID || 'PhilSMS';

export const smsConfigured = Boolean(TOKEN);

export type SmsResult = { delivered: boolean; devCode?: string };

/** Carries PhilSMS's own explanation. Only ever shown to the developer (see
 * the send-otp route); people using the site get a generic message. */
export class SmsError extends Error {
  constructor(public reason: string) {
    super('SMS_SEND_FAILED');
  }
}

export async function sendSms(to: string, message: string, devCode?: string): Promise<SmsResult> {
  if (!TOKEN) {
    // Development fallback. Never reached once a token is configured.
    console.warn(`[philsms] no PHILSMS_API_TOKEN — not sending. to=${to} message=${message}`);
    return { delivered: false, devCode };
  }

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      // PhilSMS takes the number as 639XXXXXXXXX, without the leading "+".
      recipient: to.replace(/^\+/, ''),
      sender_id: SENDER_ID,
      type: 'plain',
      message,
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    // The body can echo the recipient, so log the status and a short excerpt
    // only — never the message, which contains the code.
    console.error(`[philsms] send failed: ${res.status} ${body.slice(0, 200)}`);
    throw new SmsError(`PhilSMS answered HTTP ${res.status}.`);
  }

  // PhilSMS answers 200 with {status:"error"} for problems like an
  // unapproved sender id or no credit, so the body has to be checked too.
  try {
    const json = JSON.parse(body) as { status?: string; message?: string };
    if (json.status && json.status.toLowerCase() === 'error') {
      const why = json.message ?? body.slice(0, 200);
      console.error(`[philsms] rejected: ${why}`);
      throw new SmsError(`PhilSMS said: ${why}`);
    }
  } catch (e) {
    if (e instanceof SmsError) throw e;
    // A non-JSON 200 is unusual but not fatal.
  }

  return { delivered: true };
}

export function otpMessage(code: string): string {
  return `${code} is your AniTime verification code. It expires in 10 minutes. Never share this code with anyone.`;
}
