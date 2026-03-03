// Sidebar - Left navigation panel
import { store } from '../../store/store.js';
import { Modal } from '../common/Modal.js';
import { Toast } from '../common/Toast.js';
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
    '.md': '📄', '.txt': '🗒️',
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
          <img src="../assets/claudex.svg" alt="Claudex" class="w-8 h-8 rounded-lg" style="object-fit:contain;">
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
          <span>⌘</span><span>Workbench</span>
        </div>
        <div class="sidebar-nav-item" data-view="stt">
          <span>🎙️</span><span>STT (Voice)</span>
        </div>
      </nav>

      <div class="px-3 py-2 mt-2 flex-1 overflow-hidden flex flex-col" style="min-height:0;">
        <div class="flex items-center justify-between mb-2 flex-shrink-0">
          <span class="text-xs font-medium text-slate-500 uppercase tracking-wide">Projects</span>
          <span class="sidebar-project-count text-xs text-slate-500"></span>
        </div>
        <div class="sidebar-projects flex flex-col gap-0.5 overflow-y-auto flex-1" style="min-height:0;"></div>
      </div>

      <div class="flex-shrink-0 px-3 py-3 border-t border-slate-700 flex flex-col gap-2">
        <button class="btn-new-project w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 transition-all text-sm font-medium">
          <span>+</span><span>New Project</span>
        </button>
        <button class="btn-toggle-bottom-panel w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all text-sm font-medium"
                title="Bottom Terminal (⌘+\`)">
          <span>⌨️</span><span>Bottom Terminal</span>
        </button>
        <button class="btn-terminal-settings w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-slate-200 transition-all text-sm font-medium"
                title="Terminal Settings">
          <span>⚙️</span><span>Settings</span>
        </button>
        <button class="btn-open-source-licenses w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-slate-500 hover:text-slate-400 transition-all text-xs"
                title="Open Source Licenses">
          <span>📄</span><span>오픈소스 라이선스</span>
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

    // Open source licenses
    this.container.querySelector('.btn-open-source-licenses').addEventListener('click', () => {
      this._openLicensesModal();
    });

    // Search
    this.container.querySelector('.sidebar-search').addEventListener('input', (e) => {
      store.setState({ searchQuery: e.target.value });
    });

    // Close context menu on click outside
    document.addEventListener('click', () => this.closeContextMenu());
  }

  showContextMenu(e, folderPath, project) {
    e.preventDefault();
    this.closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'sidebar-context-menu';
    menu.style.left = `${e.clientX}px`;
    menu.style.top = `${e.clientY}px`;

    if (folderPath) {
      const revealItem = document.createElement('div');
      revealItem.className = 'sidebar-context-menu-item';
      revealItem.textContent = '📂 Reveal in Finder';
      revealItem.addEventListener('click', (ev) => {
        ev.stopPropagation();
        window.api.shell.revealInFinder(folderPath);
        this.closeContextMenu();
      });
      menu.appendChild(revealItem);
    }

    if (project) {
      const deleteItem = document.createElement('div');
      deleteItem.className = 'sidebar-context-menu-item';
      deleteItem.style.color = '#f87171';
      deleteItem.textContent = '🗑 Delete Project';
      deleteItem.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.closeContextMenu();
        this.confirmDeleteProject(project);
      });
      menu.appendChild(deleteItem);
    }

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

  confirmDeleteProject(project) {
    const modal = new Modal({
      title: '프로젝트 삭제',
      content: `<p class="text-slate-300">"<strong>${project.name}</strong>" 프로젝트를 삭제하시겠습니까?</p><p class="text-sm text-slate-500 mt-2">할 일, 노트, 타이머 기록이 모두 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</p>`,
      confirmText: '삭제',
      onConfirm: async () => {
        try {
          await window.api.projects.delete(project.id);
          this.filesCache.delete(project.id);
          this.expandedProjects.delete(project.id);
          const projects = await window.api.projects.list();
          store.setState({ projects, selectedProjectId: null });
          modal.close();
          Toast.show('프로젝트가 삭제되었습니다', 'info');
          if (this.onNavigate) this.onNavigate('dashboard');
        } catch (e) {
          Toast.show('프로젝트 삭제 실패', 'error');
        }
      },
    });
    modal.open();
    const confirmBtn = modal.overlay.querySelector('.modal-confirm-btn');
    if (confirmBtn) {
      confirmBtn.className = 'text-sm px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-all';
    }
  }

  listenToStore() {
    store.on('change:projects', () => this.renderProjects());
    store.on('change:selectedProjectId', () => this.renderProjects());
    store.on('change:searchQuery', () => this.renderProjects());
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
      const hasFiles = p.path || p.ssh_host;
      const toggleIcon = hasFiles ? `<span class="docs-toggle ${isExpanded ? 'expanded' : ''}" data-project-id="${p.id}" title="Files">›</span>` : '';

      item.innerHTML = `
        <span class="project-dot" style="background: ${p.color || '#6366f1'}"></span>
        <span class="truncate flex-1">${p.icon || ''} ${p.name}</span>
        ${p.ssh_host ? '<span class="ssh-badge" title="SSH Remote">SSH</span>' : ''}
        <span class="badge badge-${p.status} text-[10px]">${this.statusLabel(p.status)}</span>
        ${toggleIcon}
      `;

      // Project name click → detail
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('docs-toggle')) return;
        if (this.onNavigate) this.onNavigate('project-detail', { projectId: p.id });
      });

      // Right-click → context menu
      item.addEventListener('contextmenu', (e) => {
        const folderPath = (p.path && !p.ssh_host) ? p.path : null;
        this.showContextMenu(e, folderPath, p);
      });

      // File tree toggle click
      const toggle = item.querySelector('.docs-toggle');
      if (toggle) {
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          this.toggleProjectTree(p.id, p.path, wrapper, p);
        });
      }

      wrapper.appendChild(item);

      // Render expanded file tree if cached
      if (isExpanded && this.filesCache.has(p.id)) {
        const isRemote = !!p.ssh_host;
        const treeEl = this.renderFileTree(this.filesCache.get(p.id), p.id, p.path, 0, isRemote);
        wrapper.appendChild(treeEl);
      }

      listEl.appendChild(wrapper);
    });
  }

  async toggleProjectTree(projectId, projectPath, wrapper, project) {
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

    const isRemote = project && !!project.ssh_host;

    if (!this.filesCache.has(projectId)) {
      try {
        if (isRemote) {
          let remotePath = project.ssh_remote_path || '';
          if (!remotePath) {
            const homeDir = await window.api.remote.homeDir(projectId);
            if (homeDir && !homeDir.error) remotePath = homeDir;
            else remotePath = '/';
          }
          const result = await window.api.remote.listFiles(projectId, remotePath);
          if (result && result.error) throw new Error(result.error);
          this.filesCache.set(projectId, Array.isArray(result) ? result : []);
        } else {
          const files = await window.api.files.list(projectPath);
          this.filesCache.set(projectId, files);
        }
      } catch (e) {
        console.error('Failed to load file tree:', e);
        this.filesCache.set(projectId, []);
        // Show error in tree
        const errEl = document.createElement('div');
        errEl.className = 'sidebar-docs-tree';
        errEl.innerHTML = `<div class="sidebar-docs-item empty" style="padding-left:2rem;font-size:0.7rem;color:#f87171;">${isRemote ? 'SSH 연결 실패' : 'Error'}: ${e.message || 'Unknown'}</div>`;
        wrapper.appendChild(errEl);
        return;
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

    const treeEl = this.renderFileTree(files, projectId, projectPath, 0, isRemote);
    wrapper.appendChild(treeEl);
  }

  renderFileTree(files, projectId, projectPath, depth = 0, remote = false) {
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
        folderItem.addEventListener('click', async (e) => {
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
            if (toggleEl) toggleEl.classList.add('expanded');

            // Remote folders: lazy-load children on first expand
            if (remote && childrenContainer && childrenContainer.children.length === 0) {
              childrenContainer.innerHTML = '<div class="text-xs text-slate-500" style="padding-left:2rem;">Loading...</div>';
              childrenContainer.style.display = '';
              try {
                const children = await window.api.remote.listFiles(projectId, f.absolutePath);
                childrenContainer.innerHTML = '';
                if (children && !children.error && children.length > 0) {
                  const childTree = this.renderFileTree(children, projectId, projectPath, depth + 1, remote);
                  childrenContainer.appendChild(childTree);
                } else {
                  childrenContainer.innerHTML = '<div class="text-xs text-slate-500" style="padding-left:2rem;">(empty)</div>';
                }
              } catch (err) {
                childrenContainer.innerHTML = `<div class="text-xs text-red-400" style="padding-left:2rem;">Error: ${err.message}</div>`;
              }
              return;
            }

            if (childrenContainer && childrenContainer.classList.contains('sidebar-folder-children')) {
              childrenContainer.style.display = '';
            }
          }
        });

        // Right-click → Reveal in Finder (local only)
        if (!remote) {
          folderItem.addEventListener('contextmenu', (e) => this.showContextMenu(e, f.absolutePath));
        }

        tree.appendChild(folderItem);

        // Render children container
        const childrenContainer = document.createElement('div');
        childrenContainer.className = 'sidebar-folder-children';
        if (!isFolderExpanded) childrenContainer.style.display = 'none';
        if (f.children && f.children.length > 0) {
          const childTree = this.renderFileTree(f.children, projectId, projectPath, depth + 1, remote);
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
              this.onNavigate('docs-editor', { projectId, filePath: f.absolutePath, projectPath, remote });
            }
          });
        } else if (isPdf) {
          item.addEventListener('click', () => {
            if (this.onNavigate) {
              this.onNavigate('pdf-viewer', { projectId, filePath: f.absolutePath, projectPath, remote });
            }
          });
        } else if (!remote) {
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

  _openLicensesModal() {
    const licenses = [
      { name: 'Electron', url: 'https://github.com/electron/electron', license: 'MIT' },
      { name: 'whisper.cpp', url: 'https://github.com/ggml-org/whisper.cpp', license: 'MIT' },
      { name: 'OpenAI Whisper (모델)', url: 'https://github.com/openai/whisper', license: 'MIT' },
      { name: 'sherpa-onnx-node', url: 'https://github.com/k2-fsa/sherpa-onnx', license: 'Apache-2.0' },
      { name: '3D-Speaker / ERes2Net (모델)', url: 'https://github.com/modelscope/3D-Speaker', license: 'Apache-2.0' },
      { name: 'better-sqlite3', url: 'https://github.com/WiseLibs/better-sqlite3', license: 'MIT' },
      { name: 'node-pty', url: 'https://github.com/microsoft/node-pty', license: 'MIT' },
      { name: 'xterm.js', url: 'https://github.com/xtermjs/xterm.js', license: 'MIT' },
      { name: 'ssh2', url: 'https://github.com/mscdex/ssh2', license: 'MIT' },
      { name: 'uuid', url: 'https://github.com/uuidjs/uuid', license: 'MIT' },
      { name: 'electron-updater', url: 'https://github.com/electron-userland/electron-builder', license: 'MIT' },
    ];

    const rows = licenses.map(l => `
      <tr class="border-b border-slate-700/50">
        <td class="py-2 pr-3 text-sm text-slate-200">${l.name}</td>
        <td class="py-2 pr-3"><span class="text-xs px-2 py-0.5 rounded-full ${l.license === 'MIT' ? 'bg-emerald-600/20 text-emerald-400' : 'bg-blue-600/20 text-blue-400'}">${l.license}</span></td>
        <td class="py-2 text-xs text-slate-500 truncate" style="max-width:200px;">
          <a href="#" class="license-link hover:text-indigo-400 transition-colors" data-url="${l.url}">${l.url.replace('https://github.com/', '')}</a>
        </td>
      </tr>
    `).join('');

    const content = document.createElement('div');
    content.innerHTML = `
      <p class="text-xs text-slate-400 mb-3">이 앱은 아래 오픈소스 소프트웨어를 사용합니다.</p>
      <div style="max-height:360px;overflow-y:auto;">
        <table class="w-full">
          <thead>
            <tr class="border-b border-slate-600 text-left">
              <th class="pb-2 text-xs font-medium text-slate-400">이름</th>
              <th class="pb-2 text-xs font-medium text-slate-400">라이선스</th>
              <th class="pb-2 text-xs font-medium text-slate-400">저장소</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="text-xs text-slate-500 mt-3">MIT, Apache-2.0 라이선스는 상업적 사용, 수정, 재배포를 허용합니다.</p>
    `;

    const modal = new Modal({
      title: '📄 오픈소스 라이선스',
      content,
      confirmText: '닫기',
      showCancel: false,
      onConfirm: () => modal.close(),
    });
    modal.open();

    // Open links in external browser
    requestAnimationFrame(() => {
      content.querySelectorAll('.license-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          window.api.shell.openExternal(link.dataset.url);
        });
      });
    });
  }
}
