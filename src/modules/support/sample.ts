import { uuid } from '@/lib/db';
import { addDays, today } from '@/lib/format';
import type { Staff, SupportTicket, TicketMessage, TrainingProgress, TrainingRegistration } from '@/lib/types';
import { COURSES, sessionsBetween } from './catalog';

/** Local timestamp `days` from today at `hour`:`minute`, as ISO. */
function at(days: number, hour: number, minute = 0) {
  const [y, m, d] = addDays(today(), days).split('-').map(Number);
  return new Date(y, m - 1, d, hour, minute).toISOString();
}

/**
 * Deterministic Support demo data: three tickets (one resolved), Agency University progress for a few staff,
 * and registrations for upcoming instructor-led sessions. Dates are relative to today; no randomness.
 */
export function buildSupportSample(d: { staff: Staff[] }): {
  support_tickets: SupportTicket[]; training_progress: TrainingProgress[]; training_registrations: TrainingRegistration[];
} {
  const people = d.staff.filter((s) => s.active);
  const pick = (i: number) => people[i % Math.max(1, people.length)]?.name ?? 'Agency Staff';
  const first = pick(0), second = pick(1), third = pick(2);

  const msg = (from: TicketMessage['from'], author: string, body: string, days: number, hour: number, minute = 0): TicketMessage =>
    ({ from, author, body, at: at(days, hour, minute) });

  const support_tickets: SupportTicket[] = [
    {
      id: uuid(), created_at: at(-9, 10, 12), subject: 'Carrier not returning quotes in the rater', category: 'Quoting & Rating', priority: 'High', status: 'Resolved', requester: first,
      messages: [
        msg('user', first, 'Travelers shows "Declined" on every auto quote even for clean drivers. Other carriers rate fine.', -9, 10, 12),
        msg('assistant', 'Support assistant', 'Suggested article: Carrier Quoting Setup: enabling carriers in the rater.', -9, 10, 13),
        msg('user', first, 'That was it — the login had never been saved under Carrier Quoting Setup. Rating works now. Marking resolved.', -8, 9, 40),
      ],
    },
    {
      id: uuid(), created_at: at(-3, 14, 5), subject: 'Commission statement total does not match lines', category: 'Commissions & Accounting', priority: 'Normal', status: 'Open', requester: first,
      messages: [
        msg('user', first, 'The Progressive statement header says $4,812.40 but the lines add to $4,760.15 after Auto-match. How do I find the difference?', -3, 14, 5),
      ],
    },
    {
      id: uuid(), created_at: at(-1, 11, 30), subject: 'How do I add a label to many applicants at once?', category: 'Settings & Administration', priority: 'Low', status: 'Pending', requester: second === first ? third : second,
      messages: [
        msg('user', second === first ? third : second, 'We want to tag every umbrella candidate for a campaign. Is there a bulk way to add a label?', -1, 11, 30),
        msg('assistant', 'Support assistant', 'Suggested articles: Managing labels and lead sources; Automation Center: workflows with timed steps.', -1, 11, 31),
      ],
    },
  ];

  // Progress: first staff member finished Foundations + most of Quoting; others partway.
  const lessons = (slug: string) => COURSES.find((c) => c.slug === slug)!.lessons.map((l) => l.key);
  const plan: [string, string[], number][] = !people.length ? [] : [
    [first, [...lessons('foundations'), ...lessons('quoting').slice(0, 3), ...lessons('servicing').slice(0, 2)], -20],
    [second, [...lessons('foundations').slice(0, 4), ...lessons('communication').slice(0, 2)], -12],
    [third, lessons('foundations').slice(0, 2), -5],
  ];
  const seen = new Set<string>();
  const training_progress: TrainingProgress[] = [];
  plan.forEach(([name, keys, startDay]) => {
    keys.forEach((key, i) => {
      const k = `${name}|${key}`;
      if (seen.has(k)) return; // staff list shorter than three: avoid duplicate (staff_name, lesson_key)
      seen.add(k);
      const ts = at(startDay + i, 9 + (i % 6), (i * 7) % 60);
      training_progress.push({ id: uuid(), created_at: ts, staff_name: name, lesson_key: key, completed_at: ts });
    });
  });

  const upcoming = sessionsBetween(1, 45);
  const regPlan: [number, string][] = !people.length ? [] : [[0, first], [0, second], [1, third]];
  const regSeen = new Set<string>();
  const training_registrations: TrainingRegistration[] = [];
  regPlan.forEach(([i, name], n) => {
    const s = upcoming[i];
    if (!s || regSeen.has(`${s.key}|${name}`)) return;
    regSeen.add(`${s.key}|${name}`);
    training_registrations.push({ id: uuid(), created_at: at(-2 + n, 16), session_key: s.key, staff_name: name });
  });

  return { support_tickets, training_progress, training_registrations };
}
