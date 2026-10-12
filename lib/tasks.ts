import { db } from './db';

// Team tasks (Monday.com style): groups → tasks, with history, comments and notifications.

export const STATUSES = [
  { key: 'not_started', label: 'Not started', color: '#c4c4c4' },
  { key: 'working', label: 'Working on it', color: '#fdab3d' },
  { key: 'pending', label: 'Pending', color: '#a25ddc' },
  { key: 'stuck', label: 'Stuck', color: '#e2445c' },
  { key: 'done', label: 'Done', color: '#00c875' },
] as const;
export const PRIORITIES = [
  { key: 'low', label: 'Low', color: '#579bfc' },
  { key: 'medium', label: 'Medium', color: '#5559df' },
  { key: 'high', label: 'High', color: '#401694' },
  { key: 'urgent', label: 'Urgent', color: '#e2445c' },
] as const;
export const statusLabel = (k: string) => STATUSES.find((s) => s.key === k)?.label ?? k;
export const priorityLabel = (k: string) => PRIORITIES.find((s) => s.key === k)?.label ?? k;

export interface Actor { id: string; name: string }
export interface CheckItem { id: string; text: string; done: boolean }

export async function users() {
  return (await db.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: 'asc' } })) as { id: string; name: string; email: string; role: string }[];
}

export async function ensureGroups() {
  if ((await db.taskGroup.count()) > 0) return;
  const defaults = [['This week', '#579bfc'], ['Next week', '#a25ddc'], ['Later', '#c4c4c4']];
  for (let i = 0; i < defaults.length; i++) await db.taskGroup.create({ data: { name: defaults[i][0], color: defaults[i][1], position: i } });
}

export async function activity(taskId: string, who: Actor, kind: string, text: string) {
  await db.taskActivity.create({ data: { taskId, userId: who.id, userName: who.name, kind, text } });
}

// Sends one notification to each person (never to the one who did it).
export async function notify(userIds: (string | null | undefined)[], who: Actor | null, taskId: string | null, kind: string, text: string, dedupe?: string) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x && x !== who?.id))];
  for (const userId of ids) {
    const key = dedupe ? `${dedupe}:${userId}` : null;
    if (key && (await db.notification.findUnique({ where: { dedupe: key } }))) continue;
    await db.notification.create({ data: { userId, taskId, kind, text, link: taskId ? `/tasks?open=${taskId}` : '', byName: who?.name ?? 'Catalog Sync', dedupe: key } });
  }
}

const managers = async () => ((await db.user.findMany({ where: { active: true, role: { in: ['owner', 'admin'] } }, select: { id: true } })) as { id: string }[]).map((u) => u.id);
async function watchers(taskId: string, ownerId: string | null, createdById: string) {
  const commenters = ((await db.taskActivity.findMany({ where: { taskId, kind: 'comment' }, select: { userId: true } })) as { userId: string }[]).map((a) => a.userId);
  return [ownerId, createdById, ...commenters];
}

const fmtDate = (d: Date | null) => (d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'no date');

interface TaskRow { id: string; title: string; status: string; priority: string; ownerId: string | null; dueDate: Date | null; groupId: string; createdById: string; description: string; link: string; channelKey: string; checklist: unknown }

// Apply a change, write the history line and tell the right people.
export async function updateTask(id: string, patch: Partial<Pick<TaskRow, 'title' | 'status' | 'priority' | 'ownerId' | 'dueDate' | 'groupId' | 'description' | 'link' | 'channelKey' | 'checklist'>>, who: Actor) {
  const t = (await db.task.findUnique({ where: { id } })) as TaskRow | null;
  if (!t) throw new Error('Task not found');
  const people = await users();
  const nameOf = (uid: string | null) => people.find((p) => p.id === uid)?.name ?? 'nobody';
  const data: Record<string, unknown> = {};
  const lines: string[] = [];

  if (patch.title !== undefined && patch.title.trim() && patch.title.trim() !== t.title) { data.title = patch.title.trim(); lines.push(`renamed the task to "${patch.title.trim()}"`); }
  if (patch.status !== undefined && patch.status !== t.status) { data.status = patch.status; data.doneAt = patch.status === 'done' ? new Date() : null; lines.push(`changed status: ${statusLabel(t.status)} → ${statusLabel(patch.status)}`); }
  if (patch.priority !== undefined && patch.priority !== t.priority) { data.priority = patch.priority; lines.push(`changed priority: ${priorityLabel(t.priority)} → ${priorityLabel(patch.priority)}`); }
  if (patch.ownerId !== undefined && (patch.ownerId || null) !== t.ownerId) { data.ownerId = patch.ownerId || null; lines.push(`assigned it to ${nameOf(patch.ownerId || null)}`); }
  if (patch.dueDate !== undefined) {
    const d = patch.dueDate ? new Date(patch.dueDate) : null;
    if ((d?.getTime() ?? 0) !== (t.dueDate ? new Date(t.dueDate).getTime() : 0)) { data.dueDate = d; lines.push(`changed due date: ${fmtDate(t.dueDate)} → ${fmtDate(d)}`); }
  }
  if (patch.groupId !== undefined && patch.groupId !== t.groupId) {
    const g = (await db.taskGroup.findUnique({ where: { id: patch.groupId } })) as { name: string } | null;
    if (g) { data.groupId = patch.groupId; lines.push(`moved it to "${g.name}"`); }
  }
  if (patch.description !== undefined && patch.description !== t.description) { data.description = patch.description; lines.push('updated the description'); }
  if (patch.link !== undefined && patch.link !== t.link) { data.link = patch.link; lines.push('changed the link'); }
  if (patch.channelKey !== undefined && patch.channelKey !== t.channelKey) { data.channelKey = patch.channelKey; lines.push(`set marketplace: ${patch.channelKey || 'none'}`); }
  if (patch.checklist !== undefined) {
    const before = (Array.isArray(t.checklist) ? t.checklist : []) as CheckItem[];
    const after = (Array.isArray(patch.checklist) ? patch.checklist : []) as CheckItem[];
    data.checklist = after;
    for (const a of after) {
      const b = before.find((x) => x.id === a.id);
      if (!b) lines.push(`added checklist item "${a.text}"`);
      else if (a.done && !b.done) lines.push(`ticked "${a.text}"`);
      else if (!a.done && b.done) lines.push(`unticked "${a.text}"`);
    }
    for (const b of before) if (!after.some((a) => a.id === b.id)) lines.push(`removed checklist item "${b.text}"`);
  }
  if (!Object.keys(data).length) return t;

  const saved = await db.task.update({ where: { id }, data });
  for (const l of lines) await activity(id, who, 'change', l);

  const title = (data.title as string) ?? t.title;
  const ownerId = (data.ownerId !== undefined ? (data.ownerId as string | null) : t.ownerId);
  if (data.ownerId) await notify([data.ownerId as string], who, id, 'assigned', `${who.name} assigned you "${title}"${t.dueDate || data.dueDate ? ` · due ${fmtDate((data.dueDate as Date) ?? t.dueDate)}` : ''}`);
  if (data.status === 'done') {
    const done = ((data.checklist ?? t.checklist) as CheckItem[] | null)?.filter?.((c) => c.done).length ?? 0;
    await notify([...(await watchers(id, ownerId, t.createdById)), ...(await managers())], who, id, 'done', `✅ ${who.name} finished "${title}"${done ? ` · ${done} checklist item${done === 1 ? '' : 's'} done` : ''}`);
  } else if (data.status) {
    await notify(await watchers(id, ownerId, t.createdById), who, id, 'status', `${who.name} changed "${title}" to ${statusLabel(data.status as string)}`);
  } else {
    const other = lines.filter((l) => !l.startsWith('assigned'));
    const to = [...(await watchers(id, ownerId, t.createdById)), t.ownerId].filter((u) => u !== data.ownerId); // the new owner already got "assigned you"
    if (other.length) await notify(to, who, id, 'change', `${who.name} ${other[0]} on "${title}"${other.length > 1 ? ` (+${other.length - 1} more)` : ''}`);
    else if (data.ownerId && t.ownerId) await notify([t.ownerId], who, id, 'change', `${who.name} moved "${title}" to ${nameOf(data.ownerId as string)}`);
  }
  return saved;
}

export async function createTask(input: { title: string; groupId: string; ownerId?: string | null; dueDate?: string | null; status?: string; priority?: string; description?: string; channelKey?: string; link?: string }, who: Actor) {
  const last = (await db.task.findFirst({ where: { groupId: input.groupId }, orderBy: { position: 'desc' }, select: { position: true } })) as { position: number } | null;
  const t = await db.task.create({ data: {
    title: input.title.trim(), groupId: input.groupId, ownerId: input.ownerId || null, dueDate: input.dueDate ? new Date(input.dueDate) : null,
    status: input.status || 'not_started', priority: input.priority || 'medium', description: input.description ?? '', channelKey: input.channelKey ?? '', link: input.link ?? '',
    checklist: [], position: (last?.position ?? 0) + 1, createdById: who.id,
  } });
  await activity(t.id, who, 'created', 'created the task');
  if (t.ownerId) await notify([t.ownerId], who, t.id, 'assigned', `${who.name} assigned you "${t.title}"${t.dueDate ? ` · due ${fmtDate(t.dueDate)}` : ''}`);
  return t;
}

export async function comment(taskId: string, text: string, who: Actor) {
  const t = (await db.task.findUnique({ where: { id: taskId } })) as TaskRow | null;
  if (!t || !text.trim()) return;
  await activity(taskId, who, 'comment', text.trim());
  await notify(await watchers(taskId, t.ownerId, t.createdById), who, taskId, 'comment', `💬 ${who.name} on "${t.title}": ${text.trim().slice(0, 120)}`);
}

// Every hour: due tomorrow / due today / overdue reminders (each one sent once).
export async function dueTick() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const tasks = (await db.task.findMany({ where: { status: { not: 'done' }, dueDate: { not: null, lt: new Date(tomorrow.getTime() + 86_400_000) } }, select: { id: true, title: true, ownerId: true, createdById: true, dueDate: true } })) as { id: string; title: string; ownerId: string | null; createdById: string; dueDate: Date }[];
  for (const t of tasks) {
    const d = new Date(t.dueDate).getTime();
    const day = today.toISOString().slice(0, 10);
    const to = [t.ownerId ?? t.createdById];
    if (d >= tomorrow.getTime()) await notify(to, null, t.id, 'due', `⏰ "${t.title}" is due tomorrow`, `due1:${t.id}:${new Date(d).toISOString().slice(0, 10)}`);
    else if (d >= today.getTime()) await notify(to, null, t.id, 'due', `⏰ "${t.title}" is due today`, `due0:${t.id}:${day}`);
    else await notify([...to, t.createdById], null, t.id, 'overdue', `🔴 "${t.title}" is overdue (was due ${fmtDate(t.dueDate)})`, `over:${t.id}:${day}`);
  }
}
