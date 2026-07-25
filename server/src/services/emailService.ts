export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
}

export interface SendEmailOptions {
  from: string;
  replyTo?: string;
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
}

export async function sendEmail(options: SendEmailOptions): Promise<any> {
  const apiKey = process.env.SENDGRID_API_KEY;
  if (!apiKey) {
    throw new Error('SENDGRID_API_KEY not configured');
  }

  const { from, replyTo, to, subject, text, html, attachments } = options;

  const content: any[] = [];
  if (text) content.push({ type: 'text/plain', value: text });
  if (html) content.push({ type: 'text/html', value: html });
  if (content.length === 0) {
    content.push({ type: 'text/plain', value: '' });
  }

  const payload: any = {
    personalizations: [{ to: to.map((email) => ({ email })) }],
    from: { email: from },
    subject,
    content,
  };

  if (replyTo) {
    payload.reply_to = { email: replyTo };
  }

  if (attachments && attachments.length > 0) {
    payload.attachments = attachments.map((a) => ({
      filename: a.filename,
      content: typeof a.content === 'string' ? a.content : a.content.toString('base64'),
      disposition: 'attachment',
    }));
  }

  const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  let parsed: any = null;
  if (bodyText) {
    try {
      parsed = JSON.parse(bodyText);
    } catch {
      parsed = { message: bodyText };
    }
  }

  // SendGrid returns 202 Accepted with an empty body for success.
  if (response.status !== 202) {
    const message = parsed?.errors?.[0]?.message || parsed?.message || `Email API error: ${response.statusText}`;
    throw new Error(message);
  }

  return { status: response.status, ok: true };
}

