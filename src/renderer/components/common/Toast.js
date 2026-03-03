// Toast - Notification toast system

let containerEl = null;

function ensureContainer() {
  if (!containerEl || !containerEl.parentNode) {
    containerEl = document.createElement('div');
    containerEl.className = 'toast-container';
    document.body.appendChild(containerEl);
  }
  return containerEl;
}

export class Toast {
  static show(message, type = 'info', duration = 3000) {
    const container = ensureContainer();

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    // Trigger animation
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    // Auto-remove
    const timer = setTimeout(() => {
      Toast.dismiss(toast);
    }, duration);

    // Click to dismiss early
    toast.addEventListener('click', () => {
      clearTimeout(timer);
      Toast.dismiss(toast);
    });

    return toast;
  }

  static showCenter(message, duration = 2000) {
    const toast = document.createElement('div');
    toast.className = 'toast-center';
    toast.textContent = message;
    document.body.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('visible'));

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, duration);

    return toast;
  }

  static dismiss(toast) {
    toast.classList.remove('visible');
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }
}
