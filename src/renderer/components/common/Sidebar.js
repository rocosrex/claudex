// Sidebar - Left navigation panel
import { store } from '../../store/store.js';
import { TerminalSettingsModal } from '../terminal/TerminalSettingsModal.js';

const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.js', '.jsx', '.ts', '.tsx', '.json', '.css', '.scss',
  '.html', '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.sh', '.bash', '.zsh', '.fish', '.py', '.rb', '.rs', '.go', '.java',
  '.kt', '.swift', '.c', '.cpp', '.h', '.hpp', '.cs', '.lua', '.sql',
  '.graphql', '.prisma', '.env', '.gitignore', '.dockerfile', '.makefile',
  '.cmake', '.gradle', '.properties', '.svg', '.lock', '.log',
]);

function isTextFile(name) {
  const lower = name.toLowerCase();
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx === -1) return false;
  return TEXT_EXTENSIONS.has(lower.slice(dotIdx));
}

function isPdfFile(name) {
  return name.toLowerCase().endsWith('.pdf');
}

function getFileIcon(name) {
  const lower = name.toLowerCase();
  const ext = lower.slice(lower.lastIndexOf('.'));
  const map = {
    '.js': '📜', '.jsx': '📜', '.ts': '📘', '.tsx': '📘',
    '.json': '📋', '.css': '🎨', '.scss': '🎨', '.html': '🌐', '.xml': '🌐',
    '.md': '📝', '.txt': '📄',
    '.py': '🐍', '.rb': '💎', '.rs': '🦀', '.go': '🔵',
    '.java': '☕', '.kt': '🟣', '.swift': '🧡', '.c': '⚙️', '.cpp': '⚙️',
    '.h': '⚙️', '.hpp': '⚙️', '.cs': '🟢',
    '.sh': '🔧', '.bash': '🔧', '.zsh': '🔧',
    '.yaml': '⚙️', '.yml': '⚙️', '.toml': '⚙️', '.ini': '⚙️',
    '.pdf': '📕',
    '.sql': '🗃️', '.graphql': '🔗', '.prisma': '🔗',
    '.svg': '🖼️', '.gitignore': '🚫', '.env': '🔒',
    '.lock': '🔒', '.log': '📃',
  };
  return map[ext] || '📄';
}

export class Sidebar {
  constructor() {
    this.container = null;
    this.onNavigate = null; // set by App
    this.expandedProjects = new Set();
    this.expandedFolders = new Set();
    this.filesCache = new Map();
  }

  render() {
    const el = document.createElement('aside');
    el.className = 'sidebar';
    el.innerHTML = `
      <div class="titlebar-drag pt-10 px-4 pb-2">
        <div class="flex items-center gap-2 titlebar-no-drag">
          <div class="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">C</div>
          <h1 class="text-lg font-semibold text-slate-100">Claudex</h1>
        </div>
      </div>

      <div class="px-3 py-2">
        <input type="text" class="sidebar-search input text-sm" placeholder="Search..." />
      </div>

      <nav class="px-3 py-1 flex flex-col gap-0.5">
        <div class="sidebar-nav-item active" data-view="dashboard">
          <span>📊</span><span>Dashboard</span>
        </div>
        <div class="sidebar-nav-item" data-view="kanban">
          <span>📋</span><span>Kanban Board</span>
        </div>
        <div class="sidebar-nav-item" data-view="terminal">
          <span>🖥</span><span>Terminal</span>
        </div>
      </nav>

      <div class="px-3 py-2 mt-2">
        <div class="flex items-center justify-between mb-2">
          <span class="text-xs font-medium text-slate-500 uppercase tracking-wide">Projects</span>
          <span class="sidebar-project-count text-xs text-slate-500"></span>
        </div>
        <div class="sidebar-projects flex flex-col gap-0.5 overflow-y-auto" style="max-height: calc(100vh - 320px);"></div>
      </div>

      <div class="mt-auto px-3 py-3 border-t border-slate-700 flex flex-col gap-2">
        <button class="btn-toggle-bottom-panel w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all text-sm font-medium"
                title="Bottom Terminal (⌘+\`)">
          <span>⌨️</span><span>Bottom Terminal</span>
        </button>
        <button class="btn-new-project w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 transition-all text-sm font-medium">
          <span>+</span><span>New Project</span>
        </button>
        <button class="btn-terminal-settings w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all text-sm font-medium"
                title="Terminal Settings">
          <span>⚙️</span><span>Settings</span>
        </button>
      </div>
    `;

    this.container = el;
    this.setupEvents();
    this.listenToStore();
    this.loadProjects();

    return el;
  }

  setupEvents() {
    // Navigation items
    this.container.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const view = item.dataset.view;
        if (this.onNavigate) this.onNavigate(view);
        this.setActiveNav(view);
      });
    });

    // New project button
    this.container.querySelector('.btn-new-project').addEventListener('click', () => {
      store.emit('open-project-form', { mode: 'create' });
    });

    // Bottom terminal panel toggle
    this.container.querySelector('.btn-toggle-bottom-panel').addEventListener('click', () => {
      store.emit('toggle-bottom-panel');
    });

    // Terminal settings
    this.container.querySelector('.btn-terminal-settings').addEventListener('click', () => {
      const modal = new TerminalSettingsModal();
      modal.open();
    });

    // Search
    this.container.querySelector('.sidebar-search').addEventListener('input', (e) => {
      store.setState({ searchQuery: e.target.value });
    });

    // Close context menu on click outside
    document.addEventListener('click', () => this.closeContextMenu());
  }

  showContextMenu(e, folderPath) {
    e.preventDefault();
    if (!folderPath) return;
    this.closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'sidebar-context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    const item = document.createElement('div');
    item.className = 'sidebar-context-menu-item';
    item.textContent = '📂 Reveal in Finder';
    item.addEventListener('click', (ev) => {
      ev.stopPropagation();
      window.api.shell.revealInFinder(folderPath);
      this.closeContextMenu();
    });
    menu.appendChild(item);

    document.body.appendChild(menu);
    this.activeContextMenu = menu;

    // Adjust position if menu goes off-screen
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 8}px`;
      if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 8}px`;
    });
  }

  closeContextMenu() {
    if (this.activeContextMenu) {
      this.activeContextMenu.remove();
      this.activeContextMenu = null;
    }
  }

  listenToStore() {
    store.on('change:projects', () => this.renderProjects());
    store.on('change:selectedProjectId', () => this.renderProjects());
    store.on('change:currentView', (view) => this.setActiveNav(view));
  }

  async loadProjects() {
    try {
      const projects = await window.api.projects.list();
      store.setState({ projects });
    } catch (e) {
      console.error('Failed to load projects:', e);
    }
  }

  renderProjects() {
    const listEl = this.container.querySelector('.sidebar-projects');
    const countEl = this.container.querySelector('.sidebar-project-count');
    const { projects, selectedProjectId, searchQuery } = store.getState();

    let filtered = projects;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = projects.filter(p =>
        p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)
      );
    }

    const activeProjects = filtered.filter(p => p.status !== 'archived');
    countEl.textContent = `${activeProjects.length}`;

    listEl.innerHTML = '';
    activeProjects.forEach(p => {
      const wrapper = document.createElement('div');

      const item = document.createElement('div');
      item.className = `sidebar-project-item ${p.id === selectedProjectId ? 'active' : ''}`;

      const isExpanded = this.expandedProjects.has(p.id);
      const toggleIcon = p.path ? `<span class="docs-toggle ${isExpanded ? 'expanded' : ''}" data-project-id="${p.id}" title="Files">▸</span>` : '';

      item.innerHTML = `
        <span class="project-dot" style="background: ${p.color || '#6366f1'}"></span>
        <span class="truncate flex-1">${p.icon || ''} ${p.name}</span>
        <span class="badge badge-${p.status} text-[10px]">${this.statusLabel(p.status)}</span>
        ${toggleIcon}
      `;

      // Project name click → detail
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('docs-toggle')) return;
        if (this.onNavigate) this.onNavigate('project-detail', { projectId: p.id });
      });

      // Right-click → context menu (Reveal in Finder)
      item.addEventListener('contextmenu', (e) => this.showContextMenu(e, p.path));

      // File tree toggle click
      const toggle = item.querySelector('.docs-toggle');
      if (toggle) {
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleProjectTree(p.id, p.path, wrapper);
        });
      }

      wrapper.appendChild(item);

      // Render expanded file tree if cached
      if (isExpanded && this.filesCache.has(p.id)) {
        const treeEl = this.renderFileTree(this.filesCache.get(p.id), p.id, p.path);
        wrapper.appendChild(treeEl);
      }

      listEl.appendChild(wrapper);
    });
  }

  async toggleProjectTree(projectId, projectPath, wrapper) {
    if (this.expandedProjects.has(projectId)) {
      this.expandedProjects.delete(projectId);
      const tree = wrapper.querySelector('.sidebar-docs-tree');
      if (tree) tree.remove();
      const toggle = wrapper.querySelector('.docs-toggle');
      if (toggle) toggle.classList.remove('expanded');
      return;
    }

    this.expandedProjects.add(projectId);
    const toggle = wrapper.querySelector('.docs-toggle');
    if (toggle) toggle.classList.add('expanded');

    if (!this.filesCache.has(projectId)) {
      try {
        const files = await window.api.files.list(projectPath);
        this.filesCache.set(projectId, files);
      } catch (e) {
        this.filesCache.set(projectId, []);
      }
    }

    const files = this.filesCache.get(projectId);
    if (files.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sidebar-docs-tree';
      empty.innerHTML = `<div class="sidebar-docs-item empty" style="padding-left:2rem;font-size:0.7rem;color:var(--color-text-secondary);">(empty)</div>`;
      wrapper.appendChild(empty);
      return;
    }

    const treeEl = this.renderFileTree(files, projectId, projectPath);
    wrapper.appendChild(treeEl);
  }

  renderFileTree(files, projectId, projectPath, depth = 0) {
    const tree = document.createElement('div');
    if (depth === 0) tree.className = 'sidebar-docs-tree';

    files.forEach(f => {
      if (f.isDirectory) {
        const folderItem = document.createElement('div');
        folderItem.className = 'sidebar-docs-item sidebar-folder-item';
        folderItem.style.paddingLeft = `${1.5 + depth * 0.75}rem`;

        const isFolderExpanded = this.expandedFolders.has(f.absolutePath);
        folderItem.innerHTML = `<span class="folder-toggle ${isFolderExpanded ? 'expanded' : ''}">▸</span><span class="docs-folder-icon">📁</span> <span class="folder-name">${f.name}</span>`;

        // Click → toggle folder expand/collapse
        folderItem.addEventListener('click', (e) => {
          e.stopPropagation();
          const childrenContainer = folderItem.nextElementSibling;
          const toggleEl = folderItem.querySelector('.folder-toggle');
          if (this.expandedFolders.has(f.absolutePath)) {
            this.expandedFolders.delete(f.absolutePath);
            if (childrenContainer && childrenContainer.classList.contains('sidebar-folder-children')) {
              childrenContainer.style.display = 'none';
            }
            if (toggleEl) toggleEl.classList.remove('expanded');
          } else {
            this.expandedFolders.add(f.absolutePath);
            if (childrenContainer && childrenContainer.classList.contains('sidebar-folder-children')) {
              childrenContainer.style.display = '';
            }
            if (toggleEl) toggleEl.classList.add('expanded');
          }
        });

        // Right-click → Reveal in Finder
        folderItem.addEventListener('contextmenu', (e) => this.showContextMenu(e, f.absolutePath));

        tree.appendChild(folderItem);

        // Render children container
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'sidebar-folder-children';
        if (!isFolderExpanded) childrenContainer.style.display = 'none';
        if (f.children && f.children.length > 0) {
          const childTree = this.renderFileTree(f.children, projectId, projectPath, depth + 1);
          childrenContainer.appendChild(childTree);
        }
        tree.appendChild(childrenContainer);
      } else {
        const item = document.createElement('div');
        const isText = isTextFile(f.name);
        const isPdf = isPdfFile(f.name);
        const isClickable = isText || isPdf;
        item.className = `sidebar-docs-item sidebar-file-item ${isClickable ? '' : 'file-disabled'}`;
        item.style.paddingLeft = `${1.5 + depth * 0.75}rem`;

        const icon = isText ? getFileIcon(f.name) : (isPdf ? '📕' : '📎');
        item.innerHTML = `<span class="docs-file-icon">${icon}</span> ${f.name}`;

        if (isText) {
          item.addEventListener('click', () => {
            if (this.onNavigate) {
              this.onNavigate('docs-editor', { projectId, filePath: f.absolutePath, projectPath });
            }
          });
        } else if (isPdf) {
          item.addEventListener('click', () => {
            if (this.onNavigate) {
              this.onNavigate('pdf-viewer', { projectId, filePath: f.absolutePath, projectPath });
            }
          });
        } else {
          item.addEventListener('click', () => {
            window.api.shell.revealInFinder(f.absolutePath);
          });
        }

        tree.appendChild(item);
      }
    });

    return tree;
  }

  setActiveNav(view) {
    this.container.querySelectorAll('.sidebar-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === view);
    });
  }

  statusLabel(status) {
    const labels = { active: 'Active', paused: 'Paused', completed: 'Done', archived: 'Archived' };
    return labels[status] || status;
  }
}
