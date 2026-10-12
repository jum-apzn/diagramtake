// A non-modal guide. It never owns or writes project data.
export function mountQuickStart({ hasSavedProject, loadExample, previewScene, canInteract }) {
  const $ = (selector) => document.querySelector(selector);
  const panel = $('#quick-start');
  const toggle = $('#guide-toggle');
  const key = 'diagramtake.guide.dismissed.v1';
  const done = new Set();
  let highlighted = null;
  let dismissed = false;
  try { dismissed = localStorage.getItem(key) === '1'; } catch {}

  function clearHighlight() {
    highlighted?.classList.remove('guide-target');
    highlighted = null;
  }
  function show(visible, focus = false) {
    panel.hidden = !visible;
    toggle.setAttribute('aria-expanded', String(visible));
    if (!visible) clearHighlight();
    if (focus) (visible ? $('#guide-heading') : toggle).focus();
  }
  function close() {
    try { localStorage.setItem(key, '1'); } catch {}
    show(false, true);
  }
  function complete(step) {
    // Work done while the guide is closed must not change the editor.
    if (panel.hidden) return;
    done.add(step);
    const button = $(`[data-guide-step="${step}"]`);
    button.classList.add('is-done');
    button.querySelector('.guide-step-state').textContent = '완료';
    $('#guide-progress').textContent = done.size === 3
      ? '첫 이야기를 만들었어요. Save .json으로 파일도 남겨 보세요.'
      : `${done.size} / 3 · 지금 열린 이야기로 따라 해도 좋아요.`;
  }
  function pointAt(selector) {
    clearHighlight();
    highlighted = $(selector);
    highlighted.classList.add('guide-target');
    highlighted.scrollIntoView({ behavior: 'auto', block: 'center' });
    highlighted.focus({ preventScroll: true });
  }
  toggle.addEventListener('click', () => {
    if (panel.hidden) show(true, true); else close();
  });
  $('#guide-close').addEventListener('click', close);
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { event.preventDefault(); close(); }
  });
  $('#guide-example').addEventListener('click', () => {
    if (!canInteract()) return;
    if (loadExample()) {
      complete(1);
      pointAt('.scene-card.active');
    }
  });
  $('#guide-edit').addEventListener('click', () => {
    if (canInteract()) pointAt('#narration');
  });
  $('#guide-play').addEventListener('click', () => {
    if (!canInteract()) return;
    pointAt('#play');
    previewScene();
  });
  $('#scene-list').addEventListener('click', (event) => {
    if (event.target.closest('.scene-card') && canInteract()) complete(1);
  });
  $('#narration').addEventListener('input', () => {
    if (canInteract()) complete(2);
  });
  show(!hasSavedProject && !dismissed);
  return { complete };
}
