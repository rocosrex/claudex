// Store - Event-based state management

class Store {
  constructor() {
    this.state = {
      currentView: 'dashboard',
      selectedProjectId: null,
      projects: [],
      searchQuery: '',
    };
    this.listeners = new Map();
  }

  getState() {
    return { ...this.state };
  }

  setState(partial) {
    const prev = { ...this.state };
    this.state = { ...this.state, ...partial };

    // Notify listeners for changed keys
    for (const key of Object.keys(partial)) {
      if (prev[key] !== this.state[key]) {
        this.emit(`change:${key}`, this.state[key]);
      }
    }
    this.emit('change', this.state);
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
  }

  off(event, callback) {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(callback);
    }
  }

  emit(event, data) {
    const set = this.listeners.get(event);
    if (set) {
      for (const cb of set) {
        try {
          cb(data);
        } catch (e) {
          console.error(`Store event "${event}" listener error:`, e);
        }
      }
    }
  }
}

export const store = new Store();
