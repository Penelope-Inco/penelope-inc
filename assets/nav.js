/**
 * nav.js — desktop hover-to-reveal mega panels, mobile hamburger + accordion.
 * Include once per page after the header markup.
 */
(function () {
  const navItems = document.querySelectorAll('.nav-item[data-has-panel]');
  let closeTimer = null;

  navItems.forEach((item) => {
    const open = () => {
      clearTimeout(closeTimer);
      navItems.forEach((i) => i.classList.remove('panel-open'));
      item.classList.add('panel-open');
    };
    const scheduleClose = () => {
      closeTimer = setTimeout(() => item.classList.remove('panel-open'), 180);
    };

    item.addEventListener('mouseenter', open);
    item.addEventListener('mouseleave', scheduleClose);

    const trigger = item.querySelector('.nav-trigger');
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      item.classList.contains('panel-open') ? item.classList.remove('panel-open') : open();
    });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-item')) {
      navItems.forEach((i) => i.classList.remove('panel-open'));
    }
  });

  // --- Mobile ---
  const hamburger = document.querySelector('.nav-hamburger');
  const drawer = document.querySelector('.mobile-drawer');
  if (hamburger && drawer) {
    hamburger.addEventListener('click', () => {
      hamburger.classList.toggle('open');
      drawer.classList.toggle('open');
      document.body.style.overflow = drawer.classList.contains('open') ? 'hidden' : '';
    });

    drawer.querySelectorAll('.mobile-accordion-trigger').forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const item = trigger.closest('.mobile-accordion-item');
        const wasOpen = item.classList.contains('open');
        drawer.querySelectorAll('.mobile-accordion-item').forEach((i) => i.classList.remove('open'));
        if (!wasOpen) item.classList.add('open');
      });
    });
  }
})();
