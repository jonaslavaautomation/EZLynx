import { Code2, ShieldAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Badge, EmptyState, PageHeader, Panel, cx } from '@/components/ui';
import { useAppData } from '@/lib/app-context';
import { href } from '@/lib/router';
import { API_PAGES, OPERATORS, RESOURCES, type Resource } from './apidocs';
import { CodeBlock, CopyButton, Note } from './shared';

/* API documentation for this system's real data API (Supabase PostgREST). The anon key is never printed. */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '') || '';
const KEY_CONFIGURED = Boolean(import.meta.env.VITE_SUPABASE_ANON_KEY);
const BASE = `${SUPABASE_URL || 'https://<project-ref>.supabase.co'}/rest/v1`;
const KEY = '$SUPABASE_ANON_KEY';
const json = (v: unknown) => JSON.stringify(v, null, 2);

function curl(method: string, path: string, opts: { body?: unknown; prefer?: string; accept?: string } = {}) {
  const lines = [`curl${method === 'GET' ? '' : ` -X ${method}`} "$SUPABASE_URL/rest/v1/${path}"`, `  -H "apikey: ${KEY}"`, `  -H "Authorization: Bearer ${KEY}"`];
  if (opts.accept) lines.push(`  -H "Accept: ${opts.accept}"`);
  if (opts.body !== undefined) lines.push('  -H "Content-Type: application/json"');
  if (opts.prefer) lines.push(`  -H "Prefer: ${opts.prefer}"`);
  if (opts.body !== undefined) lines.push(`  -d '${JSON.stringify(opts.body).replace(/'/g, "'\\''")}'`);
  return lines.join(' \\\n');
}

const METHOD_TONE = { GET: 'blue', POST: 'green', PATCH: 'amber', DELETE: 'red' } as const;

function Endpoint({ method, path, title, children }: { method: keyof typeof METHOD_TONE; path: string; title: string; children: ReactNode }) {
  return (
    <div className="border border-ink-100 rounded p-3 space-y-2 min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={METHOD_TONE[method]} className="font-mono">{method}</Badge>
        <code className="text-[12px] font-mono text-ink-800 break-all">/rest/v1/{path}</code>
        <CopyButton text={`${BASE}/${path}`} label="Copy URL" />
      </div>
      <div className="text-[13px] font-semibold text-ink-800">{title}</div>
      {children}
    </div>
  );
}

function ResourceDocs({ r }: { r: Resource }) {
  const [tab, setTab] = useState<'endpoints' | 'fields'>('endpoints');
  const id = String(r.example.id);
  return (
    <Panel title={<div><h2 className="text-[15px] font-semibold text-ink-900">{r.title} <code className="text-xs font-mono text-ink-400 ml-1">{r.table}</code></h2><div className="text-xs text-ink-400">{r.description}</div></div>}
      actions={<div className="inline-flex bg-ink-50 border border-ink-100 rounded p-0.5">{(['endpoints', 'fields'] as const).map((t) => (
        <button key={t} onClick={() => setTab(t)} className={cx('px-2.5 h-7 rounded text-xs font-semibold capitalize', tab === t ? 'bg-white text-brand-600 shadow-sm' : 'bg-transparent text-ink-500')}>{t}</button>
      ))}</div>}>
      {tab === 'fields' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-400"><th className="py-1.5 pr-3">Field</th><th className="py-1.5 pr-3">Type</th><th className="py-1.5">Notes</th></tr></thead>
            <tbody>
              {r.fields.map((fl) => (
                <tr key={fl.name} className="border-b border-ink-50 last:border-0 align-top">
                  <td className="py-1.5 pr-3 font-mono text-[12px] whitespace-nowrap">{fl.name}{fl.required && <span className="text-red-500" title="Required on insert">*</span>}</td>
                  <td className="py-1.5 pr-3 font-mono text-[12px] text-ink-500 whitespace-nowrap">{fl.type}</td>
                  <td className="py-1.5 text-ink-600">{fl.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-[11px] text-ink-400 mt-2"><span className="text-red-500">*</span> required when inserting (NOT NULL without a default).</div>
        </div>
      ) : (
        <div className="space-y-3">
          <Endpoint method="GET" path={`${r.table}?select=*&order=created_at.desc&limit=25`} title={`List ${r.title.toLowerCase()}`}>
            <CodeBlock title="curl" code={curl('GET', `${r.table}?select=*&order=created_at.desc&limit=25`)} />
            <CodeBlock title="Response 200" code={json([r.example])} />
            {r.queries.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400 mb-1">Query examples</div>
                <ul className="space-y-1.5">
                  {r.queries.map((q) => (
                    <li key={q.title} className="text-[13px] min-w-0">
                      <div className="text-ink-700">{q.title}{q.note && <span className="text-xs text-ink-400"> — {q.note}</span>}</div>
                      <div className="flex items-center gap-1 min-w-0">
                        <code className="flex-1 min-w-0 text-[12px] font-mono bg-ink-50 border border-ink-100 rounded px-2 py-1 overflow-x-auto whitespace-nowrap">{q.query.startsWith('POST ') ? q.query : `GET /rest/v1/${q.query}`}</code>
                        <CopyButton text={q.query.startsWith('POST ') ? q.query : curl('GET', q.query)} label={q.query.startsWith('POST ') ? 'Copy' : 'curl'} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Endpoint>
          <Endpoint method="GET" path={`${r.table}?id=eq.${id}`} title="Get one by id">
            <CodeBlock title="curl" code={curl('GET', `${r.table}?id=eq.${id}`, { accept: 'application/vnd.pgrst.object+json' })} />
            <p className="text-xs text-ink-500">The object Accept header returns a single JSON object instead of an array (406 when no row matches).</p>
          </Endpoint>
          <Endpoint method="POST" path={r.table} title="Create">
            <CodeBlock title="curl" code={curl('POST', r.table, { body: r.create, prefer: 'return=representation' })} />
            <CodeBlock title="Response 201" code={json([{ ...r.example, ...r.create }])} />
          </Endpoint>
          <Endpoint method="PATCH" path={`${r.table}?id=eq.${id}`} title="Update">
            <CodeBlock title="curl" code={curl('PATCH', `${r.table}?id=eq.${id}`, { body: r.patch, prefer: 'return=representation' })} />
            <p className="text-xs text-ink-500">Always include a filter — a PATCH without one updates every row the key can see.</p>
          </Endpoint>
          <Endpoint method="DELETE" path={`${r.table}?id=eq.${id}`} title="Delete">
            <CodeBlock title="curl" code={curl('DELETE', `${r.table}?id=eq.${id}`)} />
            <p className="text-xs text-ink-500">Foreign keys apply on the server (see the → notes in Fields): e.g. deleting an applicant cascades to its drivers, vehicles, policies and activities.</p>
          </Endpoint>
        </div>
      )}
    </Panel>
  );
}

function ApiNav({ slug }: { slug: string }) {
  return (
    <Panel bodyClassName="p-2">
      {API_PAGES.map((p) => (
        <a key={p.slug} href={href(`/support/api${p.slug ? '/' + p.slug : ''}`)} className={cx('block px-2 py-1.5 rounded text-[13px] no-underline', p.slug === slug ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-ink-700 hover:bg-ink-50')}>{p.title}</a>
      ))}
    </Panel>
  );
}

function ModeNotes() {
  const { mode } = useAppData();
  return (
    <div className="space-y-2">
      {mode === 'local' && (
        <Note tone="warn">This workspace is running in <b>browser-storage demo mode</b>, so there is no server API behind it right now — data lives only in this browser. Connect Supabase under <a href={href('/settings?tab=data')}>Settings → Data & Integrations</a> to use these endpoints.</Note>
      )}
      <div className="flex items-start gap-2 rounded border border-red-200 bg-red-50 text-red-800 text-[13px] px-3 py-2">
        <ShieldAlert size={15} className="shrink-0 mt-0.5" />
        <div><b>Security:</b> the demo database policies grant the anonymous (anon) key full read/write access to every table and the documents bucket. Anyone with the app URL and anon key can read and change data. Before storing real client data, add authentication and restrictive row-level security policies, and never embed a service-role key in a browser app.</div>
      </div>
    </div>
  );
}

function Overview() {
  const { mode } = useAppData();
  const setup = `export SUPABASE_URL="${SUPABASE_URL || 'https://<project-ref>.supabase.co'}"\nexport SUPABASE_ANON_KEY="<your anon key>"   # Supabase → Project Settings → API`;
  return (
    <div className="space-y-4">
      <Panel title="Base URL and authentication">
        <div className="space-y-3 text-[13px] text-ink-700">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">Base URL</span>
            <code className="font-mono text-[12px] bg-ink-50 border border-ink-100 rounded px-2 py-1 break-all">{BASE}</code>
            <CopyButton text={BASE} />
          </div>
          <div className="text-xs text-ink-500">
            {SUPABASE_URL ? 'From this app’s VITE_SUPABASE_URL.' : 'VITE_SUPABASE_URL is not set for this app; replace <project-ref> with your project.'}{' '}
            Anon key: {KEY_CONFIGURED ? 'configured for this app (hidden).' : 'not configured.'} Current mode: <b>{mode === 'supabase' ? 'Supabase' : 'browser storage'}</b>.
          </div>
          <p>Every request sends the project’s API key twice:</p>
          <CodeBlock title="headers" code={`apikey: <SUPABASE_ANON_KEY>\nAuthorization: Bearer <SUPABASE_ANON_KEY>`} />
          <p>Set these once in your shell; the examples on every page use them:</p>
          <CodeBlock title="shell" code={setup} />
        </div>
      </Panel>
      <Panel title="API groups">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {API_PAGES.filter((p) => p.slug).map((p) => (
            <a key={p.slug} href={href(`/support/api/${p.slug}`)} className="block border border-ink-100 rounded px-3 py-2.5 hover:border-brand-200 hover:bg-brand-50/40 no-underline">
              <div className="text-[13px] font-semibold text-ink-900">{p.title}</div>
              <div className="text-xs text-ink-400">{p.intro}</div>
              {p.resources.length > 0 && <div className="text-[11px] font-mono text-ink-500 mt-1">{p.resources.join(' · ')}</div>}
            </a>
          ))}
        </div>
      </Panel>
      <Panel title="Conventions">
        <ul className="list-disc pl-5 space-y-1.5 text-[13px] text-ink-700">
          <li>Resources are tables: <code className="font-mono text-[12px]">/rest/v1/&lt;table&gt;</code>. Rows are JSON with snake_case keys, exactly the fields listed on each page.</li>
          <li>Every row has <code className="font-mono text-[12px]">id</code> (uuid) and <code className="font-mono text-[12px]">created_at</code>. Dates without time are <code className="font-mono text-[12px]">YYYY-MM-DD</code>.</li>
          <li>Staff, producer and CSR references are stored as the staff member’s name.</li>
          <li>Errors return JSON <code className="font-mono text-[12px]">{'{ code, message, details, hint }'}</code> with a 4xx status (e.g. 400 for an unknown column, 409 for a unique violation).</li>
          <li>Other tables (claims, invoices, carriers, staff, commission_statements, support_tickets…) follow the same patterns; see <code className="font-mono text-[12px]">src/lib/types.ts</code> for every field.</li>
        </ul>
      </Panel>
    </div>
  );
}

function WebServices() {
  const realtime = `import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

supabase
  .channel('policy-changes')
  .on('postgres_changes', { event: '*', schema: 'public', table: 'policies' }, (payload) => {
    // payload.eventType: 'INSERT' | 'UPDATE' | 'DELETE'; payload.new / payload.old hold the row
    console.log(payload.eventType, payload.new);
  })
  .subscribe();`;
  const bulk = [{ account_id: RESOURCES.drivers.create.account_id, first_name: 'Ava', last_name: 'Mitchell', relationship: 'Child' }, { account_id: RESOURCES.drivers.create.account_id, first_name: 'Liam', last_name: 'Mitchell', relationship: 'Child' }];
  return (
    <div className="space-y-4">
      <Panel title="Bulk insert and upsert">
        <div className="space-y-3 text-[13px] text-ink-700">
          <p>POST an array to insert many rows in one request (all-or-nothing):</p>
          <CodeBlock title="curl" code={curl('POST', 'drivers', { body: bulk, prefer: 'return=representation' })} />
          <p>Upsert on a unique column with <code className="font-mono text-[12px]">on_conflict</code> and a merge preference — e.g. carrier quoting logins are unique per carrier:</p>
          <CodeBlock title="curl" code={curl('POST', 'carrier_rating_setup?on_conflict=carrier', { body: [{ carrier: 'Progressive', username: 'agency123', login_set: true, enabled_lines: ['Personal Auto'] }], prefer: 'resolution=merge-duplicates,return=representation' })} />
          <p>PATCH or DELETE with a filter changes every matching row — use with care:</p>
          <CodeBlock title="curl" code={curl('PATCH', 'activities?assigned_to=eq.Marcus%20Lee&status=eq.Open', { body: { assigned_to: 'Dana Whitfield' } })} />
        </div>
      </Panel>
      <Panel title="Filtering">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="border-b border-ink-100 text-left text-[11px] uppercase tracking-wide text-ink-400"><th className="py-1.5 pr-3">Operator</th><th className="py-1.5 pr-3">Meaning</th><th className="py-1.5">Example</th></tr></thead>
            <tbody>
              {OPERATORS.map(([op, meaning, ex]) => (
                <tr key={op} className="border-b border-ink-50 last:border-0 align-top">
                  <td className="py-1.5 pr-3 font-mono text-[12px] whitespace-nowrap">{op}</td>
                  <td className="py-1.5 pr-3 text-ink-600">{meaning}</td>
                  <td className="py-1.5 font-mono text-[12px] whitespace-nowrap">{ex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink-500 mt-2">URL-encode spaces and special characters in values (e.g. <code className="font-mono">Marcus%20Lee</code>). Several filters on one request are combined with AND.</p>
      </Panel>
      <Panel title="Pagination">
        <div className="space-y-3 text-[13px] text-ink-700">
          <p>Responses are capped at <b>1000 rows</b> (the project’s max-rows setting). Page with <code className="font-mono text-[12px]">limit</code>/<code className="font-mono text-[12px]">offset</code> or a Range header, always with a stable <code className="font-mono text-[12px]">order</code> (add <code className="font-mono text-[12px]">id</code> as a tie-breaker). This app pages the same way.</p>
          <CodeBlock title="curl" code={`${curl('GET', 'policies?select=*&order=created_at.asc,id.asc')} \\\n  -H "Range-Unit: items" \\\n  -H "Range: 0-999" \\\n  -H "Prefer: count=exact"`} />
          <p>With <code className="font-mono text-[12px]">Prefer: count=exact</code> the response includes <code className="font-mono text-[12px]">Content-Range: 0-999/2412</code> — request <code className="font-mono text-[12px]">1000-1999</code> next until you reach the total.</p>
        </div>
      </Panel>
      <Panel title="Change notifications (Supabase Realtime)">
        <div className="space-y-3 text-[13px] text-ink-700">
          <p>Instead of polling, subscribe to row changes over a websocket. Events are delivered as JSON for INSERT, UPDATE and DELETE.</p>
          <CodeBlock title="JavaScript" code={realtime} />
          <p>Realtime only sends changes for tables in the <code className="font-mono text-[12px]">supabase_realtime</code> publication. The AMS migrations do not add any, so enable the tables you need first:</p>
          <CodeBlock title="SQL" code={'alter publication supabase_realtime add table policies, activities, messages;'} />
          <Note>Row-level security applies to Realtime too. With the demo policies every anon subscriber receives every change — another reason to lock down policies before production.</Note>
        </div>
      </Panel>
      <Panel title="Files (Storage)">
        <div className="space-y-2 text-[13px] text-ink-700">
          <p>Document files are stored in the private <code className="font-mono text-[12px]">documents</code> bucket; the <code className="font-mono text-[12px]">documents</code> table holds <code className="font-mono text-[12px]">storage_path</code>. Upload and download through the Storage API at <code className="font-mono text-[12px] break-all">{(SUPABASE_URL || 'https://<project-ref>.supabase.co') + '/storage/v1'}</code>.</p>
          <CodeBlock title="curl (upload)" code={`curl -X POST "$SUPABASE_URL/storage/v1/object/documents/<folder>/ID_Cards.pdf" \\\n  -H "apikey: ${KEY}" \\\n  -H "Authorization: Bearer ${KEY}" \\\n  -H "Content-Type: application/pdf" \\\n  --data-binary @ID_Cards.pdf`} />
        </div>
      </Panel>
    </div>
  );
}

export function ApiDocs({ slug }: { slug: string }) {
  const page = API_PAGES.find((p) => p.slug === slug);
  if (!page) return <EmptyState title="API page not found" message={<a href={href('/support/api')}>Back to the API overview</a>} />;
  return (
    <div>
      <PageHeader breadcrumb={[{ label: 'Support', href: href('/support') }, ...(slug ? [{ label: 'Platform API', href: href('/support/api') }] : [])]} title={page.title} subtitle={page.intro} icon={<Code2 size={20} />} />
      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-4 items-start">
        <ApiNav slug={slug} />
        <div className="space-y-4 min-w-0">
          <ModeNotes />
          {slug === '' && <Overview />}
          {slug === 'web-services' && <WebServices />}
          {page.resources.map((t) => <ResourceDocs key={t} r={RESOURCES[t]} />)}
        </div>
      </div>
    </div>
  );
}
