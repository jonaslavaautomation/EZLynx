import { BookOpen, CalendarPlus, CheckCircle2, Circle, Clock, GraduationCap, Presentation, Users } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import {
  Avatar, Badge, Button, DataTable, EmptyState, ErrorBanner, LoadingBlock, PageHeader, Panel, Pills, StatCard, useFeedback, type Column,
} from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { db } from '@/lib/db';
import { fmtDate, fmtRelative } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { href, navigate } from '@/lib/router';
import type { Staff, TrainingProgress } from '@/lib/types';
import { ALL_LESSONS, COURSES, courseBySlug, instructorFor, LESSON_KEYS, sessionIcs, sessionsBetween, type Course, type Lesson, type Session } from './catalog';
import { kbBySlug } from './kb';
import { downloadText } from './lib';
import { Note, ProgressBar } from './shared';

// ── Progress helpers ──

function useProgress() {
  const { me } = useAppData();
  const { toast, confirm } = useFeedback();
  const progress = useTable('training_progress');
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const inFlight = useRef(new Set<string>());

  const mine = useMemo(() => new Set(progress.data.filter((p) => p.staff_name === me?.name).map((p) => p.lesson_key)), [progress.data, me?.name]);

  const run = async (key: string, fn: () => Promise<void>) => {
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setBusy(new Set(inFlight.current));
    try { await fn(); } catch (e) { toast((e as Error).message, 'error'); } finally {
      inFlight.current.delete(key);
      setBusy(new Set(inFlight.current));
    }
  };

  const complete = (l: Lesson) => run(l.key, async () => {
    if (!me) { toast('Choose who you are in Settings → Agency Profile first.', 'error'); return; }
    const existing = await db.list('training_progress', { eq: { staff_name: me.name, lesson_key: l.key } });
    if (!existing.length) await db.insert('training_progress', { staff_name: me.name, lesson_key: l.key, completed_at: new Date().toISOString() });
    toast(`Completed: ${l.title}`);
  });

  const undo = async (l: Lesson) => {
    if (!me) return;
    if (!(await confirm({ title: 'Mark lesson incomplete?', message: `Your completion of “${l.title}” will be removed from the progress table.`, confirmLabel: 'Mark incomplete', danger: true }))) return;
    await run(l.key, async () => {
      const rows = await db.list('training_progress', { eq: { staff_name: me.name, lesson_key: l.key } });
      for (const r of rows) await db.remove('training_progress', r.id);
      toast(`Marked incomplete: ${l.title}`, 'info');
    });
  };

  return { progress, mine, busy, complete, undo, me };
}

const pctOf = (done: number, total: number) => (total ? Math.round((done / total) * 100) : 0);
const courseDone = (c: Course, keys: Set<string>) => c.lessons.filter((l) => keys.has(l.key)).length;

type Row = { id: string; staff: Staff; done: number; pct: number; courses: number; last: string | null };

function progressRows(staff: Staff[], progress: TrainingProgress[], lessons: Lesson[], courses: Course[]): Row[] {
  const valid = new Set(lessons.map((l) => l.key));
  return staff.map((s) => {
    const rows = progress.filter((p) => p.staff_name === s.name && valid.has(p.lesson_key));
    const keys = new Set(rows.map((r) => r.lesson_key));
    const last = rows.reduce<string | null>((m, r) => (!m || r.completed_at > m ? r.completed_at : m), null);
    return { id: s.id, staff: s, done: keys.size, pct: pctOf(keys.size, lessons.length), courses: courses.filter((c) => courseDone(c, keys) === c.lessons.length).length, last };
  });
}

function ProgressTable({ rows, total, showCourses, meName }: { rows: Row[]; total: number; showCourses: boolean; meName: string | null }) {
  const { staffColor } = useAppData();
  const sorted = [...rows].sort((a, b) => b.done - a.done || a.staff.name.localeCompare(b.staff.name));
  const rank = new Map(sorted.map((r, i) => [r.id, i + 1]));
  const cols: Column<Row>[] = [
    { key: 'rank', header: 'Rank', sortValue: (r) => rank.get(r.id) ?? 0, render: (r) => <span className="text-ink-400 tabular-nums">{rank.get(r.id)}</span> },
    { key: 'name', header: 'Staff', sortValue: (r) => r.staff.name, render: (r) => (
      <span className="flex items-center gap-2"><Avatar name={r.staff.name} color={staffColor(r.staff.name)} size={24} />
        <span><span className="font-semibold">{r.staff.name}</span>{r.staff.name === meName && <Badge tone="teal" className="ml-1.5">You</Badge>}<span className="block text-[11px] text-ink-400">{r.staff.role}</span></span>
      </span>
    ) },
    { key: 'done', header: 'Lessons', align: 'right', sortValue: (r) => r.done, render: (r) => <span className="tabular-nums">{r.done} / {total}</span> },
    { key: 'pct', header: 'Progress', sortValue: (r) => r.pct, className: 'min-w-[140px]', render: (r) => <div className="flex items-center gap-2"><ProgressBar value={r.pct} className="flex-1" /><span className="text-xs tabular-nums w-9 text-right">{r.pct}%</span></div> },
    ...(showCourses ? [{ key: 'courses', header: 'Courses done', align: 'right' as const, sortValue: (r: Row) => r.courses, render: (r: Row) => r.courses }] : []),
    { key: 'last', header: 'Last completed', sortValue: (r) => r.last, render: (r) => (r.last ? fmtRelative(r.last) : <span className="text-ink-300">—</span>) },
  ];
  return <DataTable columns={cols} rows={sorted} dense empty={<EmptyState title="No active staff" />} />;
}

// ── Agency University ──

export function University() {
  const { activeStaff } = useAppData();
  const { progress, mine, me } = useProgress();
  const total = ALL_LESSONS.length;
  const myDone = [...mine].filter((k) => LESSON_KEYS.has(k)).length;
  const rows = useMemo(() => progressRows(activeStaff, progress.data, ALL_LESSONS, COURSES), [activeStaff, progress.data]);
  const minutes = ALL_LESSONS.filter((l) => !mine.has(l.key)).reduce((s, l) => s + l.minutes, 0);

  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Support', href: href('/support') }]} title="Agency University" subtitle="Self-paced courses. Mark lessons complete to track progress." icon={<GraduationCap size={20} />} />
      <ErrorBanner message={progress.error} />
      {!me && <div className="mb-3"><Note tone="warn">No current user is set. Choose who you are in <a href={href('/settings?tab=agency')}>Settings → Agency Profile</a> to track your progress.</Note></div>}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <StatCard label={me ? `${me.name}'s progress` : 'My progress'} value={`${pctOf(myDone, total)}%`} hint={`${myDone} of ${total} lessons`} icon={<GraduationCap size={18} />} />
        <StatCard label="Courses completed" value={`${COURSES.filter((c) => courseDone(c, mine) === c.lessons.length).length} / ${COURSES.length}`} icon={<CheckCircle2 size={18} />} tone="green" />
        <StatCard label="Time remaining" value={`${Math.round(minutes / 6) / 10} h`} hint={`${minutes} minutes of lessons left`} icon={<Clock size={18} />} tone="blue" />
      </div>
      {progress.loading ? <LoadingBlock /> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
          {COURSES.map((c) => {
            const done = courseDone(c, mine);
            const pct = pctOf(done, c.lessons.length);
            return (
              <a key={c.slug} href={href(`/support/university/${c.slug}`)} className="no-underline block bg-white border border-[#e3e3e3] rounded shadow-card p-4 hover:border-brand-200 transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={c.level === 'Beginner' ? 'green' : c.level === 'Intermediate' ? 'blue' : 'purple'}>{c.level}</Badge>
                  <span className="text-xs text-ink-400">{c.lessons.length} lessons · {c.lessons.reduce((s, l) => s + l.minutes, 0)} min</span>
                </div>
                <div className="text-[15px] font-semibold text-ink-900 mt-2">{c.title}</div>
                <div className="text-[13px] text-ink-500 mt-1 min-h-[38px]">{c.description}</div>
                <div className="flex items-center gap-2 mt-3"><ProgressBar value={pct} className="flex-1" /><span className="text-xs tabular-nums text-ink-600">{done}/{c.lessons.length}</span></div>
              </a>
            );
          })}
        </div>
      )}
      <Panel title="Staff progress" actions={<span className="text-xs text-ink-400 hidden sm:inline">For instructors: completion across all courses</span>} bodyClassName="p-0">
        {progress.loading ? <LoadingBlock /> : <ProgressTable rows={rows} total={total} showCourses meName={me?.name ?? null} />}
      </Panel>
    </div>
  );
}

export function CoursePage({ slug }: { slug: string }) {
  const { activeStaff } = useAppData();
  const { progress, mine, busy, complete, undo, me } = useProgress();
  const course = courseBySlug(slug);
  const rows = useMemo(() => (course ? progressRows(activeStaff, progress.data, course.lessons, [course]) : []), [activeStaff, progress.data, course]);
  if (!course) return <EmptyState title="Course not found" action={<Button onClick={() => navigate('/support/university')}>All courses</Button>} />;
  const done = courseDone(course, mine);
  const idx = COURSES.indexOf(course);
  const next = COURSES[idx + 1];

  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Support', href: href('/support') }, { label: 'Agency University', href: href('/support/university') }]} title={course.title} subtitle={course.description} icon={<GraduationCap size={20} />} />
      <ErrorBanner message={progress.error} />
      {!me && <div className="mb-3"><Note tone="warn">Choose who you are in <a href={href('/settings?tab=agency')}>Settings → Agency Profile</a> to mark lessons complete.</Note></div>}
      <Panel className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[200px]"><ProgressBar value={pctOf(done, course.lessons.length)} /></div>
          <span className="text-[13px] font-semibold tabular-nums">{done} of {course.lessons.length} complete ({pctOf(done, course.lessons.length)}%)</span>
        </div>
        {done === course.lessons.length && <div className="mt-2 text-[13px] text-emerald-700 font-semibold">Course complete — nice work!{next && <> Next up: <a href={href(`/support/university/${next.slug}`)}>{next.title}</a>.</>}</div>}
      </Panel>
      {progress.loading ? <LoadingBlock /> : (
        <ol className="space-y-2 mb-4">
          {course.lessons.map((l, i) => {
            const isDone = mine.has(l.key);
            const article = l.kb ? kbBySlug(l.kb) : null;
            return (
              <li key={l.key} className="bg-white border border-[#e3e3e3] rounded shadow-card p-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  {isDone ? <CheckCircle2 size={20} className="text-emerald-500 shrink-0 mt-0.5" /> : <Circle size={20} className="text-ink-300 shrink-0 mt-0.5" />}
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-ink-900">{i + 1}. {l.title} <span className="font-normal text-ink-400">· {l.minutes} min</span></div>
                    <div className="text-xs text-ink-500">{l.summary}</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs">
                      {article && <a href={href(`/support/kb/${article.slug}`)} className="inline-flex items-center gap-1 font-semibold"><BookOpen size={12} /> Read: {article.title}</a>}
                      {l.help && <a href={href(`/help?section=${l.help}`)} className="font-semibold">Training guide</a>}
                      {l.practice && <a href={href(l.practice.to)} className="font-semibold">Practice: {l.practice.label}</a>}
                    </div>
                  </div>
                </div>
                <div className="shrink-0">
                  {isDone
                    ? <Button size="sm" variant="ghost" loading={busy.has(l.key)} onClick={() => void undo(l)}>Completed · undo</Button>
                    : <Button size="sm" variant="primary" disabled={!me} loading={busy.has(l.key)} onClick={() => void complete(l)}>Mark complete</Button>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <Panel title="Staff progress in this course" bodyClassName="p-0">
        {progress.loading ? <LoadingBlock /> : <ProgressTable rows={rows} total={course.lessons.length} showCourses={false} meName={me?.name ?? null} />}
      </Panel>
    </div>
  );
}

// ── Instructor-led trainings ──

/** Instructors: owners/admins first, then everyone else, by name — deterministic for a given staff list. */
function useInstructors() {
  const { activeStaff } = useAppData();
  return useMemo(() => {
    const rank = (s: Staff) => (s.role === 'Agency Owner' ? 0 : s.role === 'Admin' ? 1 : s.role === 'Account Manager' ? 2 : 3);
    return [...activeStaff].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).map((s) => s.name);
  }, [activeStaff]);
}

const fmtWhen = (s: Session) =>
  `${s.start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${s.start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}–${s.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`;

export function InstructorLed() {
  const { me } = useAppData();
  const { toast, confirm } = useFeedback();
  const instructors = useInstructors();
  const regs = useTable('training_registrations');
  const [view, setView] = useState<'upcoming' | 'mine' | 'past'>('upcoming');
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);

  const [now] = useState(() => Date.now());
  const upcoming = useMemo(() => sessionsBetween(0, 42).filter((s) => s.start.getTime() > now), [now]);
  const past = useMemo(() => sessionsBetween(-42, 0).filter((s) => s.end.getTime() <= now).reverse(), [now]);
  const bySession = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const r of regs.data) m.set(r.session_key, [...(m.get(r.session_key) ?? []), r.staff_name]);
    return m;
  }, [regs.data]);
  const isMine = (s: Session) => !!me && (bySession.get(s.key) ?? []).includes(me.name);

  const guard = async (key: string, fn: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(key);
    try { await fn(); } catch (e) { toast((e as Error).message, 'error'); } finally { lock.current = false; setBusy(null); }
  };

  const register = (s: Session) => guard(s.key, async () => {
    if (!me) { toast('Choose who you are in Settings → Agency Profile first.', 'error'); return; }
    const current = await db.list('training_registrations', { eq: { session_key: s.key } });
    if (current.some((r) => r.staff_name === me.name)) { toast('You are already registered.', 'info'); return; }
    if (current.length >= s.seats) { toast('This session is full.', 'error'); return; }
    await db.insert('training_registrations', { session_key: s.key, staff_name: me.name });
    toast(`Registered for ${s.title}`);
  });

  const cancel = async (s: Session) => {
    if (!me) return;
    if (!(await confirm({ title: 'Cancel registration?', message: `You will give up your seat in “${s.title}” on ${fmtWhen(s)}.`, confirmLabel: 'Cancel registration', danger: true }))) return;
    await guard(s.key, async () => {
      const rows = await db.list('training_registrations', { eq: { session_key: s.key, staff_name: me.name } });
      for (const r of rows) await db.remove('training_registrations', r.id);
      toast('Registration cancelled', 'info');
    });
  };

  const addToCalendar = (s: Session) => {
    downloadText(`${s.slug}-${s.date}.ics`, sessionIcs(s, instructorFor(s, instructors)), 'text/calendar');
  };

  const list = view === 'past' ? past : view === 'mine' ? upcoming.filter(isMine) : upcoming;

  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Support', href: href('/support') }]} title="Instructor-Led Trainings" subtitle="Live online sessions led by agency trainers. Register to hold a seat." icon={<Presentation size={20} />} />
      <ErrorBanner message={regs.error} />
      {!me && <div className="mb-3"><Note tone="warn">Choose who you are in <a href={href('/settings?tab=agency')}>Settings → Agency Profile</a> to register.</Note></div>}
      <div className="mb-3">
        <Pills value={view} onChange={setView} options={[
          { value: 'upcoming', label: 'Upcoming', count: upcoming.length },
          { value: 'mine', label: 'My registrations', count: upcoming.filter(isMine).length },
          { value: 'past', label: 'Past sessions', count: past.length },
        ]} />
      </div>
      {regs.loading ? <LoadingBlock /> : list.length === 0 ? (
        <Panel><EmptyState icon={<Presentation size={20} />} title={view === 'mine' ? 'You are not registered for any upcoming sessions' : 'No sessions'} message={view === 'mine' ? 'Pick a session under Upcoming.' : undefined} /></Panel>
      ) : (
        <div className="space-y-2">
          {list.map((s) => {
            const who = bySession.get(s.key) ?? [];
            const mineReg = isMine(s);
            const full = who.length >= s.seats;
            const isPast = view === 'past';
            return (
              <div key={s.key} className="bg-white border border-[#e3e3e3] rounded shadow-card p-3.5 flex flex-col md:flex-row md:items-center gap-3">
                <div className="md:w-40 shrink-0">
                  <div className="text-[13px] font-semibold text-ink-900">{s.start.toLocaleDateString('en-US', { weekday: 'long' })}</div>
                  <div className="text-xs text-ink-500">{fmtDate(s.date)}</div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-semibold text-ink-900">{s.title}</span>
                    {mineReg && <Badge tone="green">Registered</Badge>}
                    {!isPast && full && !mineReg && <Badge tone="red">Full</Badge>}
                  </div>
                  <div className="text-xs text-ink-500 mt-0.5">{s.description}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-400 mt-1">
                    <span className="inline-flex items-center gap-1"><Clock size={12} /> {fmtWhen(s)} ({s.duration} min)</span>
                    <span>Instructor: <b className="text-ink-600">{instructorFor(s, instructors)}</b></span>
                    <span className="inline-flex items-center gap-1" title={who.join(', ') || 'No registrations yet'}><Users size={12} /> {who.length} / {s.seats} {isPast ? 'registered' : 'seats taken'}</span>
                  </div>
                  {who.length > 0 && <div className="text-[11px] text-ink-400 mt-0.5 truncate">Registered: {who.join(', ')}</div>}
                </div>
                {!isPast && (
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button size="sm" variant="ghost" icon={<CalendarPlus size={13} />} onClick={() => addToCalendar(s)}>Add to calendar</Button>
                    {mineReg
                      ? <Button size="sm" loading={busy === s.key} onClick={() => void cancel(s)}>Cancel registration</Button>
                      : <Button size="sm" variant="primary" disabled={!me || full} loading={busy === s.key} onClick={() => void register(s)}>{full ? 'Full' : 'Register'}</Button>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-xs text-ink-400 mt-4">Times are shown in your local time zone. Calendar files list the location as “Online webinar”; the instructor sends the meeting link before the session.</p>
    </div>
  );
}
