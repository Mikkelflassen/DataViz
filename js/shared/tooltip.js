// One floating tooltip per page. It follows the pointer and stays inside the window.

export function createTooltip() {
  let el = document.getElementById('tip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'tip';
    el.className = 'tip';
    el.hidden = true;
    document.body.append(el);
  }

  function show(event, html) {
    el.innerHTML = html;
    el.hidden = false;
    const box = el.getBoundingClientRect();
    let x = event.clientX + 14;
    let y = event.clientY + 14;
    if (x + box.width > innerWidth - 8) x = event.clientX - box.width - 14;
    if (y + box.height > innerHeight - 8) y = event.clientY - box.height - 14;
    el.style.left = `${Math.max(8, x)}px`;
    el.style.top = `${Math.max(8, y)}px`;
  }

  const hide = () => { el.hidden = true; };
  return { show, hide };
}
