import { Router } from 'express';
import type { Response } from 'express';
import { authMiddleware, adminMiddleware } from '../middleware.js';
import type { AuthRequest } from '../middleware.js';
import { User } from '../models/User.js';
import { sendEmail } from '../services/emailService.js';

const router = Router();

// Admin-only: send email to specific recipients or to all active users.
router.post('/send', authMiddleware, adminMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { from, to, subject, text, html, sendToAllUsers } = req.body as {
      from?: string;
      to?: string | string[];
      subject?: string;
      text?: string;
      html?: string;
      sendToAllUsers?: boolean;
    };

    const finalFrom = process.env.MAIL_FROM;
    if (!finalFrom) return res.status(400).json({ error: 'Missing MAIL_FROM (configure a verified SendGrid sender)' });
    if (!subject) return res.status(400).json({ error: 'Missing subject' });
    if (!text && !html) return res.status(400).json({ error: 'Missing email content' });

    let recipients: string[] = [];
    if (sendToAllUsers) {
      const users = await User.find({ is_active: true }).select('email').sort({ created_at: 1 });
      recipients = users.map((u: any) => u.email).filter(Boolean);
    } else {
      if (!to) return res.status(400).json({ error: 'Missing to' });
      recipients = Array.isArray(to) ? to : String(to).split(',').map((x) => x.trim()).filter(Boolean);
    }

    if (recipients.length === 0) return res.status(400).json({ error: 'No recipients' });

    const info = await sendEmail({
      from: finalFrom,
      replyTo: from?.trim() || undefined,
      to: recipients,
      subject,
      text,
      html,
    });

    return res.json({
      message: 'Sent',
      provider: 'sendgrid',
      info,
      to: recipients,
    });
  } catch (error: any) {
    console.error('Mail send error:', error);
    return res.status(500).json({ error: error.message || 'Failed to send mail' });
  }
});

export default router;

