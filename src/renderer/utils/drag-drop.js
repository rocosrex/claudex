// Drag and Drop utility for Kanban board (HTML5 Drag and Drop API)

/**
 * Make an element draggable with data payload.
 * @param {HTMLElement} element
 * @param {{ type: string, id: string, [key: string]: any }} data
 */
export function makeDraggable(element, data) {
  element.draggable = true;
  element.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('application/json', JSON.stringify(data));
    e.dataTransfer.effectAllowed = 'move';
    element.classList.add('dragging');
  });
  element.addEventListener('dragend', () => {
    element.classList.remove('dragging');
  });
}

/**
 * Make an element a drop zone that accepts specific drag types.
 * @param {HTMLElement} element
 * @param {{ acceptType: string, onDrop: Function, onDragOver?: Function, onDragLeave?: Function }} opts
 */
export function makeDropZone(element, { acceptType, onDrop, onDragOver, onDragLeave }) {
  element.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    element.classList.add('drag-over');
    onDragOver?.(e);
  });
  element.addEventListener('dragleave', (e) => {
    // Only remove highlight when leaving the drop zone itself
    if (!element.contains(e.relatedTarget)) {
      element.classList.remove('drag-over');
      onDragLeave?.();
    }
  });
  element.addEventListener('drop', (e) => {
    e.preventDefault();
    element.classList.remove('drag-over');
    const rawData = e.dataTransfer.getData('application/json');
    if (rawData) {
      try {
        const data = JSON.parse(rawData);
        if (data.type === acceptType) onDrop(data, e);
      } catch (err) {
        console.error('Drag drop parse error:', err);
      }
    }
  });
}
