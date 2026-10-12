import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { currentUser } from '@/lib/session';
import { connectedChannels, nameOf } from '@/lib/inventory';
import { ensureGroups, users, createTask, updateTask, comment, activity, STATUSES, PRIORITIES } from '@/lib/tasks';

export async function GET(req: Request) {
  try {
    const me = await currentUser();
    if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const u = new URL(req.url);
    const id = u.searchParams.get('task');
    if (id) {
      const task = await db.task.findUnique({ where: { id } });
      if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
      const history = await db.taskActivity.findMany({ where: { taskId: id }, orderBy: { createdAt: 'desc' }, take: 200 });
      return NextResponse.json({ task, history });
    }
    await ensureGroups();
    const showDone = u.searchParams.get('done') === '1';
    const monthAgo = new Date(Date.now() - 30 * 86_400_000);
    const [groups, tasks, people, chs] = await Promise.all([
      db.taskGroup.findMany({ orderBy: { position: 'asc' } }),
      db.task.findMany({ where: showDone ? { OR: [{ status: { not: 'done' } }, { doneAt: { gte: monthAgo } }] } : { status: { not: 'done' } }, orderBy: [{ position: 'asc' }] }),
      users(),
      connectedChannels().catch(() => [] as string[]),
    ]);
    const doneCount = await db.task.count({ where: { status: 'done', doneAt: { gte: monthAgo } } });
    const counts = await db.taskActivity.groupBy({ by: ['taskId'], where: { kind: 'comment', taskId: { in: (tasks as { id: string }[]).map((t) => t.id) } }, _count: { _all: true } });
    const comments = Object.fromEntries((counts as { taskId: string; _count: { _all: number } }[]).map((c) => [c.taskId, c._count._all]));
    return NextResponse.json({
      me: { id: me.sub, name: me.name, role: me.role }, users: people, groups, tasks, comments, doneCount,
      statuses: STATUSES, priorities: PRIORITIES, channels: chs.map((c) => ({ key: c, name: nameOf(c) })),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const me = await currentUser();
    if (!me) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });
    const who = { id: me.sub, name: me.name };
    const b = await req.json();
    switch (b.action) {
      case 'create': {
        if (!String(b.title ?? '').trim()) return NextResponse.json({ error: 'Write a task name' }, { status: 400 });
        return NextResponse.json({ task: await createTask(b, who) });
      }
      case 'update': return NextResponse.json({ task: await updateTask(String(b.id), b.patch ?? {}, who) });
      case 'comment': await comment(String(b.id), String(b.text ?? ''), who); return NextResponse.json({ ok: true });
      case 'delete': {
        const t = (await db.task.findUnique({ where: { id: String(b.id) } })) as { title: string } | null;
        if (!t) return NextResponse.json({ ok: true });
        await db.taskActivity.deleteMany({ where: { taskId: String(b.id) } });
        await db.notification.deleteMany({ where: { taskId: String(b.id) } });
        await db.task.delete({ where: { id: String(b.id) } });
        return NextResponse.json({ ok: true, deleted: t.title });
      }
      case 'addGroup': {
        const last = (await db.taskGroup.findFirst({ orderBy: { position: 'desc' }, select: { position: true } })) as { position: number } | null;
        const colors = ['#579bfc', '#a25ddc', '#00c875', '#fdab3d', '#e2445c', '#037f4c', '#ff7575', '#9cd326'];
        return NextResponse.json({ group: await db.taskGroup.create({ data: { name: String(b.name || 'New group').trim(), color: colors[Math.floor(Math.random() * colors.length)], position: (last?.position ?? 0) + 1 } }) });
      }
      case 'renameGroup': return NextResponse.json({ group: await db.taskGroup.update({ where: { id: String(b.id) }, data: { name: String(b.name ?? '').trim() || 'Group' } }) });
      case 'moveGroup': {
        const gs = (await db.taskGroup.findMany({ orderBy: { position: 'asc' } })) as { id: string }[];
        const i = gs.findIndex((g) => g.id === b.id), j = i + (b.dir === 'up' ? -1 : 1);
        if (i < 0 || j < 0 || j >= gs.length) return NextResponse.json({ ok: true });
        [gs[i], gs[j]] = [gs[j], gs[i]];
        for (let k = 0; k < gs.length; k++) await db.taskGroup.update({ where: { id: gs[k].id }, data: { position: k } });
        return NextResponse.json({ ok: true });
      }
      case 'deleteGroup': {
        if ((await db.task.count({ where: { groupId: String(b.id) } })) > 0) return NextResponse.json({ error: 'Move or delete the tasks in this group first' }, { status: 400 });
        await db.taskGroup.delete({ where: { id: String(b.id) } });
        return NextResponse.json({ ok: true });
      }
      case 'moveTask': {
        const t = (await db.task.findUnique({ where: { id: String(b.id) } })) as { id: string; groupId: string; position: number } | null;
        if (!t) return NextResponse.json({ ok: true });
        const list = (await db.task.findMany({ where: { groupId: t.groupId }, orderBy: { position: 'asc' }, select: { id: true } })) as { id: string }[];
        const i = list.findIndex((x) => x.id === t.id), j = i + (b.dir === 'up' ? -1 : 1);
        if (j < 0 || j >= list.length) return NextResponse.json({ ok: true });
        [list[i], list[j]] = [list[j], list[i]];
        for (let k = 0; k < list.length; k++) await db.task.update({ where: { id: list[k].id }, data: { position: k + 1 } });
        await activity(t.id, who, 'change', `moved it ${b.dir === 'up' ? 'up' : 'down'}`);
        return NextResponse.json({ ok: true });
      }
      default: return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
