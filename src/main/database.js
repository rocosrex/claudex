'use strict';

const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');

let db = null;

// --- Init ---

function initDatabase(dbPath) {
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  createTables();
  runMigrations();
  return db;
}

function runMigrations() {
  // Add SSH columns to existing projects table
  const sshColumns = [
    { name: 'ssh_host', def: "TEXT DEFAULT ''" },
    { name: 'ssh_port', def: 'INTEGER DEFAULT 22' },
    { name: 'ssh_username', def: "TEXT DEFAULT ''" },
    { name: 'ssh_auth_type', def: "TEXT DEFAULT 'key'" },
    { name: 'ssh_password_encrypted', def: "TEXT DEFAULT ''" },
    { name: 'ssh_key_path', def: "TEXT DEFAULT ''" },
    { name: 'ssh_startup_command', def: "TEXT DEFAULT ''" },
    { name: 'ssh_remote_path', def: "TEXT DEFAULT ''" },
  ];

  const tableInfo = db.prepare("PRAGMA table_info('projects')").all();
  const existingColumns = new Set(tableInfo.map(c => c.name));

  for (const col of sshColumns) {
    if (!existingColumns.has(col.name)) {
      db.exec(`ALTER TABLE projects ADD COLUMN ${col.name} ${col.def}`);
    }
  }

  // Todo attachments table
  db.exec(`
    CREATE TABLE IF NOT EXISTS todo_attachments (
      id TEXT PRIMARY KEY,
      todo_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
    );
  `);
}

function getDB() {
  return db;
}

function createTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#6366f1',
      icon TEXT DEFAULT '📁',
      status TEXT DEFAULT 'active',
      kanban_stage TEXT DEFAULT 'backlog',
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      sort_order INTEGER DEFAULT 0,
      ssh_host TEXT DEFAULT '',
      ssh_port INTEGER DEFAULT 22,
      ssh_username TEXT DEFAULT '',
      ssh_auth_type TEXT DEFAULT 'key',
      ssh_password_encrypted TEXT DEFAULT '',
      ssh_key_path TEXT DEFAULT '',
      ssh_startup_command TEXT DEFAULT '',
      ssh_remote_path TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT '',
      completed INTEGER DEFAULT 0,
      priority TEXT DEFAULT 'medium',
      due_date TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT DEFAULT '',
      type TEXT DEFAULT 'memo',
      tags TEXT DEFAULT '[]',
      pinned INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS time_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      description TEXT DEFAULT '',
      started_at DATETIME DEFAULT (datetime('now')),
      ended_at DATETIME,
      duration_minutes INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now')),
      updated_at DATETIME DEFAULT (datetime('now')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_logs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      action TEXT NOT NULL,
      detail TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now'))
    );
  `);
}

// --- Projects ---

function listProjects() {
  return db.prepare('SELECT * FROM projects ORDER BY sort_order ASC, created_at DESC').all();
}

function getProject(id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) || null;
}

function createProject(data) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO projects (id, name, path, description, color, icon, status, kanban_stage, created_at, updated_at, sort_order,
      ssh_host, ssh_port, ssh_username, ssh_auth_type, ssh_password_encrypted, ssh_key_path, ssh_startup_command, ssh_remote_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    data.name || 'Untitled',
    data.path || '',
    data.description || '',
    data.color || '#6366f1',
    data.icon || '📁',
    data.status || 'active',
    data.kanban_stage || 'backlog',
    now,
    now,
    data.sort_order || 0,
    data.ssh_host || '',
    data.ssh_port || 22,
    data.ssh_username || '',
    data.ssh_auth_type || 'key',
    data.ssh_password_encrypted || '',
    data.ssh_key_path || '',
    data.ssh_startup_command || '',
    data.ssh_remote_path || ''
  );
  addActivity(id, 'project_created', `Project "${data.name}" created`);
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function updateProject(id, data) {
  const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!existing) return null;

  const fields = ['name', 'path', 'description', 'color', 'icon', 'status', 'kanban_stage', 'sort_order',
    'ssh_host', 'ssh_port', 'ssh_username', 'ssh_auth_type', 'ssh_password_encrypted', 'ssh_key_path', 'ssh_startup_command', 'ssh_remote_path'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(data[field]);
    }
  }

  if (updates.length === 0) return existing;

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  addActivity(id, 'project_updated', `Project updated`);
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

function deleteProject(id) {
  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return false;
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return true;
}

// --- Todos ---

function listTodos(projectId) {
  return db.prepare('SELECT * FROM todos WHERE project_id = ? ORDER BY sort_order ASC, created_at DESC').all(projectId);
}

function createTodo(projectId, data) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO todos (id, project_id, title, description, completed, priority, due_date, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    projectId,
    data.title || 'Untitled',
    data.description || '',
    data.completed ? 1 : 0,
    data.priority || 'medium',
    data.due_date || null,
    data.sort_order || 0,
    now,
    now
  );
  addActivity(projectId, 'todo_created', `Todo "${data.title}" added`);
  return db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
}

function updateTodo(id, data) {
  const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  if (!existing) return null;

  const fields = ['title', 'description', 'completed', 'priority', 'due_date', 'sort_order'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (data[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(field === 'completed' ? (data[field] ? 1 : 0) : data[field]);
    }
  }

  if (updates.length === 0) return existing;

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  if (data.completed !== undefined) {
    addActivity(existing.project_id, data.completed ? 'todo_completed' : 'todo_uncompleted', `Todo "${existing.title}"`);
  }

  return db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
}

function deleteTodo(id) {
  const todo = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
  if (!todo) return false;
  db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  addActivity(todo.project_id, 'todo_deleted', `Todo "${todo.title}" deleted`);
  return true;
}

// --- Notes ---

function listNotes(projectId) {
  return db.prepare('SELECT * FROM notes WHERE project_id = ? ORDER BY pinned DESC, created_at DESC').all(projectId);
}

function createNote(projectId, data) {
  const id = uuidv4();
  const now = new Date().toISOString();
  const tags = Array.isArray(data.tags) ? JSON.stringify(data.tags) : (data.tags || '[]');
  const stmt = db.prepare(`
    INSERT INTO notes (id, project_id, title, content, type, tags, pinned, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    projectId,
    data.title || 'Untitled',
    data.content || '',
    data.type || 'memo',
    tags,
    data.pinned ? 1 : 0,
    now,
    now
  );
  addActivity(projectId, 'note_created', `Note "${data.title}" created`);
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
}

function updateNote(id, data) {
  const existing = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!existing) return null;

  const fields = ['title', 'content', 'type', 'tags', 'pinned'];
  const updates = [];
  const values = [];

  for (const field of fields) {
    if (data[field] !== undefined) {
      if (field === 'tags' && Array.isArray(data[field])) {
        updates.push(`${field} = ?`);
        values.push(JSON.stringify(data[field]));
      } else if (field === 'pinned') {
        updates.push(`${field} = ?`);
        values.push(data[field] ? 1 : 0);
      } else {
        updates.push(`${field} = ?`);
        values.push(data[field]);
      }
    }
  }

  if (updates.length === 0) return existing;

  updates.push("updated_at = datetime('now')");
  values.push(id);

  db.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
}

function deleteNote(id) {
  const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  if (!note) return false;
  db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  addActivity(note.project_id, 'note_deleted', `Note "${note.title}" deleted`);
  return true;
}

// --- Time Logs ---

function listTimeLogs(projectId) {
  return db.prepare('SELECT * FROM time_logs WHERE project_id = ? ORDER BY started_at DESC').all(projectId);
}

function startTimeLog(projectId, description) {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO time_logs (id, project_id, description, started_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, projectId, description || '', now, now, now);
  addActivity(projectId, 'timer_started', `Timer started: ${description || '(no description)'}`);
  return db.prepare('SELECT * FROM time_logs WHERE id = ?').get(id);
}

function stopTimeLog(id) {
  const log = db.prepare('SELECT * FROM time_logs WHERE id = ?').get(id);
  if (!log) return null;
  if (log.ended_at) return log;

  const now = new Date().toISOString();
  const startedAt = new Date(log.started_at);
  const endedAt = new Date(now);
  const durationMinutes = Math.round((endedAt - startedAt) / 60000);

  db.prepare(`
    UPDATE time_logs SET ended_at = ?, duration_minutes = ?, updated_at = ? WHERE id = ?
  `).run(now, durationMinutes, now, id);

  addActivity(log.project_id, 'timer_stopped', `Timer stopped (${durationMinutes} min)`);
  return db.prepare('SELECT * FROM time_logs WHERE id = ?').get(id);
}

// --- Activity ---

function addActivity(projectId, action, detail) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO activity_logs (id, project_id, action, detail, created_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `).run(id, projectId, action, detail || '');
}

function listActivity(projectId, limit = 50) {
  if (projectId) {
    return db.prepare('SELECT * FROM activity_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?').all(projectId, limit);
  }
  return db.prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ?').all(limit);
}

// --- Attachments ---

function listAttachments(todoId) {
  return db.prepare('SELECT * FROM todo_attachments WHERE todo_id = ? ORDER BY created_at ASC').all(todoId);
}

function addAttachment(todoId, filePath, fileName) {
  const id = uuidv4();
  db.prepare(`
    INSERT INTO todo_attachments (id, todo_id, file_path, file_name)
    VALUES (?, ?, ?, ?)
  `).run(id, todoId, filePath, fileName);
  return db.prepare('SELECT * FROM todo_attachments WHERE id = ?').get(id);
}

function removeAttachment(id) {
  const att = db.prepare('SELECT * FROM todo_attachments WHERE id = ?').get(id);
  if (!att) return false;
  db.prepare('DELETE FROM todo_attachments WHERE id = ?').run(id);
  return true;
}

// --- Stats ---

function getDashboardStats() {
  const totalProjects = db.prepare('SELECT COUNT(*) as count FROM projects').get().count;
  const activeProjects = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'active'").get().count;
  const completedProjects = db.prepare("SELECT COUNT(*) as count FROM projects WHERE status = 'completed'").get().count;

  const totalTodos = db.prepare('SELECT COUNT(*) as count FROM todos').get().count;
  const completedTodos = db.prepare('SELECT COUNT(*) as count FROM todos WHERE completed = 1').get().count;
  const pendingTodos = totalTodos - completedTodos;

  const totalNotes = db.prepare('SELECT COUNT(*) as count FROM notes').get().count;

  const totalTimeMinutes = db.prepare('SELECT COALESCE(SUM(duration_minutes), 0) as total FROM time_logs').get().total;

  const runningTimers = db.prepare('SELECT COUNT(*) as count FROM time_logs WHERE ended_at IS NULL').get().count;

  const kanbanCounts = {
    backlog: db.prepare("SELECT COUNT(*) as count FROM projects WHERE kanban_stage = 'backlog'").get().count,
    in_progress: db.prepare("SELECT COUNT(*) as count FROM projects WHERE kanban_stage = 'in_progress'").get().count,
    review: db.prepare("SELECT COUNT(*) as count FROM projects WHERE kanban_stage = 'review'").get().count,
    done: db.prepare("SELECT COUNT(*) as count FROM projects WHERE kanban_stage = 'done'").get().count,
  };

  const recentActivity = listActivity(null, 10);

  return {
    totalProjects,
    activeProjects,
    completedProjects,
    totalTodos,
    completedTodos,
    pendingTodos,
    totalNotes,
    totalTimeMinutes,
    runningTimers,
    kanbanCounts,
    recentActivity,
  };
}

module.exports = {
  initDatabase,
  getDB,
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  listTodos,
  createTodo,
  updateTodo,
  deleteTodo,
  listNotes,
  createNote,
  updateNote,
  deleteNote,
  listTimeLogs,
  startTimeLog,
  stopTimeLog,
  addActivity,
  listActivity,
  getDashboardStats,
  listAttachments,
  addAttachment,
  removeAttachment,
};
