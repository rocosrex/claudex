// ProjectForm - Create/Edit project modal form
import { Modal } from '../common/Modal.js';
import { Toast } from '../common/Toast.js';
import { store } from '../../store/store.js';

const PRESET_COLORS = [
  '#6366f1', '#3b82f6', '#06b6d4', '#22c55e',
  '#eab308', '#f97316', '#ef4444', '#a855f7',
];

const PRESET_ICONS = [
  '📁', '🚀', '💻', '🎮', '🌐', '📱', '🔧', '📊',
  '🎨', '📚', '🔬', '🛠', '💡', '🎯', '⚡', '🏗',
];

export class ProjectForm {
  constructor({ mode = 'create', project = null, onSaved } = {}) {
    this.mode = mode;
    this.project = project;
    this.onSaved = onSaved;
    this.modal = null;
  }

  open() {
    const form = this.buildForm();
    this.modal = new Modal({
      title: this.mode === 'create' ? 'New Project' : 'Edit Project',
      content: form,
      confirmText: this.mode === 'create' ? 'Create' : 'Save',
      onConfirm: () => this.handleSubmit(),
    });
    this.modal.open();
  }

  buildForm() {
    const p = this.project || {};
    const el = document.createElement('div');
    el.className = 'flex flex-col gap-4';

    el.innerHTML = `
      <div>
        <label class="block text-sm text-slate-400 mb-1">Project Name *</label>
        <input type="text" name="name" class="input" placeholder="Project name" value="${p.name || ''}" />
      </div>

      <div>
        <label class="block text-sm text-slate-400 mb-1 path-label">Path</label>
        <div class="flex gap-2">
          <input type="text" name="path" class="input flex-1" placeholder="/Users/..." value="${p.ssh_host ? (p.ssh_remote_path || '') : (p.path || '')}" readonly />
          <button class="btn-select-folder btn-secondary whitespace-nowrap">Browse</button>
        </div>
        <p class="path-hint text-xs text-slate-500 mt-1" style="display:none;"></p>
      </div>

      <div>
        <div class="flex items-center justify-between mb-1">
          <label class="text-sm text-slate-400">Description <span class="text-xs text-slate-500">(Markdown)</span></label>
          <button type="button" class="btn-preview-toggle text-xs text-indigo-400 hover:text-indigo-300">Preview</button>
        </div>
        <textarea name="description" class="input font-mono text-sm" style="min-height: 120px;" placeholder="# Title&#10;Write description in Markdown...">${p.description || ''}</textarea>
        <div class="description-preview hidden mt-2 p-3 rounded-lg bg-slate-900 border border-slate-700 max-h-48 overflow-y-auto markdown-body"></div>
      </div>

      <div>
        <label class="block text-sm text-slate-400 mb-1">Color</label>
        <div class="color-picker flex gap-2 flex-wrap"></div>
      </div>

      <div>
        <label class="block text-sm text-slate-400 mb-1">Icon</label>
        <div class="icon-picker flex gap-2 flex-wrap"></div>
      </div>

      <div>
        <label class="block text-sm text-slate-400 mb-1">Status</label>
        <select name="status" class="input">
          <option value="active" ${p.status === 'active' ? 'selected' : ''}>Active</option>
          <option value="paused" ${p.status === 'paused' ? 'selected' : ''}>Paused</option>
          <option value="completed" ${p.status === 'completed' ? 'selected' : ''}>Done</option>
          <option value="archived" ${p.status === 'archived' ? 'selected' : ''}>Archived</option>
        </select>
      </div>

      <!-- SSH Settings -->
      <div class="ssh-settings">
        <div class="ssh-settings-header">
          <span>🔒 SSH Remote Settings</span>
          <span class="ssh-toggle-icon text-xs">${p.ssh_host ? '▼' : '▶'}</span>
        </div>
        <div class="ssh-settings-body ${p.ssh_host ? '' : 'hidden'}">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-slate-500 mb-1">Host *</label>
              <input type="text" name="ssh_host" class="input text-sm" placeholder="192.168.1.100" value="${p.ssh_host || ''}" />
            </div>
            <div>
              <label class="block text-xs text-slate-500 mb-1">Port</label>
              <input type="number" name="ssh_port" class="input text-sm" placeholder="22" value="${p.ssh_port || 22}" />
            </div>
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">Username *</label>
            <input type="text" name="ssh_username" class="input text-sm" placeholder="user" value="${p.ssh_username || ''}" />
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">Auth Method</label>
            <div class="ssh-auth-toggle">
              <div class="auth-option ${(p.ssh_auth_type || 'key') === 'key' ? 'active' : ''}" data-auth="key">🔑 SSH Key</div>
              <div class="auth-option ${p.ssh_auth_type === 'password' ? 'active' : ''}" data-auth="password">🔐 Password</div>
            </div>
          </div>
          <div class="ssh-key-section ${(p.ssh_auth_type || 'key') === 'key' ? '' : 'hidden'}">
            <label class="block text-xs text-slate-500 mb-1">SSH Key Path</label>
            <div class="flex gap-2">
              <input type="text" name="ssh_key_path" class="input text-sm flex-1" placeholder="~/.ssh/id_rsa" value="${p.ssh_key_path || ''}" readonly />
              <button type="button" class="btn-select-key btn-secondary text-sm whitespace-nowrap">Browse</button>
            </div>
          </div>
          <div class="ssh-password-section ${p.ssh_auth_type === 'password' ? '' : 'hidden'}">
            <label class="block text-xs text-slate-500 mb-1">Password</label>
            <input type="password" name="ssh_password" class="input text-sm" placeholder="Enter password" value="" />
            ${p.ssh_password_encrypted ? '<p class="text-xs text-slate-500 mt-1">Password saved. Enter new one to change.</p>' : ''}
          </div>
          <div>
            <label class="block text-xs text-slate-500 mb-1">Startup Command</label>
            <input type="text" name="ssh_startup_command" class="input text-sm" placeholder="cd /app && ls" value="${p.ssh_startup_command || ''}" />
          </div>
          <div class="flex gap-2 mt-1">
            <button type="button" class="btn-test-ssh btn-secondary text-sm flex-1">🔌 Test Connection</button>
          </div>
          <div class="ssh-test-result hidden text-xs p-2 rounded-lg mt-1"></div>
        </div>
      </div>
    `;

    // Color picker
    const colorPicker = el.querySelector('.color-picker');
    const selectedColor = p.color || PRESET_COLORS[0];
    PRESET_COLORS.forEach(color => {
      const dot = document.createElement('div');
      dot.className = `color-option ${color === selectedColor ? 'selected' : ''}`;
      dot.style.background = color;
      dot.dataset.color = color;
      dot.addEventListener('click', () => {
        colorPicker.querySelectorAll('.color-option').forEach(d => d.classList.remove('selected'));
        dot.classList.add('selected');
      });
      colorPicker.appendChild(dot);
    });

    // Icon picker
    const iconPicker = el.querySelector('.icon-picker');
    const selectedIcon = p.icon || PRESET_ICONS[0];
    PRESET_ICONS.forEach(icon => {
      const btn = document.createElement('div');
      btn.className = `w-8 h-8 flex items-center justify-center rounded cursor-pointer text-lg transition-all ${icon === selectedIcon ? 'bg-slate-600 ring-2 ring-indigo-500' : 'hover:bg-slate-700'}`;
      btn.textContent = icon;
      btn.dataset.icon = icon;
      btn.addEventListener('click', () => {
        iconPicker.querySelectorAll('div').forEach(d => {
          d.classList.remove('bg-slate-600', 'ring-2', 'ring-indigo-500');
        });
        btn.classList.add('bg-slate-600', 'ring-2', 'ring-indigo-500');
      });
      iconPicker.appendChild(btn);
    });

    // Markdown preview toggle
    const previewBtn = el.querySelector('.btn-preview-toggle');
    const previewEl = el.querySelector('.description-preview');
    const descTextarea = el.querySelector('textarea[name="description"]');
    previewBtn.addEventListener('click', () => {
      const isHidden = previewEl.classList.contains('hidden');
      if (isHidden) {
        const md = descTextarea.value.trim();
        previewEl.innerHTML = md ? window.marked.parse(md) : '<span class="text-slate-500">No content</span>';
        previewEl.classList.remove('hidden');
        previewBtn.textContent = 'Edit';
      } else {
        previewEl.classList.add('hidden');
        previewBtn.textContent = 'Preview';
      }
    });

    // Folder select button (local or remote depending on SSH state)
    const pathInput = el.querySelector('input[name="path"]');
    const pathLabel = el.querySelector('.path-label');
    const pathHint = el.querySelector('.path-hint');
    const btnSelectFolder = el.querySelector('.btn-select-folder');

    btnSelectFolder.addEventListener('click', async () => {
      if (this._sshConnected && this._sshConfig) {
        // Open remote directory browser
        const startPath = pathInput.value || this._sshHomeDir || '~';
        this.openRemoteBrowser(startPath, pathInput);
      } else {
        // Local folder picker
        try {
          const result = await window.api.projects.selectFolder();
          if (result) {
            pathInput.value = result;
          }
        } catch (e) {
          Toast.show('Failed to select folder', 'error');
        }
      }
    });

    // SSH settings toggle
    const sshHeader = el.querySelector('.ssh-settings-header');
    const sshBody = el.querySelector('.ssh-settings-body');
    const sshToggleIcon = el.querySelector('.ssh-toggle-icon');
    sshHeader.addEventListener('click', () => {
      const isHidden = sshBody.classList.contains('hidden');
      sshBody.classList.toggle('hidden');
      sshToggleIcon.textContent = isHidden ? '▼' : '▶';
    });

    // SSH auth type toggle
    el.querySelectorAll('.auth-option').forEach(opt => {
      opt.addEventListener('click', () => {
        el.querySelectorAll('.auth-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        const authType = opt.dataset.auth;
        el.querySelector('.ssh-key-section').classList.toggle('hidden', authType !== 'key');
        el.querySelector('.ssh-password-section').classList.toggle('hidden', authType !== 'password');
      });
    });

    // SSH key file selector
    const btnSelectKey = el.querySelector('.btn-select-key');
    if (btnSelectKey) {
      btnSelectKey.addEventListener('click', async () => {
        try {
          const result = await window.api.security.selectKeyFile();
          if (result) {
            el.querySelector('input[name="ssh_key_path"]').value = result;
          }
        } catch (e) {
          Toast.show('Failed to select key file', 'error');
        }
      });
    }

    // SSH Test Connection
    const btnTestSSH = el.querySelector('.btn-test-ssh');
    const testResult = el.querySelector('.ssh-test-result');

    const getSSHConfigFromForm = async () => {
      const host = el.querySelector('input[name="ssh_host"]').value.trim();
      const port = parseInt(el.querySelector('input[name="ssh_port"]').value) || 22;
      const username = el.querySelector('input[name="ssh_username"]').value.trim();
      const activeAuthOpt = el.querySelector('.auth-option.active');
      const authType = activeAuthOpt ? activeAuthOpt.dataset.auth : 'key';
      const keyPath = el.querySelector('input[name="ssh_key_path"]').value.trim();
      const passwordField = el.querySelector('input[name="ssh_password"]').value;

      if (!host || !username) {
        throw new Error('Host and Username are required');
      }

      // Decrypt existing password if no new one entered
      let password = passwordField;
      if (!password && this.project?.ssh_password_encrypted) {
        try {
          password = await window.api.security.decryptPassword(this.project.ssh_password_encrypted);
        } catch (e) { /* ignore */ }
      }

      return { host, port, username, authType, keyPath, password };
    };

    btnTestSSH.addEventListener('click', async () => {
      testResult.classList.remove('hidden');
      testResult.style.background = 'rgba(100,116,139,0.2)';
      testResult.style.color = '#94a3b8';
      testResult.textContent = '⏳ Connecting...';
      btnTestSSH.disabled = true;

      try {
        const sshConfig = await getSSHConfigFromForm();
        const result = await window.api.remote.testConnection(sshConfig);

        if (result.error) throw new Error(result.error);

        testResult.style.background = 'rgba(34,197,94,0.1)';
        testResult.style.color = '#4ade80';
        testResult.textContent = `✅ Connected! Home: ${result.homeDir}`;

        // Store config and switch Path to remote mode
        this._sshConfig = sshConfig;
        this._sshHomeDir = result.homeDir;
        this._sshConnected = true;

        // Update Path field to remote mode
        pathLabel.textContent = 'Path (Remote)';
        pathInput.placeholder = result.homeDir;
        pathHint.textContent = '🌐 SSH connected — Browse selects remote directory';
        pathHint.style.display = '';
        pathHint.style.color = '#4ade80';

        // Auto-fill path if empty
        if (!pathInput.value) {
          pathInput.value = result.homeDir;
        }
      } catch (e) {
        testResult.style.background = 'rgba(239,68,68,0.1)';
        testResult.style.color = '#f87171';
        testResult.textContent = `❌ Failed: ${e.message}`;
        this._sshConnected = false;
      } finally {
        btnTestSSH.disabled = false;
      }
    });

    this.formEl = el;
    return el;
  }

  async openRemoteBrowser(startPath, remotePathInput) {
    const browserEl = document.createElement('div');
    browserEl.className = 'flex flex-col gap-2';

    const headerEl = document.createElement('div');
    headerEl.className = 'flex items-center gap-2';
    headerEl.innerHTML = `
      <button type="button" class="btn-parent btn-secondary text-sm px-2">⬆</button>
      <span class="text-sm text-slate-300 flex-1 truncate remote-current-path">${startPath}</span>
      <button type="button" class="btn-select-this btn-primary text-sm px-3">Select This</button>
    `;

    const listEl = document.createElement('div');
    listEl.className = 'flex flex-col gap-0.5 overflow-y-auto';
    listEl.style.maxHeight = '200px';
    listEl.innerHTML = '<div class="text-xs text-slate-500 p-2">Loading...</div>';

    browserEl.appendChild(headerEl);
    browserEl.appendChild(listEl);

    const browserModal = new Modal({
      title: '📂 Remote Path',
      content: browserEl,
      confirmText: 'Cancel',
      showCancel: false,
      onConfirm: () => browserModal.close(),
    });
    browserModal.open();

    let currentPath = startPath;

    const loadDirs = async (dirPath) => {
      listEl.innerHTML = '<div class="text-xs text-slate-500 p-2">Loading...</div>';
      try {
        const result = await window.api.remote.browseDirs(this._sshConfig, dirPath);
        if (result.error) throw new Error(result.error);

        currentPath = result.currentPath;
        browserEl.querySelector('.remote-current-path').textContent = currentPath;

        if (result.dirs.length === 0) {
          listEl.innerHTML = '<div class="text-xs text-slate-500 p-2">(no subdirectories)</div>';
          return;
        }

        listEl.innerHTML = '';
        for (const dir of result.dirs) {
          const item = document.createElement('div');
          item.className = 'flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-700 text-sm text-slate-300';
          item.innerHTML = `<span>📁</span><span class="truncate">${dir.name}</span>`;
          item.addEventListener('click', () => loadDirs(dir.path));
          listEl.appendChild(item);
        }
      } catch (e) {
        listEl.innerHTML = `<div class="text-xs text-red-400 p-2">Error: ${e.message}</div>`;
      }
    };

    // Parent button
    headerEl.querySelector('.btn-parent').addEventListener('click', () => {
      const parent = currentPath.replace(/\/[^/]+\/?$/, '') || '/';
      loadDirs(parent);
    });

    // Select this directory
    headerEl.querySelector('.btn-select-this').addEventListener('click', () => {
      remotePathInput.value = currentPath;
      browserModal.close();
    });

    loadDirs(startPath);
  }

  async handleSubmit() {
    const form = this.formEl;
    const name = form.querySelector('input[name="name"]').value.trim();
    if (!name) {
      Toast.show('Please enter a project name', 'warning');
      return;
    }

    const selectedColor = form.querySelector('.color-option.selected');
    const selectedIcon = form.querySelector('.icon-picker .ring-2');

    // SSH fields
    const sshHost = form.querySelector('input[name="ssh_host"]').value.trim();
    const sshPort = parseInt(form.querySelector('input[name="ssh_port"]').value) || 22;
    const sshUsername = form.querySelector('input[name="ssh_username"]').value.trim();
    const activeAuth = form.querySelector('.auth-option.active');
    const sshAuthType = activeAuth ? activeAuth.dataset.auth : 'key';
    const sshKeyPath = form.querySelector('input[name="ssh_key_path"]').value.trim();
    const sshPassword = form.querySelector('input[name="ssh_password"]').value;
    const sshStartupCommand = form.querySelector('input[name="ssh_startup_command"]').value.trim();

    // Encrypt password if provided
    let sshPasswordEncrypted = this.project?.ssh_password_encrypted || '';
    if (sshPassword) {
      try {
        const encrypted = await window.api.security.encryptPassword(sshPassword);
        if (encrypted && !encrypted.error) {
          sshPasswordEncrypted = encrypted;
        }
      } catch (e) {
        console.error('Password encryption failed:', e);
      }
    }

    const pathValue = form.querySelector('input[name="path"]').value.trim();

    const data = {
      name,
      path: sshHost ? '' : pathValue, // SSH projects don't use local path
      description: form.querySelector('textarea[name="description"]').value.trim(),
      color: selectedColor ? selectedColor.dataset.color : PRESET_COLORS[0],
      icon: selectedIcon ? selectedIcon.dataset.icon : PRESET_ICONS[0],
      status: form.querySelector('select[name="status"]').value,
      ssh_host: sshHost,
      ssh_port: sshPort,
      ssh_username: sshUsername,
      ssh_auth_type: sshAuthType,
      ssh_password_encrypted: sshPasswordEncrypted,
      ssh_key_path: sshKeyPath,
      ssh_startup_command: sshStartupCommand,
      ssh_remote_path: sshHost ? pathValue : '', // SSH projects store path as remote path
    };

    try {
      if (this.mode === 'create') {
        await window.api.projects.create(data);
        Toast.show(`"${name}" created`, 'success');
      } else {
        await window.api.projects.update(this.project.id, data);
        Toast.show(`"${name}" updated`, 'success');
      }

      // Reload projects
      const projects = await window.api.projects.list();
      store.setState({ projects });

      if (this.onSaved) this.onSaved();
      this.modal.close();
    } catch (e) {
      Toast.show(`Save failed: ${e.message || e}`, 'error');
    }
  }
}
