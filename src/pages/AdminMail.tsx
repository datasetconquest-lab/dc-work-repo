import { useState } from 'react';
import { Layout } from '../components/Layout';
import { Send, Mail } from 'lucide-react';
import { API_BASE_URL } from '../lib/api';
import { getStoredAuth } from '../lib/authStorage';

export function AdminMail() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const [sendToAll, setSendToAll] = useState(true);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const handleSend = async () => {
    setSending(true);
    setStatus(null);
    try {
      const token = getStoredAuth()?.token;
      if (!token) {
        throw new Error('No token provided');
      }

      const res = await fetch(
        `${API_BASE_URL}/admin/mail/send`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            from: from.trim() || undefined,
            to: sendToAll ? undefined : to,
            subject,
            text,
            sendToAllUsers: sendToAll,
          }),
        }
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to send');
      const recipientCount = Array.isArray(body.to) ? body.to.length : 0;
      setStatus(`Sent to ${recipientCount} recipient${recipientCount === 1 ? '' : 's'} via ${body.provider || 'email'}.`);
    } catch (e: any) {
      setStatus(e.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  return (
    <Layout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Mail</h1>
          <p className="text-gray-600 dark:text-gray-300 mt-1">Send announcements via SendGrid Email API</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={sendToAll}
              onChange={(e) => setSendToAll(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-gray-700 dark:text-gray-200">Send to all active users</span>
          </label>

          {!sendToAll && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">To</label>
              <input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="comma-separated emails"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Reply-To (optional)</label>
            <input
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder='Replies will go here (MAIL_FROM is used for sending)'
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Message</label>
            <textarea
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <button
            onClick={handleSend}
            disabled={sending || !subject.trim() || !text.trim() || (!sendToAll && !to.trim())}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{sending ? 'Sending…' : 'Send Mail'}</span>
          </button>

          {status && (
            <div className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700/50 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <Mail className="w-4 h-4 mt-0.5 text-gray-500 dark:text-gray-400" />
              <p>{status}</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

