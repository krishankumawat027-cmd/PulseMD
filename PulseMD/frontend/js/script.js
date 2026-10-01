document.addEventListener('DOMContentLoaded', () => {
  const nav = document.querySelector('[data-landing-nav]');
  const menuButton = document.querySelector('[data-landing-menu]');
  const themeButton = document.querySelector('[data-landing-theme]');
  const bellButton = document.querySelector('[data-landing-bell]');
  const revealItems = document.querySelectorAll('[data-reveal]');
  const setMenuState = (isOpen) => {
    nav?.classList.toggle('is-open', isOpen);
    document.body.classList.toggle('care-nav-open', isOpen);
    menuButton?.setAttribute('aria-expanded', String(isOpen));
  };

  if (window.App?.initTheme) App.initTheme();

  menuButton?.addEventListener('click', () => {
    const isOpen = !nav?.classList.contains('is-open');
    setMenuState(isOpen);
  });

  document.querySelectorAll('.care-landing-menu a').forEach((link) => {
    link.addEventListener('click', () => {
      setMenuState(false);
    });
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setMenuState(false);
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth >= 920) setMenuState(false);
  });

  themeButton?.addEventListener('click', () => {
    if (window.App?.toggleTheme) {
      App.toggleTheme();
      return;
    }

    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('theme', next);
  });

  bellButton?.addEventListener('click', () => {
    const isLoggedIn = Boolean(localStorage.getItem('token'));
    window.location.href = isLoggedIn ? '/notifications.html' : '/login.html';
  });

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.18 });

  revealItems.forEach((item) => observer.observe(item));
});
