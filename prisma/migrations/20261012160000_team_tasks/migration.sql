CREATE TABLE IF NOT EXISTS "TaskGroup" (
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
