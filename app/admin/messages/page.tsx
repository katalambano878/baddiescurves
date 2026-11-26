'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

/**
 * Everything customers send through the site: contact messages, return
 * requests and newsletter sign-ups. They are all saved in contact_submissions.
 */

type Message = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  subject: string | null;
  message: string | null;
  created_at: string;
};

type Kind = 'return' | 'newsletter' | 'message';

function kindOf(m: Message): Kind {
  const subject = (m.subject || '').toLowerCase();
  if (subject.startsWith('return request')) return 'return';
  if (subject.startsWith('newsletter')) return 'newsletter';
  return 'message';
}

const KIND_LABEL: Record<Kind, string> = {
  return: 'Return request',
  newsletter: 'Newsletter sign-up',
  message: 'Message',
};

const KIND_STYLE: Record<Kind, string> = {
  return: 'bg-amber-100 text-amber-800',
  newsletter: 'bg-blue-100 text-blue-800',
  message: 'bg-gray-100 text-gray-700',
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  // Stop a spreadsheet from treating customer text as a formula.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export default function AdminMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Kind>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const { data, error } = await supabase
      .from('contact_submissions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) setLoadError(error.message || 'The messages did not load.');
    else setMessages((data || []) as Message[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  const counts = useMemo(() => {
    const out = { all: messages.length, return: 0, newsletter: 0, message: 0 };
    for (const m of messages) out[kindOf(m)] += 1;
    return out;
  }, [messages]);

  const shown = filter === 'all' ? messages : messages.filter((m) => kindOf(m) === filter);

  const remove = async (m: Message) => {
    if (!confirm(`Delete this ${KIND_LABEL[kindOf(m)].toLowerCase()} from ${m.email || m.name || 'this person'}? This cannot be undone.`)) {
      return;
    }
    setBusyId(m.id);
    const { error } = await supabase.from('contact_submissions').delete().eq('id', m.id);
    setBusyId(null);
    if (error) {
      setNotice({ text: `Could not delete it: ${error.message}`, ok: false });
      return;
    }
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    setNotice({ text: 'Deleted.', ok: true });
  };

  const exportCsv = () => {
    const header = ['Date', 'Type', 'Name', 'Email', 'Phone', 'Subject', 'Message'];
    const rows = shown.map((m) =>
      [fmtDate(m.created_at), KIND_LABEL[kindOf(m)], m.name, m.email, m.phone, m.subject, m.message].map(csvCell).join(',')
    );
    const blob = new Blob(['﻿' + [header.map(csvCell).join(','), ...rows].join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `messages-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const tabs: { key: 'all' | Kind; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'message', label: 'Messages' },
    { key: 'return', label: 'Return requests' },
    { key: 'newsletter', label: 'Newsletter sign-ups' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Messages</h1>
          <p className="text-gray-600 mt-1">
            Contact messages, return requests and newsletter sign-ups from the website.
          </p>
        </div>
        {shown.length > 0 && (
          <button
            onClick={exportCsv}
            className="px-4 py-2.5 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 inline-flex items-center gap-2 self-start sm:self-auto"
          >
            <i className="ri-download-2-line" aria-hidden="true"></i>
            Export these
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Show">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setFilter(tab.key)}
            aria-pressed={filter === tab.key}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border ${
              filter === tab.key
                ? 'bg-blue-700 border-blue-700 text-white'
                : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {tab.label} <span className="tabular-nums font-normal">({counts[tab.key]})</span>
          </button>
        ))}
      </div>

      {notice && (
        <div
          role="status"
          className={`rounded-lg px-4 py-3 text-sm border ${
            notice.ok ? 'bg-green-50 text-green-800 border-green-200' : 'bg-red-50 text-red-800 border-red-200'
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-12 text-center text-gray-600">
            <i className="ri-loader-4-line text-3xl animate-spin block mb-2" aria-hidden="true"></i>
            Loading messages…
          </div>
        ) : loadError ? (
          <div className="p-12 text-center">
            <p className="font-medium text-gray-900">The messages did not load.</p>
            <p className="text-sm text-gray-600 mt-1">{loadError}</p>
            <button onClick={load} className="mt-4 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold">
              Try again
            </button>
          </div>
        ) : messages.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-medium text-gray-900">Nothing here yet</p>
            <p className="text-sm text-gray-600 mt-1 max-w-md mx-auto">
              When a customer uses the contact form, asks for a return or joins the newsletter, it shows up here.
            </p>
          </div>
        ) : shown.length === 0 ? (
          <div className="p-12 text-center text-gray-600">None of this kind yet.</div>
        ) : (
          <ul className="divide-y divide-gray-100">
            {shown.map((m) => {
              const kind = kindOf(m);
              const replySubject = encodeURIComponent(`Re: ${m.subject || 'Your message to BADDIECURVES'}`);
              return (
                <li key={m.id} className="p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${KIND_STYLE[kind]}`}>{KIND_LABEL[kind]}</span>
                        <span className="text-xs text-gray-600">{fmtDate(m.created_at)}</span>
                      </div>
                      <p className="mt-1.5 font-semibold text-gray-900 break-words">{m.subject || 'No subject'}</p>
                      <p className="text-sm text-gray-700 break-words">
                        {m.name || 'No name'}
                        {m.email && (
                          <>
                            {' · '}
                            <a href={`mailto:${m.email}`} className="text-blue-700 hover:underline">{m.email}</a>
                          </>
                        )}
                        {m.phone && (
                          <>
                            {' · '}
                            <a href={`tel:${m.phone}`} className="text-blue-700 hover:underline">{m.phone}</a>
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {m.email && (
                        <a
                          href={`mailto:${m.email}?subject=${replySubject}`}
                          className="px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50"
                        >
                          Reply by email
                        </a>
                      )}
                      <button
                        onClick={() => remove(m)}
                        disabled={busyId === m.id}
                        className="px-3 py-1.5 text-red-700 hover:bg-red-50 rounded-lg text-xs font-medium disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  {m.message && kind !== 'newsletter' && (
                    <p className="mt-3 text-sm text-gray-800 whitespace-pre-wrap break-words max-w-[75ch]">{m.message}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
