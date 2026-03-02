// TerminalRouter - Singleton that routes IPC terminal events to registered components
// Prevents multiple onData/onExit listeners when multiple terminal components exist

class TerminalRouter {
  constructor() {
    this.handlers = new Map(); // termId -> { onData, onExit }
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Register global IPC listeners once
    window.api.terminal.onData((termId, data) => {
      const handler = this.handlers.get(termId);
      if (handler && handler.onData) {
        handler.onData(data);
      }
    });

    window.api.terminal.onExit((termId) => {
      const handler = this.handlers.get(termId);
      if (handler && handler.onExit) {
        handler.onExit();
      }
    });
  }

  register(termId, onData, onExit) {
    this.init();
    this.handlers.set(termId, { onData, onExit });
  }

  unregister(termId) {
    this.handlers.delete(termId);
  }

  clear() {
    this.handlers.clear();
  }
}

export const terminalRouter = new TerminalRouter();
