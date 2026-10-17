import { z } from 'zod';
import { db } from '../db';
import { decrypt, encrypt } from '../crypto';
import { sendCafeEmail } from '../mail';

export const REPORT_REASONS = ['harassment', 'spam', 'scam', 'underage_concern', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** These reasons alert the admins straight away and sort to the top of the list. */
export const URGENT_REASONS: readonly ReportReason[] = ['harassment', 'underage_concern'];

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harassment',
  spam: 'Spam',
  scam: 'Scam or money request',
  underage_concern: 'May be under 18',
  other: 'Other',
};

export const MAX_ATTACHED_LINES = 30;
const MAX_LINE_CHARS = 2000;

export function isUrgentReason(reason: string) {
  return (URGENT_REASONS as readonly string[]).includes(reason);
}

/** One line the reporter picked from their own screen. */
export const attachedLineSchema = z.object({
  mine: z.boolean(),
  text: z.string().transform((s) => s.trim().slice(0, MAX_LINE_CHARS)),
  translation: z
    .string()
    .nullish()
    .transform((s) => (s ? s.trim().slice(0, MAX_LINE_CHARS) : null)),
  at: z.string().max(40).nullish().transform((s) => s ?? null),
});
export type AttachedLine = z.output<typeof attachedLineSchema>;

/** Drops empty lines and keeps the newest ones if someone sends too many. */
export function normalizeAttachedLines(lines: AttachedLine[] | undefined): AttachedLine[] {
  return (lines ?? []).filter((line) => line.text.length > 0).slice(-MAX_ATTACHED_LINES);
}

function readLines(stored: string): AttachedLine[] {
  const plain = decrypt(stored);
  if (!plain) return [];
  try {
    const parsed = z.array(attachedLineSchema).safeParse(JSON.parse(plain));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function appOrigin() {
  return new URL(process.env.APP_URL || 'https://culturalcafe.online').origin;
}

/** Where urgent-report alerts go: every admin account, plus REPORT_ALERT_EMAIL (comma-separated). */
export async function reportAlertRecipients() {
  const admins = await db.user.findMany({ where: { role: 'ADMIN', synthetic: false }, select: { email: true } });
  const extra = (process.env.REPORT_ALERT_EMAIL || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...admins.map((a) => a.email.toLowerCase()), ...extra.map((e) => e.toLowerCase())])];
}

/** The alert says what kind of report came in and where to look. It never carries chat text. */
export function urgentAlertEmail(reason: ReportReason, createdAt: Date) {
  const label = REPORT_REASON_LABELS[reason];
  const link = `${appOrigin()}/app/admin/reports`;
  return {
    subject: `Urgent Cultural Café report: ${label}`,
    text: [
      `A user reported someone for: ${label}.`,
      `Time: ${createdAt.toISOString()}`,
      '',
      `Open the reports page to review it: ${link}`,
      '',
      'This email does not include any chat text. Sign in as an admin to see the report.',
    ].join('\n'),
  };
}

async function alertAdmins(reportId: string, reason: ReportReason, createdAt: Date) {
  const recipients = await reportAlertRecipients();
  if (!recipients.length) {
    console.error('[reports] urgent report but no admin email to alert', reportId);
    return false;
  }
  const mail = urgentAlertEmail(reason, createdAt);
  const sent = await Promise.all(recipients.map((to) => sendCafeEmail({ to, ...mail }).catch(() => false)));
  if (sent.some(Boolean)) {
    await db.worldReport.update({ where: { id: reportId }, data: { alertedAt: new Date() } });
    return true;
  }
  return false;
}

export async function createReport(input: {
  reporterId: string;
  targetId: string;
  conversationId?: string;
  reason: ReportReason;
  detail: string;
  lines?: AttachedLine[];
}) {
  const lines = normalizeAttachedLines(input.lines);
  const urgent = isUrgentReason(input.reason);
  const report = await db.worldReport.create({
    data: {
      reporterId: input.reporterId,
      targetId: input.targetId,
      conversationId: input.conversationId,
      reason: input.reason,
      detail: encrypt(input.detail),
      messages: lines.length ? encrypt(JSON.stringify(lines)) : '',
      urgent,
    },
  });
  // The report is saved first. A failed email must not lose it; the admin page still shows it.
  const alerted = urgent ? await alertAdmins(report.id, input.reason, report.createdAt).catch(() => false) : false;
  return { id: report.id, urgent, alerted, attached: lines.length };
}

export async function countOpenUrgentReports() {
  return db.worldReport.count({ where: { status: 'open', urgent: true } });
}

export type AdminReport = Awaited<ReturnType<typeof listReports>>[number];

/** Open urgent reports first, then other open ones, then reviewed ones; newest first in each group. */
export async function listReports(limit = 200) {
  const rows = await db.worldReport.findMany({
    orderBy: [{ createdAt: 'desc' }],
    take: limit,
    include: { reporter: { select: { id: true, name: true, email: true } } },
  });
  const otherIds = [...new Set(rows.flatMap((r) => [r.targetId, r.reviewedById].filter((id): id is string => !!id)))];
  const others = otherIds.length
    ? await db.user.findMany({ where: { id: { in: otherIds } }, select: { id: true, name: true, email: true, synthetic: true } })
    : [];
  const byId = new Map(others.map((u) => [u.id, u]));
  const rank = (r: { status: string; urgent: boolean }) => (r.status === 'open' ? (r.urgent ? 0 : 1) : 2);
  return rows
    .map((r) => {
      const target = byId.get(r.targetId);
      const reviewer = r.reviewedById ? byId.get(r.reviewedById) : undefined;
      const reason = (REPORT_REASONS as readonly string[]).includes(r.reason) ? (r.reason as ReportReason) : 'other';
      return {
        id: r.id,
        reason,
        reasonLabel: REPORT_REASON_LABELS[reason],
        urgent: r.urgent,
        status: r.status === 'reviewed' ? ('reviewed' as const) : ('open' as const),
        createdAt: r.createdAt.toISOString(),
        reviewedAt: r.reviewedAt?.toISOString() ?? null,
        reviewedBy: reviewer ? reviewer.name || reviewer.email : null,
        alerted: !!r.alertedAt,
        conversationId: r.conversationId,
        detail: decrypt(r.detail),
        lines: readLines(r.messages),
        reporter: { id: r.reporter.id, name: r.reporter.name, email: r.reporter.email },
        target: target
          ? { id: target.id, name: target.name, email: target.email, guest: target.synthetic }
          : { id: r.targetId, name: 'Deleted account', email: '', guest: false },
      };
    })
    .sort((a, b) => rank(a) - rank(b));
}

export async function setReportStatus(id: string, status: 'open' | 'reviewed', adminId: string) {
  const updated = await db.worldReport.updateMany({
    where: { id },
    data: status === 'reviewed' ? { status, reviewedAt: new Date(), reviewedById: adminId } : { status, reviewedAt: null, reviewedById: null },
  });
  return updated.count > 0;
}

/** For the account export: the reporter's own copy of what they sent. */
export function exportReport<T extends { detail: string; messages: string }>(r: T) {
  return { ...r, detail: decrypt(r.detail), messages: readLines(r.messages) };
}
