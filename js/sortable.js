// Touch-friendly drag and drop. Items are dragged by their .drag-handle; .sortable-header
// rows split the list into groups (a day or a city). Dropping an item under another header
// moves it into that group. onEnd receives [{ id, group }] in the new order.
export function makeSortable(container, onEnd) {
  container.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle || !container.contains(handle)) return;
    const item = handle.closest('.sortable-item');
    if (!item) return;
    e.preventDefault();

    const rect = item.getBoundingClientRect();
    const offsetY = e.clientY - rect.top;
    const placeholder = document.createElement('div');
    placeholder.className = 'drag-placeholder';
    placeholder.style.height = rect.height + 'px';
    container.insertBefore(placeholder, item.nextSibling);

    Object.assign(item.style, {
      position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
      width: rect.width + 'px', zIndex: 50, pointerEvents: 'none',
    });
    item.classList.add('dragging');
    handle.setPointerCapture(e.pointerId);

    let lastY = e.clientY;
    let scrollTimer = null;

    const place = () => {
      item.style.top = (lastY - offsetY) + 'px';
      const rows = [...container.children].filter(
        (el) => el !== item && el !== placeholder &&
          (el.classList.contains('sortable-item') || el.classList.contains('sortable-header')));
      let before = null;
      for (const el of rows) {
        const r = el.getBoundingClientRect();
        if (lastY < r.top + r.height / 2) { before = el; break; }
      }
      // Never drop above the first group header.
      if (before && before === rows[0] && before.classList.contains('sortable-header')) {
        before = rows[1] || null;
      }
      if (before) container.insertBefore(placeholder, before);
      else container.appendChild(placeholder);
    };

    const autoScroll = () => {
      const edge = 70;
      let dy = 0;
      if (lastY < edge) dy = -12;
      else if (lastY > window.innerHeight - edge - 60) dy = 12;
      if (dy) { window.scrollBy(0, dy); place(); }
    };

    const move = (ev) => { lastY = ev.clientY; place(); };
    const up = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
      clearInterval(scrollTimer);
      container.insertBefore(item, placeholder);
      placeholder.remove();
      item.removeAttribute('style');
      item.classList.remove('dragging');

      const result = [];
      let group = null;
      for (const el of container.children) {
        if (el.classList.contains('sortable-header')) group = el.dataset.group;
        else if (el.classList.contains('sortable-item')) result.push({ id: el.dataset.id, group });
      }
      onEnd(result);
    };

    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', up);
    handle.addEventListener('pointercancel', up);
    scrollTimer = setInterval(autoScroll, 30);
  });
}
