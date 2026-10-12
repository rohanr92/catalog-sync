// Team tasks: tables, menu item, 🔔 bell on every page, hourly due-date reminders.
import fs from 'node:fs';
const schemaFile = 'prisma/schema.prisma';
for (const f of [schemaFile, 'components/Shell.tsx', 'instrumentation.ts', 'app/layout.tsx']) if (!fs.existsSync(f)) { console.log(`STOPPED: ${f} not found`); process.exit(1); }
const schema = fs.readFileSync(schemaFile, 'utf8');
const done = schema.includes('model TaskActivity');
if (!done) for (const m of ['TaskGroup', 'Task', 'Notification']) if (new RegExp(`^model ${m} \\{`, 'm').test(schema)) { console.log(`STOPPED: a model called ${m} already exists — tell Claude`); process.exit(1); }

const model = `
model TaskGroup {
  id        String   @id @default(cuid())
  name      String
  color     String   @default("#579bfc")
  position  Int      @default(0)
  createdAt DateTime @default(now())
}

model Task {
  id          String    @id @default(cuid())
  groupId     String
  title       String
  description String    @default("")
  status      String    @default("not_started")
  priority    String    @default("medium")
  ownerId     String?
  dueDate     DateTime?
  link        String    @default("")
  channelKey  String    @default("")
  checklist   Json      @default("[]")
  position    Float     @default(0)
  createdById String
  doneAt      DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([groupId])
  @@index([status])
}

model TaskActivity {
  id        String   @id @default(cuid())
  taskId    String
  userId    String
  userName  String
  kind      String
  text      String
  createdAt DateTime @default(now())

  @@index([taskId])
}

model Notification {
  id        String   @id @default(cuid())
  userId    String
  taskId    String?
  kind      String
  text      String
  link      String   @default("")
  byName    String   @default("")
  read      Boolean  @default(false)
  dedupe    String?  @unique
  createdAt DateTime @default(now())

  @@index([userId, read])
}
`;
const sql = `CREATE TABLE IF NOT EXISTS "TaskGroup" (
  "id" TEXT NOT NULL, "name" TEXT NOT NULL, "color" TEXT NOT NULL DEFAULT '#579bfc', "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskGroup_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "Task" (
  "id" TEXT NOT NULL, "groupId" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'not_started', "priority" TEXT NOT NULL DEFAULT 'medium', "ownerId" TEXT, "dueDate" TIMESTAMP(3),
  "link" TEXT NOT NULL DEFAULT '', "channelKey" TEXT NOT NULL DEFAULT '', "checklist" JSONB NOT NULL DEFAULT '[]',
  "position" DOUBLE PRECISION NOT NULL DEFAULT 0, "createdById" TEXT NOT NULL, "doneAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Task_groupId_idx" ON "Task"("groupId");
CREATE INDEX IF NOT EXISTS "Task_status_idx" ON "Task"("status");
CREATE TABLE IF NOT EXISTS "TaskActivity" (
  "id" TEXT NOT NULL, "taskId" TEXT NOT NULL, "userId" TEXT NOT NULL, "userName" TEXT NOT NULL, "kind" TEXT NOT NULL, "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaskActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TaskActivity_taskId_idx" ON "TaskActivity"("taskId");
CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "taskId" TEXT, "kind" TEXT NOT NULL, "text" TEXT NOT NULL,
  "link" TEXT NOT NULL DEFAULT '', "byName" TEXT NOT NULL DEFAULT '', "read" BOOLEAN NOT NULL DEFAULT false, "dedupe" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Notification_dedupe_key" ON "Notification"("dedupe");
CREATE INDEX IF NOT EXISTS "Notification_userId_read_idx" ON "Notification"("userId", "read");
`;

const edits = [
  ['components/Shell.tsx', [
    ['type LucideIcon }', 'ListChecks as TasksIcon, type LucideIcon }'],
    ['      { href: "/upc-check"', '      { href: "/tasks", label: "Team tasks", icon: TasksIcon, desc: "Board of team tasks with owners, status, due dates and notifications" },\n      { href: "/upc-check"'],
  ]],
  ['instrumentation.ts', [
    ["  job('inventory', 60_000, async () => { const { inventoryTick } = await import('./lib/inventory-jobs'); await inventoryTick(); });\n",
     "  job('inventory', 60_000, async () => { const { inventoryTick } = await import('./lib/inventory-jobs'); await inventoryTick(); });\n  job('taskdue', 60 * 60_000, async () => { const { dueTick } = await import('./lib/tasks'); await dueTick(); });\n"],
  ]],
  ['app/layout.tsx', [
    ['{children}', '{children}<NotifyBell />'],
  ]],
];
const out = {};
for (const [file, reps] of edits) {
  let s = fs.readFileSync(file, 'utf8');
  for (const [a, b] of reps) {
    if (s.includes(b)) continue;
    const n = s.split(a).length - 1;
    if (n !== 1) { console.log(`STOPPED: ${file} — "${a.trim().slice(0, 60)}" found ${n} times — tell Claude`); process.exit(1); }
    s = s.replace(a, () => b);
  }
  if (file === 'app/layout.tsx' && !s.includes("import NotifyBell")) s = "import NotifyBell from '@/components/NotifyBell';\n" + s;
  out[file] = s;
}
for (const [file, s] of Object.entries(out)) { fs.copyFileSync(file, file + '.bak'); fs.writeFileSync(file, s); console.log('OK', file); }
if (!done) { fs.copyFileSync(schemaFile, schemaFile + '.bak'); fs.writeFileSync(schemaFile, schema.trimEnd() + '\n' + model); console.log('OK prisma/schema.prisma'); } else console.log('already done prisma/schema.prisma');
const dir = 'prisma/migrations/20261012160000_team_tasks';
if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(`${dir}/migration.sql`, sql); console.log('OK', dir); } else console.log('already done', dir);
console.log('All done.');
