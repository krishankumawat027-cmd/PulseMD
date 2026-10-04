// For Netlify, set window.API_BASE in a small config script or save it in localStorage.
const API_BASE = window.API_BASE || localStorage.getItem('API_BASE') || '';

const App = {
  patientEmergencyContact: null,
  activeEmergency: null,
  emergencyCloseTimer: null,
  emergencyStartInProgress: false,
  googleMapsReady: null,
  emergencyMap: null,
  emergencyUserMarker: null,
  emergencyHospitalMarkers: [],
  lastEmergencyLocation: null,
  translations: {},
  i18nReady: null,
  i18nObserver: null,
  nativeAlert: window.alert?.bind(window),
  nativeConfirm: window.confirm?.bind(window),
  get token() {
    return localStorage.getItem('token');
  },
  get user() {
    const raw = localStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  },
  saveSession(data) {
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('language', data.user?.preferredLanguage || data.user?.selectedLanguage || localStorage.getItem('language') || 'en');
  },
  currentLanguage() {
    return localStorage.getItem('language') || this.user?.preferredLanguage || this.user?.selectedLanguage || 'en';
  },
  async initI18n() {
    if (this.i18nReady) return this.i18nReady;
    const loadLocale = async (lang) => {
      const paths = [
        `/locales/${lang}.json`,
        `./locales/${lang}.json`,
        `locales/${lang}.json`
      ];
      let lastError;
      for (const path of paths) {
        try {
          const response = await fetch(path, { cache: 'no-store' });
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          this.translations[lang] = this.repairLocaleMojibake(await response.json());
          return;
        } catch (error) {
          lastError = error;
        }
      }
      throw new Error(`Could not load ${lang} translations. ${lastError?.message || ''}`.trim());
    };
    this.i18nReady = Promise.all(['en', 'hi'].map(loadLocale)).catch((error) => {
      console.warn('PulseMD - Virtual Clinic i18n failed to load locale files:', error.message);
      this.translations.en = this.translations.en || { common: {}, phrases: {} };
      this.translations.hi = this.translations.hi || { common: {}, phrases: {} };
    });
    return this.i18nReady;
  },
  repairLocaleMojibake(value) {
    if (Array.isArray(value)) return value.map((item) => this.repairLocaleMojibake(item));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, this.repairLocaleMojibake(child)]));
    }
    if (typeof value !== 'string' || !/[àÃÂ]|[\u0080-\u009f]/.test(value)) return value;
    try {
      const repaired = new TextDecoder('utf-8', { fatal: true })
        .decode(Uint8Array.from([...value].map((char) => char.charCodeAt(0) & 0xff)));
      return repaired || value;
    } catch (error) {
      return value;
    }
  },
  t(key) {
    const lang = this.currentLanguage();
    return this.getByPath(this.translations[lang], key)
      || this.getByPath(this.translations.en, key)
      || key.split('.').pop().replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ');
  },
  getByPath(source, key) {
    if (!source || !key) return undefined;
    if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
    const parts = String(key).split('.');
    let value = source;
    for (let index = 0; index < parts.length; index += 1) {
      if (!value) return undefined;
      const remaining = parts.slice(index).join('.');
      if (Object.prototype.hasOwnProperty.call(value, remaining)) return value[remaining];
      value = value[parts[index]];
    }
    return value;
  },
  async applyLanguage(root = document) {
    await this.initI18n();
    const lang = this.currentLanguage();
    document.documentElement.lang = lang;
    const titleNode = document.querySelector('title');
    if (titleNode) {
      const originalTitle = titleNode.dataset.i18nOriginalTitle || titleNode.textContent || document.title;
      titleNode.dataset.i18nOriginalTitle = originalTitle;
      const translatedTitle = titleNode.dataset.i18n
        ? this.t(titleNode.dataset.i18n)
        : this.translatePhrase(originalTitle, lang);
      titleNode.textContent = translatedTitle;
      document.title = translatedTitle;
    }
    this.findAll(root, '[data-i18n]').forEach((node) => {
      this.setTranslatedText(node, this.t(node.dataset.i18n));
    });
    this.findAll(root, '[data-i18n-placeholder]').forEach((node) => {
      node.setAttribute('placeholder', this.t(node.dataset.i18nPlaceholder));
    });
    this.findAll(root, '[data-i18n-title]').forEach((node) => {
      node.setAttribute('title', this.t(node.dataset.i18nTitle));
    });
    this.findAll(root, '[data-i18n-aria-label]').forEach((node) => {
      node.setAttribute('aria-label', this.t(node.dataset.i18nAriaLabel));
    });
    document.querySelectorAll('[data-language-select]').forEach((select) => {
      select.value = lang;
    });
    this.translateCommonAttributes(root, lang);
    this.translateStaticDom(root, lang);
    this.startI18nObserver();
  },
  findAll(root = document, selector) {
    const nodes = [];
    if (root.matches?.(selector)) nodes.push(root);
    root.querySelectorAll?.(selector).forEach((node) => nodes.push(node));
    return nodes;
  },
  setTranslatedText(node, text) {
    if (!node) return;
    const translated = String(text ?? '');
    if (!node.children.length) {
      node.textContent = translated;
      return;
    }

    const textNode = [...node.childNodes].find((child) => (
      child.nodeType === Node.TEXT_NODE && child.nodeValue.trim()
    ));

    if (textNode) {
      const leading = textNode.nodeValue.match(/^\s*/)?.[0] || '';
      const trailing = textNode.nodeValue.match(/\s*$/)?.[0] || ' ';
      textNode.nodeValue = `${leading}${translated}${trailing}`;
      return;
    }

    node.insertBefore(document.createTextNode(`${translated} `), node.firstChild);
  },
  translatePhrase(value, lang = this.currentLanguage()) {
    const source = String(value || '').trim();
    if (!source) return value;
    if (lang === 'en') return this.getByPath(this.translations.en, `phrases.${source}`) || source;
    return this.getByPath(this.translations[lang], `phrases.${source}`)
      || this.getByPath(this.translations.en, `phrases.${source}`)
      || source;
  },
  tStatus(value) {
    const normalized = String(value || 'pending').toLowerCase().replace(/\s+/g, '_');
    return this.t(`status.${normalized}`) || this.translatePhrase(normalized.replace(/_/g, ' '));
  },
  tLabel(key, fallback = '') {
    const translated = this.t(key);
    return translated === key.split('.').pop().replace(/([A-Z])/g, ' $1').replace(/[_-]/g, ' ')
      ? this.translatePhrase(fallback || translated)
      : translated;
  },
  async updateAllText() {
    await this.applyLanguage();
    if (typeof window.renderProfileI18n === 'function') await window.renderProfileI18n();
    if (typeof window.renderDashboardI18n === 'function') await window.renderDashboardI18n();
    if (typeof window.renderDoctorsI18n === 'function') await window.renderDoctorsI18n();
    if (typeof window.renderPaymentsI18n === 'function') await window.renderPaymentsI18n();
    if (typeof window.refreshPatientNotifications === 'function') await window.refreshPatientNotifications();
    if (typeof window.renderPrescriptionsI18n === 'function') await window.renderPrescriptionsI18n();
    if (typeof window.renderChatI18n === 'function') await window.renderChatI18n();
    if (typeof window.loadPatientAppointments === 'function' && document.querySelector('#appointmentsBody')) await window.loadPatientAppointments({ preserveShell: true });
  },
  translateCommonAttributes(root = document, lang = this.currentLanguage()) {
    const treeRoot = root.nodeType === Node.ELEMENT_NODE || root.nodeType === Node.DOCUMENT_NODE ? root : document;
    ['aria-label', 'title'].forEach((attributeName) => {
      treeRoot.querySelectorAll?.(`[${attributeName}]:not([data-i18n-${attributeName.replace(/-/g, '-')}])`).forEach((node) => {
        const original = node.dataset[`i18nOriginal${attributeName.replace(/(^|-)([a-z])/g, (_, __, char) => char.toUpperCase())}`] || node.getAttribute(attributeName);
        if (!original) return;
        node.dataset[`i18nOriginal${attributeName.replace(/(^|-)([a-z])/g, (_, __, char) => char.toUpperCase())}`] = original;
        node.setAttribute(attributeName, lang === 'hi' ? this.translatePhrase(original, lang) : original);
      });
    });
    treeRoot.querySelectorAll?.('input[type="button"], input[type="submit"], input[type="reset"]').forEach((node) => {
      const original = node.dataset.i18nOriginalValue || node.value;
      if (!original) return;
      node.dataset.i18nOriginalValue = original;
      node.value = lang === 'hi' ? this.translatePhrase(original, lang) : original;
    });
  },
  translateStaticDom(root = document, lang = this.currentLanguage()) {
    const treeRoot = root.nodeType === Node.ELEMENT_NODE || root.nodeType === Node.DOCUMENT_NODE ? root : document;
    treeRoot.querySelectorAll?.('input[placeholder]:not([data-i18n-placeholder]), textarea[placeholder]:not([data-i18n-placeholder])').forEach((node) => {
      const original = node.dataset.i18nOriginalPlaceholder || node.getAttribute('placeholder');
      node.dataset.i18nOriginalPlaceholder = original;
      node.setAttribute('placeholder', lang === 'hi' ? this.translatePhrase(original, lang) : original);
    });

    const walker = document.createTreeWalker(treeRoot, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent || parent.closest('script,style,svg') || parent.closest('[data-no-i18n]')) return NodeFilter.FILTER_REJECT;
        if (parent.matches('[data-i18n]')) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const parent = node.parentElement;
      const original = parent.dataset.i18nOriginalText || node.nodeValue.trim();
      parent.dataset.i18nOriginalText = original;
      const leading = node.nodeValue.match(/^\s*/)?.[0] || '';
      const trailing = node.nodeValue.match(/\s*$/)?.[0] || '';
      node.nodeValue = `${leading}${lang === 'hi' ? this.translatePhrase(original, lang) : original}${trailing}`;
    });
  },
  languageSelect() {
    return `
      <label class="language-switcher">
        <span data-i18n="common.language">${this.t('common.language')}</span>
        <select data-language-select aria-label="Language" onchange="App.changeLanguage(this.value)">
          <option value="en" data-i18n="common.english">${this.t('common.english')}</option>
          <option value="hi" data-i18n="common.hindi">${this.t('common.hindi')}</option>
        </select>
      </label>
    `;
  },
  async changeLanguage(language) {
    const selectedLanguage = ['en', 'hi'].includes(language) ? language : 'en';
    localStorage.setItem('language', selectedLanguage);
    const currentUser = this.user;
    if (currentUser) {
      currentUser.selectedLanguage = selectedLanguage;
      currentUser.preferredLanguage = selectedLanguage;
      localStorage.setItem('user', JSON.stringify(currentUser));
    }
    await this.updateAllText();
    window.dispatchEvent(new CustomEvent('caremitra:languageChanged', { detail: { language: selectedLanguage } }));
    if (this.token && ['patient', 'doctor'].includes(currentUser?.role)) {
      try {
        const data = await this.request(`/api/${currentUser.role}/language`, {
          method: 'PATCH',
          body: JSON.stringify({ language: selectedLanguage })
        });
        if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      } catch (error) {
        console.warn('Could not save language preference:', error.message);
      }
    }
  },
  startI18nObserver() {
    if (this.i18nObserver) return;
    this.i18nObserver = new MutationObserver((mutations) => {
      const lang = this.currentLanguage();
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) this.applyLanguage(node);
        });
      });
      document.querySelectorAll('[data-language-select]').forEach((select) => {
        select.value = lang;
      });
    });
    this.i18nObserver.observe(document.body, { childList: true, subtree: true });
  },
  mountGlobalLanguageSwitcher() {
    if (document.querySelector('[data-language-select]') || document.querySelector('#globalLanguageSwitcher')) return;
    document.body.insertAdjacentHTML('afterbegin', `
      <div id="globalLanguageSwitcher" class="global-language-switcher">
        ${this.languageSelect()}
      </div>
    `);
  },
  installI18nDialogs() {
    if (window.__caremitraI18nDialogsInstalled) return;
    window.__caremitraI18nDialogsInstalled = true;
    window.alert = (message) => this.nativeAlert(this.translatePhrase(message));
    window.confirm = (message) => this.nativeConfirm(this.translatePhrase(message));
  },
  initTheme() {
    const saved = localStorage.getItem('theme') || 'light';
    document.documentElement.dataset.theme = saved;
    document.querySelectorAll('[data-theme-toggle]').forEach((button) => {
      button.textContent = saved === 'dark' ? this.t('common.lightMode') : this.t('common.darkMode');
    });
  },
  toggleTheme() {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    document.documentElement.dataset.theme = next;
    this.initTheme();
  },
  medIcon(name) {
    const icons = {
      dashboard: '<path fill="currentColor" stroke="none" d="M3 3h8v8H3V3Zm10 0h8v6h-8V3ZM3 13h8v8H3v-8Zm10-2h8v10h-8V11Z"></path>',
      doctors: '👨‍⚕️',
      appointments: '\u{1F4C6}',
      chat: '\u{1F4E9}',
      payments: '\u{1F4B3}',
      prescriptions: '💊',
      notifications: '\u{1F514}',
      profile: '<circle cx="12" cy="12" r="10.5" fill="#facc15" stroke="none"></circle><path d="M5 21c.9-4.2 2.5-6.4 5.2-7.2l1.8 1 1.8-1c2.7.8 4.3 3 5.2 7.2" fill="#16a34a" stroke="none"></path><path d="M8.4 5.8c.4-2.1 2.1-3.1 3.8-3.1 2.2 0 3.8 1.1 4.1 3.3.3 2-.2 4.7-.9 6-.6 1.2-2.2 1.9-3.4 2.2-1.2-.3-2.8-1-3.4-2.2-.6-1.4-.8-4.3-.2-6.2Z" fill="#f2c5aa" stroke="none"></path><path d="M8.3 6c.4-2.5 2-3.5 4-3.5 2.4 0 3.8 1.3 4 3.7.1.8-.1 1.7-.3 2.1-.6-1.1-1.4-1.6-2.6-1.5-1.3.1-2.4.1-3.6-.4-.5-.2-.9-.4-1.5-.4Z" fill="#33383f" stroke="none"></path><path d="M8.9 11.7c.8-1.4 2.1-2 3.2-1.8 1.2.1 2.3 1 2.8 2.2-.8.1-1.3-.1-1.7-.7-.5-.7-1.6-.8-2.2-.1-.4.5-.9.6-2.1.4Z" fill="#33383f" stroke="none"></path>',
      logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><path d="M16 17l5-5-5-5M21 12H9"></path>',
      emergency: '<path class="emergency-icon-mark" d="M12 2v20M2 12h20"></path>',
      theme: '<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z"></path>',
      patients: '\u{1F64B}\u200D\u2642\uFE0F',
      video: '\u{1F4F2}',
      doctors: '\u{1F468}\u200D\u2695\uFE0F',
      prescriptions: '\u{1F48A}',
      notifications: '\u{1F514}',
      video: '\u{1F4F2}',
      patients: '\u{1F64B}\u200D\u2642\uFE0F',
      payments: '\u{1F4B3}'
    };
    const icon = icons[name] || icons.dashboard;
    if (!String(icon).startsWith('<')) {
      return `<span class="nav-svg emoji-icon" aria-hidden="true">${icon}</span>`;
    }
    return `<svg class="nav-svg nav-icon-${name}" viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
  },
  patientNav(active = '') {
    return `
      <header class="topbar patient-topbar">
        <a class="brand" href="/index.html" aria-label="PulseMD - Virtual Clinic home">
          <div class="brand-badge"><span>Pulse</span><span>MD</span></div>
          <div>
            <strong>PulseMD - Virtual Clinic</strong>
            <span>Healthcare that comes to you</span>
          </div>
        </a>
        <button type="button" class="nav-toggle" aria-label="Open menu" aria-expanded="false" onclick="App.toggleNav(this)">
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
          <span class="hamburger-line"></span>
        </button>
        <div class="nav-overlay" onclick="App.closeNav()"></div>
        <nav class="nav nav-drawer patient-nav-menu" aria-label="Primary navigation">
          <a class="${active === 'dashboard' ? 'active' : ''}" href="/patient-dashboard.html"><span class="patient-nav-icon">${this.medIcon('dashboard')}</span><span data-i18n="common.dashboard">${this.t('common.dashboard')}</span></a>
          <a class="${active === 'doctors' ? 'active' : ''}" href="/doctors.html"><span class="patient-nav-icon">${this.medIcon('doctors')}</span><span data-i18n="common.findDoctors">${this.t('common.findDoctors')}</span></a>
          <a class="${active === 'appointments' ? 'active' : ''}" href="/appointments.html"><span class="patient-nav-icon">${this.medIcon('appointments')}</span><span data-i18n="common.appointments">${this.t('common.appointments')}</span></a>
          <a class="${active === 'chat' ? 'active' : ''}" href="/chat.html"><span class="patient-nav-icon">${this.medIcon('chat')}</span><span data-i18n="common.chat">${this.t('common.chat')}</span></a>
          <a class="${active === 'payments' ? 'active' : ''}" href="/payment.html"><span class="patient-nav-icon">${this.medIcon('payments')}</span><span data-i18n="common.payments">${this.t('common.payments')}</span></a>
          <a class="${active === 'prescriptions' ? 'active' : ''}" href="/prescriptions.html"><span class="patient-nav-icon">${this.medIcon('prescriptions')}</span><span data-i18n="common.prescriptions">${this.t('common.prescriptions')}</span></a>
          <a class="${active === 'notifications' ? 'active' : ''}" href="/notifications.html"><span class="patient-nav-icon">${this.medIcon('notifications')}</span><span data-i18n="common.notifications">${this.t('common.notifications')}</span><span class="badge patient-notification-badge" hidden>0</span></a>
          <a class="${active === 'profile' ? 'active' : ''}" href="/profile.html"><span class="patient-nav-icon">${this.medIcon('profile')}</span><span data-i18n="common.profile">${this.t('common.profile')}</span></a>
          <div class="patient-nav-actions">
            ${this.languageSelect()}
            <button type="button" class="danger emergency-link" onclick="App.openEmergencyPanel()"><span class="patient-nav-icon">${this.medIcon('emergency')}</span><span data-i18n="common.emergency">${this.t('common.emergency')}</span></button>
            <button type="button" class="secondary theme-toggle" data-theme-toggle onclick="App.toggleTheme()"><span class="patient-nav-icon">${this.medIcon('theme')}</span><span data-i18n="common.darkMode">${this.t('common.darkMode')}</span></button>
            <button type="button" class="danger" onclick="App.logout()"><span class="patient-nav-icon">${this.medIcon('logout')}</span><span data-i18n="common.logout">${this.t('common.logout')}</span></button>
          </div>
        </nav>
      </header>
    `;
  },
  patientBottomNav(active = '') {
    const item = (key, href, icon, labelKey) => `
      <a class="${active === key ? 'active' : ''}" href="${href}" aria-label="${this.t(labelKey)}">
        <span class="patient-bottom-nav-icon">${this.medIcon(icon)}</span>
        <span data-i18n="${labelKey}">${this.t(labelKey)}</span>
      </a>
    `;
    return `
      <nav class="patient-bottom-nav" aria-label="Patient quick navigation">
        ${item('dashboard', '/patient-dashboard.html', 'dashboard', 'common.dashboard')}
        ${item('doctors', '/doctors.html', 'doctors', 'common.findDoctors')}
        ${item('appointments', '/appointments.html', 'appointments', 'common.appointments')}
        ${item('chat', '/chat.html', 'chat', 'common.chat')}
        ${item('profile', '/profile.html', 'profile', 'common.profile')}
      </nav>
    `;
  },
  mountPatientNav(active) {
    if (document.querySelector('.patient-topbar')) {
      document.body.classList.add('patient-app');
      if (!document.querySelector('.patient-bottom-nav')) {
        document.body.insertAdjacentHTML('beforeend', this.patientBottomNav(active));
      }
      this.mountEmergencyPanel();
      this.mountPatientNotificationPanel();
      this.initTheme();
      this.applyLanguage();
      return;
    }
    document.body.classList.add('patient-app');
    document.body.insertAdjacentHTML('afterbegin', this.patientNav(active));
    document.body.insertAdjacentHTML('beforeend', this.patientBottomNav(active));
    // Responsive enhancement: auto-close mobile menu after selecting a nav item.
    const navLinks = document.querySelectorAll('.topbar .nav a, .topbar .nav button');
    navLinks.forEach((item) => {
      item.addEventListener('click', () => {
        this.closeNav();
      });
    });
    if (!window.__navEscBound) {
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') this.closeNav();
      });
      window.__navEscBound = true;
    }
    this.mountEmergencyPanel();
    this.mountPatientNotificationPanel();
    this.initTheme();
    this.applyLanguage();
    if (this.user?.role === 'patient') {
      this.loadPatientNotificationCount();
      this.loadPatientNotificationDropdown();
    }
  },
  mountPatientNotificationPanel() {
    if (document.querySelector('#patientNotificationDropdown')) return;

    document.body.insertAdjacentHTML('beforeend', `
      <div class="patient-global-notification">
        <button type="button" class="icon-button notification-icon-button" aria-label="Patient notifications" aria-expanded="false" onclick="App.togglePatientNotificationDropdown(event)">
          ${this.medIcon('notifications')}
          <span class="badge notification-badge patient-notification-badge" hidden>0</span>
        </button>
        <div id="patientNotificationDropdown" class="notification-dropdown" hidden>
          <div class="notification-dropdown-head">
            <strong data-i18n="common.notifications">${this.t('common.notifications')}</strong>
            <a href="/notifications.html" data-i18n="phrases.View all">${this.t('phrases.View all')}</a>
          </div>
          <div id="patientNotificationDropdownList" class="notification-dropdown-list">
            <p class="muted" data-i18n="phrases.Loading notifications...">${this.t('phrases.Loading notifications...')}</p>
          </div>
        </div>
      </div>
    `);

    if (!window.__patientNotificationOutsideBound) {
      document.addEventListener('click', (event) => {
        const panel = document.querySelector('.patient-global-notification');
        const dropdown = document.querySelector('#patientNotificationDropdown');
        const button = document.querySelector('.patient-global-notification .notification-icon-button');
        if (!panel || !dropdown || dropdown.hidden || panel.contains(event.target)) return;
        dropdown.hidden = true;
        button?.setAttribute('aria-expanded', 'false');
      });
      window.__patientNotificationOutsideBound = true;
    }
  },
  async togglePatientNotificationDropdown(event) {
    event?.stopPropagation();
    const dropdown = document.querySelector('#patientNotificationDropdown');
    const button = document.querySelector('.patient-global-notification .notification-icon-button');
    if (!dropdown) return;
    const willOpen = dropdown.hidden;
    dropdown.hidden = !willOpen;
    button?.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) await this.loadPatientNotificationDropdown();
  },
  async loadPatientNotificationDropdown() {
    const list = document.querySelector('#patientNotificationDropdownList');
    const user = this.user;
    if (!list || !user || user.role !== 'patient') return;

    try {
      const data = await this.request(`/api/patient/notifications/${user._id}`);
      const notifications = data.notifications || [];
      localStorage.setItem('patientUnread', String(data.unreadCount || 0));
      this.updatePatientNotificationBadges(data.unreadCount || 0);
      list.innerHTML = notifications.length
        ? notifications.slice(0, 5).map((item) => this.patientNotificationDropdownCard(item)).join('')
        : `<p class="muted" data-i18n="empty.noNotifications">${this.t('empty.noNotifications')}</p>`;
    } catch (error) {
      list.innerHTML = `<p class="status-line error">${escapeHtml(error.message)}</p>`;
    }
  },
  patientNotificationDropdownCard(item = {}) {
    const href = this.patientNotificationTarget(item);
    const typeKey = `notificationTypes.${item.type || 'notification'}`;
    const label = this.tLabel(typeKey, String(item.type || 'notification').replace(/_/g, ' '));
    const title = item.title ? this.translatePhrase(item.title) : this.t('notificationTitles.appointment_status');
    const message = item.message ? this.translatePhrase(item.message) : '';
    return `
      <article class="doctor-notification-card dropdown-item ${item.isRead ? '' : 'is-unread'}">
        <span class="notification-card-icon">${item.type?.includes('appointment') ? '<span class="nav-svg emoji-icon" aria-hidden="true">\u{1F4E9}</span>' : this.medIcon(item.type === 'emergency_update' ? 'emergency' : item.type === 'prescription_uploaded' ? 'prescriptions' : 'chat')}</span>
        <div class="notification-card-main">
          <div class="notification-card-meta">
            <span>${escapeHtml(label)}</span>
            <span>${formatDateTime(item.createdAt)}</span>
          </div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(message)}</p>
          <div class="doctor-notification-actions">
            <a class="button secondary" href="${href}" onclick="App.openPatientNotificationFromPanel(event, '${item._id}', '${href}')" data-i18n="common.open">${this.t('common.open')}</a>
            ${item.isRead ? '' : `<button type="button" onclick="App.markPatientNotificationReadFromPanel('${item._id}')" data-i18n="phrases.Mark read">${this.t('phrases.Mark read')}</button>`}
          </div>
        </div>
      </article>
    `;
  },
  patientNotificationTarget(item = {}) {
    if (item.relatedPrescriptionId || item.type === 'prescription_uploaded') return '/prescriptions.html';
    if (item.relatedAppointmentId || String(item.type || '').startsWith('appointment_')) return '/appointments.html';
    if (item.type === 'emergency_update') return '/patient-dashboard.html';
    if (item.relatedChatId || String(item.type || '').includes('chat') || String(item.type || '').includes('doctor')) return '/chat.html';
    return '/patient-dashboard.html';
  },
  async openPatientNotificationFromPanel(event, id, href) {
    event?.preventDefault();
    await this.markPatientNotificationReadFromPanel(id, { silent: true });
    window.location.href = href;
  },
  async markPatientNotificationReadFromPanel(id, options = {}) {
    try {
      await this.request(`/api/notifications/${id}/read`, { method: 'PATCH' });
      await this.loadPatientNotificationDropdown();
      await this.loadPatientNotificationCount();
      if (typeof window.refreshPatientNotifications === 'function') await window.refreshPatientNotifications();
    } catch (error) {
      if (!options.silent) alert(error.message);
    }
  },
  mountEmergencyPanel() {
    if (document.querySelector('#emergencyPanel')) return;

    document.body.insertAdjacentHTML('beforeend', `
      <section id="emergencyPanel" class="emergency-panel" hidden aria-hidden="true">
        <article class="emergency-card" role="dialog" aria-modal="true" aria-labelledby="emergencyTitle">
          <button type="button" class="emergency-close" aria-label="Close emergency support" data-i18n-aria-label="phrases.Close emergency support" onclick="App.closeEmergencyPanel()">&times;</button>
          <div class="page-head emergency-head">
            <div>
              <span class="eyebrow" data-i18n="phrases.Urgent care">${this.t('phrases.Urgent care')}</span>
              <h2 id="emergencyTitle" data-i18n="common.emergencyHelp">${this.t('common.emergencyHelp')}</h2>
              <p class="muted" data-i18n="phrases.One button can alert contacts, share location, open hospital help, and notify PulseMD - Virtual Clinic support.">${this.t('phrases.One button can alert contacts, share location, open hospital help, and notify PulseMD - Virtual Clinic support.')}</p>
            </div>
          </div>
          <div class="emergency-quick-grid" aria-label="Emergency quick actions">
            <button type="button" class="emergency-action-card" onclick="App.handleEmergencyAction('ambulance')">
              <span>108</span>
              <strong data-i18n="phrases.Call ambulance">${this.t('phrases.Call ambulance')}</strong>
              <small data-i18n="phrases.For life-threatening emergencies in India, call 108 immediately.">${this.t('phrases.For life-threatening emergencies in India, call 108 immediately.')}</small>
            </button>
            <button type="button" class="emergency-action-card" onclick="App.handleEmergencyAction('emergency_contact')">
              <span>SOS</span>
              <strong data-i18n="phrases.Alert saved emergency contacts">${this.t('phrases.Alert saved emergency contacts')}</strong>
              <small data-i18n="phrases.This contact is used when you trigger Emergency Help from your dashboard.">${this.t('phrases.This contact is used when you trigger Emergency Help from your dashboard.')}</small>
            </button>
            <button type="button" class="emergency-action-card" onclick="App.handleEmergencyAction('nearest_hospital')">
              <span>MAP</span>
              <strong data-i18n="phrases.Quick access to nearby hospitals">${this.t('phrases.Quick access to nearby hospitals')}</strong>
              <small data-i18n="phrases.Share live location">${this.t('phrases.Share live location')}</small>
            </button>
          </div>
          <section class="emergency-map-panel" aria-label="Live location and nearby hospitals">
            <div class="emergency-map-head">
              <div>
                <strong>Live location & nearby hospitals</strong>
                <small id="emergencyMapStatus">Tap Emergency Help to show your location.</small>
              </div>
              <button type="button" class="secondary emergency-map-refresh" onclick="App.refreshEmergencyMap()">Refresh map</button>
            </div>
            <a id="emergencyShareLink" class="emergency-share-link" href="#" target="_blank" rel="noopener" hidden>Open / share Google Maps location</a>
            <div id="emergencyMap" class="emergency-map-canvas" role="img" aria-label="Map showing your emergency location">
              <span>Map will load after location permission.</span>
            </div>
            <div id="nearbyHospitalsList" class="nearby-hospitals-list">
              <p class="muted">Nearby hospitals will appear here after location access.</p>
            </div>
          </section>
          <div class="emergency-actions emergency-checklist">
            <label><input type="checkbox" name="emergencyActions" value="ambulance" checked> <span data-i18n="phrases.Call ambulance">${this.t('phrases.Call ambulance')}</span></label>
            <label><input type="checkbox" name="emergencyActions" value="emergency_contact" checked> <span data-i18n="phrases.Alert saved emergency contacts">${this.t('phrases.Alert saved emergency contacts')}</span></label>
            <label><input type="checkbox" name="emergencyActions" value="share_location" checked> <span data-i18n="phrases.Share live location">${this.t('phrases.Share live location')}</span></label>
            <label><input type="checkbox" name="emergencyActions" value="sos_message" checked> <span data-i18n="phrases.Send SOS message">${this.t('phrases.Send SOS message')}</span></label>
            <label><input type="checkbox" name="emergencyActions" value="nearest_hospital" checked> <span data-i18n="phrases.Quick access to nearby hospitals">${this.t('phrases.Quick access to nearby hospitals')}</span></label>
            <label><input type="checkbox" name="emergencyActions" value="emergency_chat" checked> <span data-i18n="phrases.Start emergency chat/support">${this.t('phrases.Start emergency chat/support')}</span></label>
          </div>
          <div class="actions emergency-mode-actions">
            <button type="button" class="danger" onclick="App.activateEmergencyMode()" data-i18n="phrases.Emergency mode ON">${this.t('phrases.Emergency mode ON')}</button>
            <button id="stopEmergencyModeBtn" type="button" class="secondary" onclick="App.stopEmergencyMode()" hidden data-i18n="phrases.Stop emergency mode">${this.t('phrases.Stop emergency mode')}</button>
          </div>
          <p class="emergency-warning" data-i18n="phrases.For life-threatening emergencies in India, call 108 immediately.">${this.t('phrases.For life-threatening emergencies in India, call 108 immediately.')}</p>
          <p id="emergencyStatus" class="status-line"></p>
        </article>
      </section>
    `);

    const panel = document.querySelector('#emergencyPanel');
    if (panel) {
      panel.addEventListener('click', (event) => {
        if (event.target === panel) this.closeEmergencyPanel();
      });
    }

    if (!window.__emergencyEscBound) {
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') this.closeEmergencyPanel();
      });
      window.__emergencyEscBound = true;
    }
  },
  openEmergencyPanel() {
    const panel = document.querySelector('#emergencyPanel');
    if (!panel) return;
    clearTimeout(this.emergencyCloseTimer);
    panel.hidden = false;
    panel.setAttribute('aria-hidden', 'false');
    panel.classList.remove('is-closing');
    requestAnimationFrame(() => panel.classList.add('is-open'));
    document.body.classList.add('modal-open');
    const stopButton = document.querySelector('#stopEmergencyModeBtn');
    if (stopButton) stopButton.hidden = !localStorage.getItem('activeEmergencyId');
    if (this.lastEmergencyLocation) {
      this.renderEmergencyMap(this.lastEmergencyLocation).catch(() => {});
    }
  },
  closeEmergencyPanel() {
    const panel = document.querySelector('#emergencyPanel');
    if (!panel || panel.hidden) return;
    panel.classList.remove('is-open');
    panel.classList.add('is-closing');
    panel.setAttribute('aria-hidden', 'true');

    clearTimeout(this.emergencyCloseTimer);
    this.emergencyCloseTimer = setTimeout(() => {
      panel.hidden = true;
      panel.classList.remove('is-closing');
    }, 220);

    document.body.classList.remove('modal-open');
    const status = document.querySelector('#emergencyStatus');
    if (status) status.textContent = '';
  },
  async ensureEmergencyContact() {
    if (this.patientEmergencyContact?.phone) return this.patientEmergencyContact;
    try {
      const profile = await this.request('/api/patient/profile');
      const raw = profile?.emergencyContact;
      this.patientEmergencyContact = typeof raw === 'string'
        ? { name: '', phone: raw }
        : { name: raw?.name || '', phone: raw?.phone || '' };
    } catch (error) {
      this.patientEmergencyContact = { name: '', phone: '' };
    }
    return this.patientEmergencyContact;
  },
  async getEmergencyLocation() {
    if (!navigator.geolocation) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
      );
    });
  },
  normalizeEmergencyLocation(location) {
    const latitude = Number(location?.latitude ?? location?.lat);
    const longitude = Number(location?.longitude ?? location?.lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return {
      latitude,
      longitude,
      accuracy: Number(location?.accuracy) || null
    };
  },
  emergencyMapsLink(location) {
    const point = this.normalizeEmergencyLocation(location);
    if (!point) return 'https://maps.google.com';
    return `https://maps.google.com/?q=${encodeURIComponent(`${point.latitude},${point.longitude}`)}`;
  },
  hospitalSearchLink(location) {
    const point = this.normalizeEmergencyLocation(location);
    if (!point) return 'https://www.google.com/maps/search/nearest+hospital';
    return `https://www.google.com/maps/search/hospitals/@${point.latitude},${point.longitude},14z`;
  },
  async loadGoogleMapsApi() {
    if (window.google?.maps?.places && window.google?.maps?.geometry) return window.google.maps;
    if (this.googleMapsReady) return this.googleMapsReady;

    this.googleMapsReady = this.request('/api/config/maps').then((config) => new Promise((resolve, reject) => {
      const apiKey = config.googleMapsApiKey;
      if (!apiKey) {
        reject(new Error('Google Maps API key is not configured.'));
        return;
      }

      window.__pulseMdMapsReady = () => resolve(window.google.maps);
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,geometry&callback=__pulseMdMapsReady`;
      script.async = true;
      script.defer = true;
      script.onerror = () => reject(new Error('Google Maps could not load.'));
      document.head.appendChild(script);
    })).catch((error) => {
      this.googleMapsReady = null;
      throw error;
    });

    return this.googleMapsReady;
  },
  setEmergencyMapStatus(message, isError = false) {
    const status = document.querySelector('#emergencyMapStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', Boolean(isError));
  },
  formatDistance(meters) {
    const distance = Number(meters);
    if (!Number.isFinite(distance)) return 'Distance unavailable';
    if (distance < 1000) return `${Math.round(distance)} m away`;
    return `${(distance / 1000).toFixed(distance < 10000 ? 1 : 0)} km away`;
  },
  renderEmergencyFallback(location, reason = '') {
    const point = this.normalizeEmergencyLocation(location);
    const map = document.querySelector('#emergencyMap');
    const shareLink = document.querySelector('#emergencyShareLink');
    const hospitalsList = document.querySelector('#nearbyHospitalsList');
    const mapsLink = this.emergencyMapsLink(point);
    const hospitalLink = this.hospitalSearchLink(point);

    if (this.emergencyUserMarker) this.emergencyUserMarker.setMap(null);
    this.emergencyHospitalMarkers.forEach((marker) => marker.setMap(null));
    this.emergencyMap = null;
    this.emergencyUserMarker = null;
    this.emergencyHospitalMarkers = [];

    if (shareLink) {
      shareLink.href = mapsLink;
      shareLink.hidden = false;
    }
    if (map) {
      map.innerHTML = `
        <div class="emergency-map-fallback">
          <strong>${point ? 'Location ready for sharing' : 'Location not available yet'}</strong>
          <span>${point ? `${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}` : 'Allow location permission to show the emergency map.'}</span>
          <a href="${mapsLink}" target="_blank" rel="noopener">Open Google Maps location</a>
        </div>
      `;
    }
    if (hospitalsList) {
      hospitalsList.innerHTML = `
        <article class="nearby-hospital-card">
          <div>
            <strong>Hospital search</strong>
            <small>${escapeHtml(reason || 'Add Google Maps API key to show live Places results here.')}</small>
          </div>
          <a href="${hospitalLink}" target="_blank" rel="noopener">Open nearby hospitals</a>
        </article>
      `;
    }
    this.setEmergencyMapStatus(point ? 'Maps fallback is ready. Places list needs Google API key.' : 'Location permission is needed for map sharing.', !point);
  },
  renderNearbyHospitals(places = [], origin) {
    const hospitalsList = document.querySelector('#nearbyHospitalsList');
    if (!hospitalsList) return;
    const googleMaps = window.google?.maps;
    const originLatLng = new googleMaps.LatLng(origin.latitude, origin.longitude);
    const hospitals = places
      .filter((place) => place.geometry?.location)
      .map((place) => ({
        name: place.name || 'Nearby hospital',
        address: place.vicinity || place.formatted_address || 'Address unavailable',
        rating: place.rating ? `${place.rating} rating` : '',
        placeId: place.place_id,
        distance: googleMaps.geometry.spherical.computeDistanceBetween(originLatLng, place.geometry.location)
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 6);

    if (!hospitals.length) {
      hospitalsList.innerHTML = `
        <article class="nearby-hospital-card">
          <div>
            <strong>No hospitals found nearby</strong>
            <small>Try opening Google Maps search for wider results.</small>
          </div>
          <a href="${this.hospitalSearchLink(origin)}" target="_blank" rel="noopener">Search maps</a>
        </article>
      `;
      return;
    }

    hospitalsList.innerHTML = hospitals.map((hospital, index) => {
      const directionsUrl = hospital.placeId
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hospital.name)}&query_place_id=${encodeURIComponent(hospital.placeId)}`
        : this.hospitalSearchLink(origin);
      return `
        <article class="nearby-hospital-card">
          <span class="hospital-rank">${index + 1}</span>
          <div>
            <strong>${escapeHtml(hospital.name)}</strong>
            <small>${this.formatDistance(hospital.distance)}${hospital.rating ? ` · ${escapeHtml(hospital.rating)}` : ''}</small>
            <small>${escapeHtml(hospital.address)}</small>
          </div>
          <a href="${directionsUrl}" target="_blank" rel="noopener">Directions</a>
        </article>
      `;
    }).join('');
  },
  async renderEmergencyMap(location) {
    const point = this.normalizeEmergencyLocation(location);
    if (!point) {
      this.renderEmergencyFallback(null);
      return null;
    }

    this.lastEmergencyLocation = point;
    const shareLink = document.querySelector('#emergencyShareLink');
    if (shareLink) {
      shareLink.href = this.emergencyMapsLink(point);
      shareLink.hidden = false;
    }
    this.setEmergencyMapStatus('Loading map and nearby hospitals...');

    let maps;
    try {
      maps = await this.loadGoogleMapsApi();
    } catch (error) {
      this.renderEmergencyFallback(point, error.message);
      return point;
    }

    const mapNode = document.querySelector('#emergencyMap');
    if (!mapNode) return point;
    const userLatLng = { lat: point.latitude, lng: point.longitude };

    if (!this.emergencyMap) {
      mapNode.innerHTML = '';
      this.emergencyMap = new maps.Map(mapNode, {
        center: userLatLng,
        zoom: 15,
        mapTypeControl: false,
        fullscreenControl: false,
        streetViewControl: false
      });
    } else {
      this.emergencyMap.setCenter(userLatLng);
      this.emergencyMap.setZoom(15);
    }

    if (this.emergencyUserMarker) this.emergencyUserMarker.setMap(null);
    this.emergencyHospitalMarkers.forEach((marker) => marker.setMap(null));
    this.emergencyHospitalMarkers = [];

    this.emergencyUserMarker = new maps.Marker({
      position: userLatLng,
      map: this.emergencyMap,
      title: 'Your emergency location',
      label: 'SOS'
    });

    const service = new maps.places.PlacesService(this.emergencyMap);
    await new Promise((resolve) => {
      service.nearbySearch({
        location: userLatLng,
        radius: 5000,
        type: 'hospital'
      }, (results, status) => {
        if (status === maps.places.PlacesServiceStatus.OK && Array.isArray(results)) {
          const visibleResults = results.slice(0, 6);
          visibleResults.forEach((place, index) => {
            if (!place.geometry?.location) return;
            this.emergencyHospitalMarkers.push(new maps.Marker({
              position: place.geometry.location,
              map: this.emergencyMap,
              title: place.name,
              label: String(index + 1)
            }));
          });
          this.renderNearbyHospitals(visibleResults, point);
          this.setEmergencyMapStatus(`Showing ${visibleResults.length} nearby hospital(s) within 5 km.`);
        } else {
          this.renderNearbyHospitals([], point);
          this.setEmergencyMapStatus('No nearby hospital results found. Google Maps search is available.');
        }
        resolve();
      });
    });

    return point;
  },
  async refreshEmergencyMap() {
    this.setEmergencyMapStatus('Getting your live location...');
    const location = await this.getEmergencyLocation();
    if (!location) {
      this.renderEmergencyFallback(null);
      return null;
    }
    return this.renderEmergencyMap(location);
  },
  async startEmergencyHelp() {
    this.openEmergencyPanel();
    const status = document.querySelector('#emergencyStatus');
    if (this.emergencyStartInProgress) {
      if (status) status.textContent = 'Emergency alert is already being sent...';
      return;
    }

    this.emergencyStartInProgress = true;
    if (status) {
      status.textContent = 'Getting your location and sending emergency SMS alerts...';
      status.classList.remove('error');
    }

    try {
      const location = await this.getEmergencyLocation();
      if (location) {
        this.lastEmergencyLocation = location;
        this.renderEmergencyMap(location).catch(() => {});
      } else {
        this.renderEmergencyFallback(null);
      }
      const mapsUrl = location ? this.emergencyMapsLink(location) : '';
      const data = await this.request('/send-sos', {
        method: 'POST',
        body: JSON.stringify({
          location,
          message: `\u{1F6A8} EMERGENCY ALERT!\nUser needs urgent help.\nLocation: ${mapsUrl || 'Location unavailable'}`
        })
      });

      this.activeEmergency = data.emergency;
      if (data.emergency?._id) localStorage.setItem('activeEmergencyId', data.emergency._id);
      const stopButton = document.querySelector('#stopEmergencyModeBtn');
      if (stopButton) stopButton.hidden = false;
      if (status) {
        const smsCount = data.sms?.count || data.sms?.recipients?.length || 0;
        const locationNote = location ? '' : ' Location permission was unavailable.';
        status.textContent = data.message || `Emergency alert sent to ${smsCount} saved contact(s).${locationNote}`;
        status.classList.toggle('error', Boolean(data.sms && !data.sms.success));
      }
    } catch (error) {
      if (status) {
        status.textContent = error.message || 'Could not send emergency alert.';
        status.classList.add('error');
      }
    } finally {
      this.emergencyStartInProgress = false;
    }
  },
  async emergencyClick(numbers = '') {
    const status = document.querySelector('#emergencyStatus');
    if (!navigator.geolocation) {
      if (status) {
        status.textContent = 'Location is not supported on this device.';
        status.classList.add('error');
      }
      throw new Error('Location is not supported on this device.');
    }

    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const location = { latitude: lat, longitude: lng, accuracy: pos.coords.accuracy };
        const message = `\u{1F6A8} Emergency! Location: https://maps.google.com/?q=${lat},${lng}`;
        this.renderEmergencyMap(location).catch(() => {});

        try {
          const response = await fetch(`${API_BASE}/send-emergency`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
            },
            body: JSON.stringify({
              numbers,
              message
            })
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.message || 'Emergency SMS failed.');
          if (status) {
            status.textContent = data.message || 'Emergency SMS sent.';
            status.classList.remove('error');
          }
          resolve(data);
        } catch (error) {
          if (status) {
            status.textContent = error.message;
            status.classList.add('error');
          }
          reject(error);
        }
      }, (error) => {
        const message = error.message || 'Could not get current location.';
        if (status) {
          status.textContent = message;
          status.classList.add('error');
        }
        reject(new Error(message));
      }, { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 });
    });
  },
  async logEmergency(type, message = '') {
    try {
      const location = await this.getEmergencyLocation();
      const data = await this.request('/api/emergency/trigger', {
        method: 'POST',
        body: JSON.stringify({ type, message, location })
      });
      const status = document.querySelector('#emergencyStatus');
      if (status) {
        status.textContent = data.message || 'Emergency request sent.';
        status.classList.remove('error');
      }
      return data;
    } catch (error) {
      const status = document.querySelector('#emergencyStatus');
      if (status) {
        status.textContent = error.message;
        status.classList.add('error');
      }
      throw error;
    }
  },
  async handleEmergencyAction(type) {
    const labels = {
      ambulance: 'Call ambulance now on 108?',
      emergency_contact: 'Call your emergency contact now?',
      nearest_hospital: 'Open nearest hospitals in maps?',
      quick_alert: 'Send a quick alert message now?'
    };
    if (!window.confirm(labels[type] || 'Proceed with emergency action?')) return;

    const status = document.querySelector('#emergencyStatus');
    if (status) {
      status.textContent = 'Processing emergency action...';
      status.classList.remove('error');
    }

    if (type === 'ambulance') {
      try {
        await this.logEmergency(type, 'Patient initiated ambulance call.');
      } catch (error) {
        // Keep 108 available even if the online alert could not be saved.
      }
      window.location.href = 'tel:108';
      return;
    }

    if (type === 'emergency_contact') {
      const contact = await this.ensureEmergencyContact();
      if (!contact?.phone) {
        if (status) {
          status.textContent = 'No emergency contact found in profile. Add one from Profile > Emergency support.';
          status.classList.add('error');
        }
        return;
      }
      try {
        await this.logEmergency(type, `Emergency contact call initiated: ${contact.phone}`);
      } catch (error) {
        // Phone call is still useful if the network request fails.
      }
      window.location.href = `tel:${contact.phone}`;
      return;
    }

    if (type === 'nearest_hospital') {
      const location = await this.refreshEmergencyMap();
      try {
        await this.logEmergency(type, 'Patient requested nearest hospital directions.');
      } catch (error) {
        // Maps should still open as a fallback.
      }
      window.open(this.hospitalSearchLink(location || this.lastEmergencyLocation), '_blank', 'noopener');
      if (status) status.textContent = 'Opened nearest hospital search.';
      return;
    }

    if (type === 'quick_alert') {
      const text = `Emergency alert from ${this.user?.name || 'PulseMD - Virtual Clinic patient'} at ${new Date().toLocaleString('en-IN')}. Please call me immediately.`;
      await this.logEmergency(type, text);
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
        } catch (error) {
          // Clipboard can fail on insecure contexts; alert text is still shown.
        }
      }
      alert(`Quick alert:\n${text}`);
      if (status) status.textContent = 'Quick alert prepared and copied.';
    }
  },
  async activateEmergencyMode() {
    if (!window.confirm('Activate emergency mode and trigger selected actions now?')) return;
    const status = document.querySelector('#emergencyStatus');
    const actions = [...document.querySelectorAll('input[name="emergencyActions"]:checked')].map((item) => item.value);
    if (!actions.length) {
      if (status) {
        status.textContent = 'Select at least one emergency action.';
        status.classList.add('error');
      }
      return;
    }

    if (status) {
      status.textContent = 'Activating emergency mode...';
      status.classList.remove('error');
    }

    try {
      const location = await this.getEmergencyLocation();
      if (location) {
        this.lastEmergencyLocation = location;
        this.renderEmergencyMap(location).catch(() => {});
      } else {
        this.renderEmergencyFallback(null);
      }
      const data = await this.request('/api/emergency/activate', {
        method: 'POST',
        body: JSON.stringify({
          actions,
          location,
          message: `One-button emergency activated by ${this.user?.name || 'patient'}.`
        })
      });
      this.activeEmergency = data.emergency;
      localStorage.setItem('activeEmergencyId', data.emergency._id);
      const stopButton = document.querySelector('#stopEmergencyModeBtn');
      if (stopButton) stopButton.hidden = false;
      if (status) status.textContent = data.message || 'Emergency mode is active.';
      if (actions.includes('ambulance')) setTimeout(() => { window.location.href = 'tel:108'; }, 500);
      if (actions.includes('nearest_hospital')) window.open(this.hospitalSearchLink(location || this.lastEmergencyLocation), '_blank', 'noopener');
    } catch (error) {
      if (status) {
        status.textContent = error.message;
        status.classList.add('error');
      }
    }
  },
  async stopEmergencyMode() {
    const emergencyId = this.activeEmergency?._id || localStorage.getItem('activeEmergencyId');
    const status = document.querySelector('#emergencyStatus');
    if (!emergencyId) {
      if (status) status.textContent = 'No active emergency mode found.';
      return;
    }
    if (!window.confirm('Stop emergency mode now?')) return;

    try {
      const data = await this.request(`/api/emergency/${emergencyId}/stop`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'CANCELLED' })
      });
      this.activeEmergency = null;
      localStorage.removeItem('activeEmergencyId');
      const stopButton = document.querySelector('#stopEmergencyModeBtn');
      if (stopButton) stopButton.hidden = true;
      if (status) {
        status.textContent = data.message || 'Emergency mode stopped.';
        status.classList.remove('error');
      }
    } catch (error) {
      if (status) {
        status.textContent = error.message;
        status.classList.add('error');
      }
    }
  },
  toggleNav(button) {
    const topbar = button.closest('.topbar');
    if (!topbar) return;

    const isOpen = topbar.classList.toggle('open');
    button.setAttribute('aria-expanded', String(isOpen));
    button.setAttribute('aria-label', isOpen ? 'Close menu' : 'Open menu');
    document.body.classList.toggle('nav-open', isOpen);
  },
  closeNav() {
    const topbar = document.querySelector('.topbar');
    const button = document.querySelector('.nav-toggle');
    if (!topbar || !button) return;
    topbar.classList.remove('open');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Open menu');
    document.body.classList.remove('nav-open');
  },
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('doctorRoom');
    localStorage.removeItem('activePatientId');
    localStorage.removeItem('activePatientName');
    localStorage.removeItem('doctorVideoRoom');
    window.location.href = '/login.html';
  },
  requireAuth() {
    if (!this.token || !this.user) {
      window.location.href = '/login.html';
      return null;
    }
    return this.user;
  },
  async request(path, options = {}) {
    try {
      const isFormData = options.body instanceof FormData || options.isFormData;
      const headers = {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(options.headers || {})
      };
      const requestOptions = { ...options, headers };
      delete requestOptions.isFormData;

      const response = await fetch(`${API_BASE}${path}`, {
        ...requestOptions
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'Request failed.');
      return data;
    } catch (error) {
      throw new Error(error.message || 'Backend connection failed.');
    }
  },
  socket() {
    return io(API_BASE || undefined, {
      auth: { token: this.token }
    });
  },
  updatePatientNotificationBadges(count = Number(localStorage.getItem('patientUnread') || 0)) {
    document.querySelectorAll('#patientNotificationBadge, .patient-notification-badge').forEach((badge) => {
      if (!badge) return;
      badge.hidden = count <= 0;
      badge.textContent = count > 99 ? '99+' : String(count);
    });
  },
  async loadPatientNotificationCount() {
    const user = this.user;
    if (!user || user.role !== 'patient') return;
    try {
      const data = await this.request(`/api/patient/notifications/${user._id}`);
      localStorage.setItem('patientUnread', String(data.unreadCount || 0));
      this.updatePatientNotificationBadges(data.unreadCount || 0);
    } catch (error) {
      console.warn('Could not load patient notification count:', error.message);
      this.updatePatientNotificationBadges();
    }
  },
  ensureIncomingCallModal() {
    if (document.querySelector('#pulsemdIncomingCallModal')) return;
    const modal = document.createElement('div');
    modal.id = 'pulsemdIncomingCallModal';
    modal.hidden = true;
    modal.className = 'pulsemd-call-modal';
    modal.innerHTML = `
      <div class="pulsemd-call-backdrop" aria-hidden="true"></div>
      <div class="pulsemd-call-dialog" role="dialog" aria-modal="true" aria-labelledby="pulsemdIncomingCallTitle">
        <div class="pulsemd-call-header">
          <div class="avatar avatar-fallback" id="pulsemdIncomingCallAvatar">DR</div>
          <div>
            <p class="muted">Incoming Call</p>
            <h3 id="pulsemdIncomingCallTitle">Dr. Name</h3>
          </div>
        </div>
        <p id="pulsemdIncomingCallMeta" class="pulsemd-call-meta">Video call</p>
        <div class="actions pulsemd-call-actions">
          <button type="button" id="pulsemdAcceptCallBtn">Accept</button>
          <button type="button" id="pulsemdDeclineCallBtn" class="secondary">Decline</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    document.getElementById('pulsemdAcceptCallBtn')?.addEventListener('click', async () => {
      const callId = localStorage.getItem('incomingCallId');
      const roomId = localStorage.getItem('incomingCallRoomId');
      if (!callId) return;
      try {
        const response = await App.request('/api/video-call/accept', {
          method: 'POST',
          body: JSON.stringify({ callId, roomId })
        });
        localStorage.setItem('activeVideoCallId', response.call?._id || callId);
        localStorage.setItem('activeCallRoomId', response.call?.roomId || roomId);
        localStorage.setItem('callMode', response.call?.callType || localStorage.getItem('callMode') || 'video');
        this.hideIncomingCallModal();
        window.location.href = '/video.html';
      } catch (error) {
        console.warn('Could not accept incoming call:', error.message);
        this.hideIncomingCallModal();
        alert(error.message || 'Could not accept call.');
      }
    });

    document.getElementById('pulsemdDeclineCallBtn')?.addEventListener('click', async () => {
      const callId = localStorage.getItem('incomingCallId');
      if (!callId) {
        this.hideIncomingCallModal();
        return;
      }
      try {
        await App.request('/api/video-call/decline', {
          method: 'POST',
          body: JSON.stringify({ callId })
        });
      } catch (error) {
        console.warn('Could not decline incoming call:', error.message);
      }
      this.hideIncomingCallModal();
    });
  },
  showIncomingCallModal(call = {}) {
    this.ensureIncomingCallModal();
    const modal = document.getElementById('pulsemdIncomingCallModal');
    if (!modal) return;

    const doctorName = call.doctorName || call.doctor?.name || 'Doctor';
    const callType = call.callType === 'audio' ? 'Audio Call' : 'Video Call';
    const roomId = call.roomId || call.room || '';
    const doctorId = call.doctorId || call.doctor?._id || '';

    const title = document.getElementById('pulsemdIncomingCallTitle');
    const meta = document.getElementById('pulsemdIncomingCallMeta');
    const avatar = document.getElementById('pulsemdIncomingCallAvatar');
    if (title) title.textContent = `Dr. ${doctorName}`;
    if (meta) meta.textContent = `${callType} • ${roomId}`;
    if (avatar) {
      avatar.textContent = doctorName ? doctorName.split(' ').map((part) => part[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || 'DR' : 'DR';
    }

    localStorage.setItem('incomingCallId', call.callId || call._id || '');
    localStorage.setItem('incomingCallRoomId', roomId);
    localStorage.setItem('incomingDoctorId', doctorId);
    localStorage.setItem('callMode', call.callType || 'video');

    modal.hidden = false;
    document.body.classList.add('modal-open');

    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('Incoming call', { body: `Dr. ${doctorName} is calling you.` });
    }
  },
  hideIncomingCallModal() {
    const modal = document.getElementById('pulsemdIncomingCallModal');
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    localStorage.removeItem('incomingCallId');
    localStorage.removeItem('incomingCallRoomId');
    localStorage.removeItem('incomingDoctorId');
  },
  connectPatientNotifications() {
    const user = this.user;
    if (!user || user.role !== 'patient' || typeof io === 'undefined') return;
    if (window.__patientNotificationsConnected) return;
    window.__patientNotificationsConnected = true;
    const socket = this.socket();
    socket.on('connect', () => {
      console.log('Patient notification socket connected.');
    });
    socket.on('patientNotification', async (notice) => {
      console.log('Patient notification received:', notice);
      await this.loadPatientNotificationCount();
      await this.loadPatientNotificationDropdown();
      if (typeof window.refreshPatientNotifications === 'function') {
        await window.refreshPatientNotifications();
      }
    });
    socket.on('videoCallStatus', (notice) => {
      const status = String(notice?.status || '').toLowerCase();
      if (status === 'ringing' || status === 'calling') {
        this.showIncomingCallModal({
          ...notice.call,
          doctorName: notice.call?.doctorName || notice.doctorName || 'Doctor',
          doctorId: notice.call?.doctorId || notice.doctorId,
          callId: notice.call?.callId || notice.call?._id,
          roomId: notice.call?.roomId || notice.roomId,
          callType: notice.call?.callType || notice.callType || 'video'
        });
      } else if (status === 'accepted' || status === 'declined' || status === 'ended' || status === 'missed') {
        this.hideIncomingCallModal();
      }
    });
    socket.on('connect_error', (error) => {
      console.warn('Patient notification socket error:', error.message);
    });
  }
};

function $(selector) {
  return document.querySelector(selector);
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[char]));
}

function formatDateTime(value) {
  if (!value) return App.translatePhrase('Not scheduled');
  const locale = App.currentLanguage() === 'hi' ? 'hi-IN' : 'en-IN';
  return new Date(value).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
}

function formatMoney(value) {
  const locale = App.currentLanguage() === 'hi' ? 'hi-IN' : 'en-IN';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(Number(value || 0));
}

document.addEventListener('DOMContentLoaded', () => {
  App.installI18nDialogs();
  App.initTheme();
  App.mountGlobalLanguageSwitcher();
  App.applyLanguage();
});

window.emergencyClick = function emergencyClick(numbers = '') {
  return App.emergencyClick(numbers);
};
