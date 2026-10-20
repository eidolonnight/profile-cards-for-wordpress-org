/* Profile Cards for WordPress.org: independent profile card builder. */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const profileToggles = ['name', 'jobTitle', 'organization', 'handle', 'location', 'joined', 'teams'];
  const optionalToggles = ['badgeNames', 'social'];
  const toggles = ['avatar', 'badges', 'link', ...profileToggles, ...optionalToggles];
  const defaultVisibility = () => true;
  const colors = ['headerColor', 'nameColor', 'subHeaderColor', 'badgeLabelColor', 'foreground'];
  const layouts = ['profile', 'square', 'classic', 'avatar', 'announcement'];
  const isSocial = (layout = $('layout').value) => layout === 'avatar' || layout === 'announcement';
  const isModern = (layout = $('layout').value) => layout === 'profile' || layout === 'square';
  const visibilityKeys = (layout) => layout === 'avatar' ? ['avatar']
    : layout === 'announcement' ? ['avatar', 'name', 'handle', 'eventDetails']
      : isModern(layout) ? toggles : ['avatar', 'badges', 'link'];
  const profileFieldsHelp = $('public-fields-help').textContent;
  const palettes = {
    light: ['191E23', '191E23', '50575E', '23282D', 'FFFFFF'],
    dark: ['F6F7F7', 'F6F7F7', 'C3C4C7', 'F0F0F1', '191E23'],
  };
  const state = {
    profile: null, username: '', profileVersion: 0, renderVersion: 0,
    profileController: null, renderController: null, timer: null,
    svg: null, previewURL: null, ready: false, demo: false,
    layout: 'profile', layoutChoices: {}, customColorKeys: new Set(),
    selectionUsername: '', omitTeams: new Set(),
    catalog: null, catalogPromise: null, catalogFailed: false,
    pendingEvent: null, pendingRole: null, restoreInvalid: false,
    rendererPromise: null, previewInputs: null, inputRequest: null, previewUnavailable: false,
    background: null, backgroundModule: null, backgroundPromise: null,
    backgroundVersion: 0, backgroundPending: null, backgroundJob: false,
    backgroundBusy: false, backgroundError: '',
  };

  function status(message, kind = '') {
    $('status-message').textContent = message;
    $('cache-note').textContent = '';
    $('status-warning').textContent = '';
    $('status').dataset.kind = kind;
  }

  function placeholder(title, description) {
    $('empty-title').textContent = title;
    $('empty-description').textContent = description;
    $('empty-state').hidden = false;
  }

  function clearCard() {
    state.ready = false;
    state.svg = null;
    $('cache-note').textContent = '';
    $('status-warning').textContent = '';

    $('exports').disabled = true;
    $('card-preview').hidden = true;
    $('card-preview').removeAttribute('src');
    $('profile-meta').hidden = true;
    $('open-preview').removeAttribute('href');

    if (state.previewURL) URL.revokeObjectURL(state.previewURL);
    state.previewURL = null;
  }

  function cancelRender() {
    clearTimeout(state.timer);
    state.timer = null;
    state.renderVersion += 1;
    if (state.renderController) state.renderController.abort();
    state.renderController = null;
    clearCard();
  }

  function invalidateProfile() {
    // Selections survive refreshes/renders, but never leak to a different user.
    if (state.selectionUsername !== $('username').value) {
      state.omitTeams.clear();

      state.selectionUsername = $('username').value;
    }
    $('individual-details').hidden = true;
    $('team-options').replaceChildren();

    state.profileVersion += 1;
    if (state.profileController) state.profileController.abort();
    state.profileController = null;
    state.profile = null;
    state.username = '';
    state.demo = false;
    if (state.inputRequest) state.inputRequest.controller.abort();
    state.inputRequest = null;
    state.previewInputs = null;
    state.previewUnavailable = false;
    cancelRender();
    $('preview-stage').setAttribute('aria-busy', 'false');
    $('create-button').textContent = 'Create card ↗';
    placeholder('A small card. Your story.', 'Enter a username to see your real profile here.');
    status('Create a card to look up this profile.');
  }

  function parameters(username) {
    const layout = $('layout').value;
    const params = new URLSearchParams({ username, layout });
    for (const key of visibilityKeys(layout)) {
      params.set(key, String($(key).checked));
    }
    const applicableColors = layout === 'avatar' ? ['foreground', 'headerColor']
      : layout === 'announcement' ? colors.filter(key => key !== 'badgeLabelColor') : colors;
    for (const key of applicableColors) params.set(key, $(key).value.slice(1).toUpperCase());
    if (isSocial(layout)) {
      params.set('event', $('event').value);
      params.set('role', $('role').value);
    } else if (isModern(layout)) {
      if (state.omitTeams.size) params.set('omitTeams', [...state.omitTeams].join(','));
    }
    return params;
  }

  function syncAutomaticColors() {
    const event = isSocial() ? state.catalog?.events.find(item => item.id === $('event').value) : null;
    // Automatic colors follow the event. An individually edited color, an
    // explicit URL color, or Light/Dark is retained until Event colors resets it.
    colors.forEach((key, index) => {
      if (!state.customColorKeys.has(key)) $(key).value = '#' + (event?.colors?.[key] || palettes.light[index]);
    });
  }

  function syncControls() {
    const layout = $('layout').value;
    const profileLayout = isModern(layout), social = isSocial(layout), announcement = layout === 'announcement';
    syncAutomaticColors();
    $('preset-event').hidden = !social;
    $('preset-event').disabled = social && !state.catalog;
    $('builder').dataset.layout = layout;
    $('profile-fields').hidden = !profileLayout && !announcement;
    $('public-fields-help').hidden = !profileLayout && !announcement;
    $('public-fields-help').textContent = announcement
      ? 'Your name and username come from your public profile. Uncheck either to leave it off the image.' : profileFieldsHelp;
    for (const key of profileToggles) {
      const applicable = profileLayout || (announcement && ['name', 'handle'].includes(key));
      $(key).closest('label').hidden = !applicable;
      $(key).disabled = !applicable;
    }
    $('individual-details').hidden = !profileLayout || !state.profile;
    $('avatar-label').textContent = layout === 'avatar' ? 'Include my profile photo' : 'Avatar';
    $('badges').closest('label').hidden = social;
    $('badges').disabled = social;
    $('badgeNames').closest('label').hidden = !profileLayout;
    $('badgeNames').disabled = !profileLayout || !$('badges').checked;
    $('social-setting').hidden = !profileLayout;
    $('social-help').hidden = !profileLayout;
    $('social').disabled = !profileLayout;
    $('profile-link-setting').hidden = social;
    $('link').disabled = social;
    $('team-items').disabled = !profileLayout || !$('teams').checked;
    $('event-settings').hidden = !social;
    $('event-controls').disabled = !social || !state.catalog;
    $('eventDetails').closest('label').hidden = !announcement;
    $('badgeLabelColor').closest('label').hidden = social;
    $('badgeLabelColor').closest('label').querySelector('span').textContent = profileLayout ? 'Badge icons & teams' : 'Badge labels';
    for (const key of ['nameColor', 'subHeaderColor']) $(key).closest('label').hidden = layout === 'avatar';
    $('foreground').closest('label').querySelector('span').textContent = layout === 'avatar' ? 'Frame' : 'Background';
    $('headerColor').closest('label').querySelector('span').textContent = layout === 'avatar' ? 'Frame text' : announcement ? 'Event text' : 'Header';

    $('open-preview').textContent = social ? 'View full-size image ↗' : 'View full-size card ↗';
    syncBackgroundControls();
    if (state.catalog) updateEventNote();
  }

  function backgroundOptions() {
    return {
      x: Number($('background-x').value), y: Number($('background-y').value),
      zoom: Number($('background-zoom').value), tint: $('background-tint').value,
      tintOpacity: Number($('background-strength').value) / 100,
    };
  }

  function syncBackgroundControls() {
    $('background-controls').hidden = !state.background;
    $('background-controls').disabled = !state.background || state.backgroundBusy || Boolean(state.backgroundError);
    $('background-remove').hidden = !state.background && !state.backgroundBusy && !state.backgroundError;
    $('background-choose').textContent = state.background || state.backgroundBusy ? 'Replace background image' : 'Choose background image';
    $('background-status').textContent = state.backgroundBusy ? 'Preparing your background in this browser…'
      : state.backgroundError || (state.background ? 'Background added. The original photo is not included in downloads; only your cropped, re-encoded image is used.' : 'No custom background selected.');
    $('background-status').dataset.kind = state.backgroundError ? 'error' : '';
    $('background-shape-note').textContent = $('layout').value === 'avatar'
      ? 'The image fills the frame’s ring. Your profile photo or transparent center and the outer corners stay unchanged.'
      : 'The image fills the card. Adjust the crop and add a tint to keep your text readable.';
    for (const key of ['x', 'y', 'zoom', 'strength']) {
      $(`background-${key}-value`).textContent = $('background-' + key).value + (key === 'zoom' ? '×' : '%');
    }
  }

  function resetBackground() {
    state.backgroundVersion += 1;
    state.backgroundPending = null;
    state.backgroundBusy = false;
    state.backgroundError = '';
    state.background?.dispose();
    state.background = null;
    $('background-file').value = '';
    syncBackgroundControls();
  }

  async function backgroundModule() {
    if (!state.backgroundPromise) {
      state.backgroundPromise = import('/background.js').then(module => {
        if (typeof module.loadBackground !== 'function' || typeof module.applyBackground !== 'function') throw new Error('Invalid image tools.');
        state.backgroundModule = module;
        return module;
      }).catch(() => {
        state.backgroundPromise = null;
        throw new Error('Background tools could not load. Reload the page, or remove the background to continue.');
      });
    }
    return state.backgroundPromise;
  }

  async function processBackgroundQueue() {
    if (state.backgroundJob) return;
    state.backgroundJob = true;
    try {
      // Only one decode runs at a time. Rapid selections replace the one queued
      // File, rather than starting unbounded image decoders in parallel.
      while (state.backgroundPending) {
        const { file, version } = state.backgroundPending;
        state.backgroundPending = null;
        try {
          const module = await backgroundModule();
          if (version !== state.backgroundVersion) continue;
          const image = await module.loadBackground(file);
          if (version !== state.backgroundVersion) { image.dispose(); continue; }
          state.background = image;
          state.backgroundBusy = false;
          state.backgroundError = '';
          syncBackgroundControls();
          scheduleRender();
        } catch (error) {
          if (version !== state.backgroundVersion) continue;
          state.backgroundBusy = false;
          state.backgroundError = `Could not use this background. ${error.message} Choose another image or remove the background.`;
          syncBackgroundControls();
          scheduleRender();
        }
      }
    } finally { state.backgroundJob = false; }
  }

  function chooseBackground() {
    const file = $('background-file').files?.[0];
    $('background-file').value = ''; // Never restore a file through browser form state.
    if (!file) return;
    resetBackground();
    state.backgroundBusy = true;
    state.backgroundPending = { file, version: state.backgroundVersion };
    for (const [key, value] of [['x', '50'], ['y', '50'], ['zoom', '1'], ['strength', '35']]) $('background-' + key).value = value;
    $('background-tint').value = $('foreground').value;
    syncBackgroundControls();
    scheduleRender(); // Invalidate every in-flight render/download immediately.
    void processBackgroundQueue();
  }

  function updateEventNote() {
    const event = state.catalog?.events.find(item => item.id === $('event').value);
    if (!event) return;
    // Catalog metadata remains available to the graphics, not duplicated here.
    $('event-note').textContent = '';
    $('event-note').hidden = true;
    $('event-source').href = event.url;
    $('event-source').hidden = false;
  }

  function validCatalog(data) {
    const list = (items, max) => Array.isArray(items) && items.length > 0 && items.length <= max
      && items.every(item => item && typeof item === 'object') && new Set(items.map(item => item.id)).size === items.length;
    const text = (value, max = 250) => typeof value === 'string' && value.length <= max;
    if (!list(data?.events, 30) || !list(data?.roles, 10)) return false;
    return data.events.every(event => {
      try {
        const url = new URL(event.url);
        return /^[a-z]+-20\d{2}$/.test(event.id) && text(event.label) && text(event.name)
          && text(event.dateLabel) && text(event.location) && text(event.note) && /^20\d{2}-\d{2}-\d{2}$/.test(event.checkedAt)
          && (event.styleNote === undefined || text(event.styleNote))
          && (event.colors === undefined || (event.colors && typeof event.colors === 'object' && !Array.isArray(event.colors)
            && Object.keys(event.colors).length === colors.length
            && colors.every(key => Object.hasOwn(event.colors, key) && typeof event.colors[key] === 'string' && /^[0-9a-f]{6}$/i.test(event.colors[key]))))
          && url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.search && !url.hash
          && /^(asia|europe|us|india)\.wordcamp\.org$/.test(url.hostname) && /^\/20\d{2}\/$/.test(url.pathname);
      } catch { return false; }
    }) && data.roles.every(role => /^[a-z]{1,24}$/.test(role.id) && text(role.label, 80) && text(role.statement, 100));
  }

  async function loadEvents() {
    if (state.catalog) return true;
    if (state.catalogPromise) return state.catalogPromise;
    state.catalogFailed = false;
    $('retry-events').hidden = true;
    $('event-note').hidden = false;
    $('event-note').textContent = 'Loading the event list…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    state.catalogPromise = (async () => {
      try {
        const response = await fetch(urlFor('/events', new URLSearchParams()), { signal: controller.signal, credentials: 'same-origin', headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('The event list could not be loaded.');
        const data = await response.json();
        if (!validCatalog(data)) throw new Error('The event list returned an unexpected response.');
        state.catalog = data;
        $('event').replaceChildren(...data.events.map(event => new Option(event.label, event.id)));
        $('role').replaceChildren(...data.roles.map(role => new Option(role.label, role.id)));
        for (const [id, pending, items] of [['event', state.pendingEvent, data.events], ['role', state.pendingRole, data.roles]]) {
          if (pending === null) continue;
          if (items.some(item => item.id === pending)) $(id).value = pending;
          else state.restoreInvalid = true;
        }
        state.pendingEvent = state.pendingRole = null;
        syncControls();
        if (isSocial()) {
          if (state.restoreInvalid) {
            cancelRender();
            $('preview-stage').setAttribute('aria-busy', 'false');
            placeholder('Check your event settings.', 'Some shared settings were invalid. Review the choices and create your image again.');
            status('Some URL settings were invalid and were not restored. Check your settings, then create your card.', 'error');
          } else if (state.profile) scheduleRender(0);
        }
        return true;
      } catch (_) {
        state.catalogFailed = true;
        $('event-note').textContent = 'The event list is unavailable. Retry to load the official event choices.';
        $('retry-events').hidden = false;
        if (isSocial()) {
          $('preview-stage').setAttribute('aria-busy', 'false');
          status('Could not load the event list. Use Retry event list, or choose a profile card instead.', 'error');
        }
        return false;
      } finally {
        clearTimeout(timeout);
        state.catalogPromise = null;
      }
    })();
    return state.catalogPromise;
  }

  function individualOptions(containerId, items, omitted) {
    const container = $(containerId);
    container.replaceChildren();
    const seen = new Set();
    for (const item of items) {
      if (!item || typeof item.key !== 'string' || !item.key || typeof item.label !== 'string' || seen.has(item.key)) continue;
      seen.add(item.key);
      const label = document.createElement('label');
      label.className = 'check-label';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !omitted.has(item.key);
      input.value = item.key;
      const text = document.createElement('span');
      text.textContent = item.label;
      label.append(input, text);
      container.append(label);
      input.addEventListener('change', () => {
        if (input.checked) omitted.delete(item.key);
        else omitted.add(item.key);
        scheduleRender();
      });
    }
    return seen.size;
  }

  function populateIndividualOptions() {
    const profile = state.profile;
    const teams = Array.isArray(profile.teams) ? profile.teams.filter((team) => typeof team === 'string') : [];
    $('teams-empty').hidden = individualOptions('team-options', teams.map((team) => ({ key: team, label: team })), state.omitTeams) > 0;
    $('individual-details').hidden = false;
    syncControls();
  }

  function hasVisibleContent() {
    const profile = state.profile;
    if (isSocial()) return true; // The event and role remain visible in a frame-only export.
    if ($('link').checked || ($('badges').checked && profile.badges.length)) return true;

    if ($('layout').value === 'classic' || $('avatar').checked) return true;
    if (isModern() && $('social').checked && (profile.website?.url || profile.github?.url || profile.social?.length)) return true;
    const available = {
      name: profile.name, jobTitle: profile.jobTitle, organization: profile.organization,
      handle: profile.userName, location: profile.location, joined: profile.joined || profile.memberSince,

      teams: profile.teams?.some((team) => !state.omitTeams.has(team)),
    };
    return profileToggles.some((key) => $(key).checked && available[key]);
  }

  function urlFor(path, params) {
    const url = new URL(path, location.origin);
    url.search = params.toString();
    return url.href;
  }

  async function errorMessage(response) {
    try {
      const data = await response.json();
      if (typeof data.error?.message === 'string') return data.error.message;
    } catch (_) { /* Non-JSON errors can come from the private access gateway. */ }
    if (response.status === 401 || response.status === 403) {
      return 'Private preview access has expired or is unavailable. Sign in to the preview and try again.';
    }
    if (response.status === 404) return 'That profile could not be found. Check the WordPress.org username.';
    if (response.status === 429) return 'Too many requests. Wait a moment, then try again.';
    return `The server could not complete this request (HTTP ${response.status}). Try again.`;
  }

  function friendlyError(error) {
    if (error.name === 'AbortError') return 'The request timed out. Please try again.';
    if (error instanceof TypeError) return 'Could not connect. Check your connection and private preview access, then try again.';
    return error.message || 'Something went wrong. Please try again.';
  }

  function validProfile(profile) {
    return profile && typeof profile === 'object'
      && typeof profile.userName === 'string' && typeof profile.name === 'string'
      && Array.isArray(profile.badges);
  }

  function loadRenderer() {
    // One same-origin module graph per page, including the exact export fonts.
    // Import errors hide HTTP status. Confirm a missing optional entry before
    // falling back; never disguise auth, MIME, syntax or module-shape failures.
    if (!state.rendererPromise) state.rendererPromise = import('/preview/preview.js')
      .then(module => {
        if (typeof module.renderPreview !== 'function') throw new Error('Unexpected renderer module.');
        return module.renderPreview;
      })
      .catch(async () => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
          const response = await fetch('/preview/preview.js', { method: 'HEAD', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal });
          if ([404, 410].includes(response.status)) return null;
          if (!response.ok) throw new Error(await errorMessage(response));
          throw new Error('The preview renderer could not be loaded. Reload the page to try again.');
        } finally { clearTimeout(timeout); }
      });
    return state.rendererPromise;
  }

  function abortable(promise, signal) {
    if (signal.aborted) return Promise.reject(new DOMException('Request aborted', 'AbortError'));
    return new Promise((resolve, reject) => {
      const abort = () => reject(new DOMException('Request aborted', 'AbortError'));
      signal.addEventListener('abort', abort, { once: true });
      promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
    });
  }

  async function previewInputs(size) {
    const cached = state.previewInputs;
    if (cached && performance.now() < cached.expires && (size === 0 || cached.avatars.has(size))) return cached;
    // Option changes share an in-flight input request. A different photo size or
    // username cancels it; only the current profile's two raster sizes are kept.
    if (state.inputRequest?.size === size) return state.inputRequest.promise;
    if (state.inputRequest) state.inputRequest.controller.abort();
    const controller = new AbortController();
    const request = { size, controller, promise: null };
    const profileVersion = state.profileVersion, username = state.username;
    const started = performance.now();
    const timeout = setTimeout(() => controller.abort(), 30000);
    state.inputRequest = request;
    request.promise = (async () => {
      const response = await fetch(urlFor('/preview-data', new URLSearchParams({ username, size: String(size) })), {
        signal: controller.signal, credentials: 'same-origin', headers: { Accept: 'application/json' },
      });
      if ([404, 405, 501].includes(response.status)) {
        const error = new Error('Local preview inputs are unavailable.');
        error.previewUnavailable = true;
        throw error;
      }
      if (!response.ok) throw new Error(await errorMessage(response));
      if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('The server returned unexpected preview data.');
      const text = await response.text();
      if (text.length > 4 * 1024 * 1024) throw new Error('The preview data is too large.');
      const data = JSON.parse(text);
      const avatar = data?.avatar;
      if (!validProfile(data?.profile) || data.profile.userName !== username || !Number.isFinite(Date.parse(data.profile.fetchedAt))
        || !Number.isInteger(data.maxAgeMs) || data.maxAgeMs < 0 || data.maxAgeMs > 900000
        || avatar?.size !== size || !['embedded', 'initials', 'hidden'].includes(avatar.status)
        || (avatar.data !== null && (typeof avatar.data !== 'string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(avatar.data)))
        || (size === 0 ? avatar.data !== null || avatar.status !== 'hidden' : avatar.status !== (avatar.data ? 'embedded' : 'initials'))) {
        throw new Error('The server returned unexpected preview data.');
      }
      if (controller.signal.aborted || profileVersion !== state.profileVersion) throw new DOMException('Request aborted', 'AbortError');
      // Different snapshots must never mix photo sizes or outlive profile TTL.
      const fingerprint = JSON.stringify(data.profile);
      const previous = state.previewInputs;
      const reuse = previous?.fingerprint === fingerprint && performance.now() < previous.expires;
      const inputs = {
        profile: data.profile, fingerprint, expires: reuse ? Math.min(previous.expires, started + data.maxAgeMs) : started + data.maxAgeMs,
        avatars: reuse ? new Map(previous.avatars) : new Map(),
      };
      if (size) inputs.avatars.set(size, avatar);
      state.previewInputs = inputs;
      return inputs;
    })().finally(() => {
      clearTimeout(timeout);
      if (state.inputRequest === request) state.inputRequest = null;
    });
    return request.promise;
  }

  async function cardSource(params, controller, version) {
    const renderer = await abortable(loadRenderer(), controller.signal);
    if (version !== state.renderVersion) throw new DOMException('Request aborted', 'AbortError');
    if (renderer && !state.previewUnavailable) {
      const social = isSocial(params.get('layout'));
      const size = params.get('avatar') === 'true' ? (social ? 1024 : 320) : 0;
      try {
        const inputs = await abortable(previewInputs(size), controller.signal);
        if (version !== state.renderVersion) throw new DOMException('Request aborted', 'AbortError');
        const avatar = size ? inputs.avatars.get(size) : { data: null, status: 'hidden' };
        const svg = renderer(inputs.profile, params.toString(), avatar.data);
        if (JSON.stringify(state.profile) !== inputs.fingerprint) {
          state.profile = inputs.profile;
          populateIndividualOptions();
        }
        return { svg: new Blob([svg], { type: 'image/svg+xml' }), avatarStatus: avatar.status };
      } catch (error) {
        if (version !== state.renderVersion || !error.previewUnavailable) throw error;
        state.previewUnavailable = true;
      }
    }
    const response = await fetch(urlFor('/card', params), {
      signal: controller.signal, credentials: 'same-origin', headers: { Accept: 'image/svg+xml' },
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    if (!response.headers.get('content-type')?.toLowerCase().includes('image/svg+xml')) {
      throw new Error('The server did not return an SVG card. Check private preview access and try again.');
    }
    return { svg: await response.blob(), avatarStatus: response.headers.get('x-profile-avatar') };
  }

  async function submitProfile(event, demo = false) {
    if (event) event.preventDefault();
    if (!demo && !$('profile-form').reportValidity()) return;
    state.restoreInvalid = false; // Explicitly creating again acknowledges the visible restored choices.
    const username = demo ? 'matt' : $('username').value;
    // Do not silently fix malformed identifiers supplied by a shared builder URL.
    if (!/^[a-z0-9][a-z0-9._-]{0,59}$/.test(username)) {
      invalidateProfile();
      status('Enter a username using lowercase letters, numbers, dots, hyphens or underscores, not a profile URL.', 'error');
      $('username').focus();
      return;
    }
    invalidateProfile();
    state.demo = demo;
    const version = state.profileVersion;
    const controller = new AbortController();
    state.profileController = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    $('create-button').textContent = 'Look up again ↗';
    $('preview-stage').setAttribute('aria-busy', 'true');
    placeholder('Finding your profile…', 'Looking up public WordPress.org profile data.');
    status(`Looking up ${username}…`);
    const params = new URLSearchParams({ username });
    // Start loading in parallel; cardSource reports any error when rendering.
    loadRenderer().catch(() => {});
    try {
      const response = await fetch(urlFor('/json', params), {
        signal: controller.signal, credentials: 'same-origin', headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      const profile = await response.json();
      if (!validProfile(profile)) throw new Error('The server returned an unexpected profile response. Try again.');
      if (version !== state.profileVersion) return;
      state.profile = profile;
      state.username = username;
      populateIndividualOptions();
      scheduleRender(0);
    } catch (error) {
      if (version !== state.profileVersion) return;
      clearCard();
      state.profile = null;
      state.username = '';
      $('preview-stage').setAttribute('aria-busy', 'false');
      placeholder('No card to show yet.', 'Check your username and try creating your card again.');
      status(friendlyError(error), 'error');
    } finally {
      clearTimeout(timeout);
      if (version === state.profileVersion) {
        state.profileController = null;
        $('create-button').textContent = 'Create card ↗';
      }
    }
  }

  function scheduleRender(delay = 0) {
    cancelRender();
    if (!state.profile) return;
    if (state.backgroundBusy || state.backgroundError) {
      $('preview-stage').setAttribute('aria-busy', String(state.backgroundBusy));
      placeholder(state.backgroundBusy ? 'Preparing your background…' : 'Check your background image.',
        state.backgroundBusy ? 'Your image is being processed locally, without uploading it.' : 'Choose another image or remove the background to continue.');
      status(state.backgroundBusy ? 'Preparing your background locally…' : state.backgroundError, state.backgroundError ? 'error' : '');
      return;
    }
    if (isSocial() && state.restoreInvalid) {
      $('preview-stage').setAttribute('aria-busy', 'false');
      placeholder('Check your event settings.', 'Some shared settings were invalid. Review the choices and create your image again.');
      status('Some URL settings were invalid and were not restored. Check your settings, then create your card.', 'error');
      return;
    }
    if (isSocial() && !state.catalog) {
      $('preview-stage').setAttribute('aria-busy', String(!state.catalogFailed));
      placeholder('Choose your WordCamp.', state.catalogFailed ? 'Retry the event list before making your image.' : 'The event choices are loading. Your profile is ready.');
      return;
    }
    if (!hasVisibleContent()) {
      $('preview-stage').setAttribute('aria-busy', 'false');
      placeholder('Nothing to show on this card.', 'Choose an available profile detail, badges, or the profile link.');
      status('All available card content is hidden. Choose something to show before downloading.');
      return;
    }
    $('preview-stage').setAttribute('aria-busy', 'true');
    placeholder('Making your card…', 'Applying your current display and color settings.');
    status('Updating your preview…');
    const version = state.renderVersion;
    state.timer = setTimeout(() => renderCard(version), delay);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => {
        image.onload = image.onerror = null;
        image.src = '';
        reject(new Error('The card image took too long to load. Create your card again.'));
      }, 15000);
      image.onload = () => {
        clearTimeout(timer);
        image.onload = image.onerror = null;
        resolve(image);
      };
      image.onerror = () => {
        clearTimeout(timer);
        image.onload = image.onerror = null;
        reject(new Error('The card image could not be displayed. Try creating it again.'));
      };
      image.src = src;
    });
  }

  async function renderCard(version) {
    if (version !== state.renderVersion || !state.profile) return;
    const controller = new AbortController();
    state.renderController = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    const params = parameters(state.username);
    const background = state.background;
    const imageOptions = backgroundOptions();
    let localURL = null;
    try {
      let { svg, avatarStatus } = await cardSource(params, controller, version);
      if (version !== state.renderVersion) return;
      if (background) {
        const source = await svg.text();
        if (version !== state.renderVersion) return;
        svg = new Blob([state.backgroundModule.applyBackground(source, background, imageOptions)], { type: 'image/svg+xml' });
      }
      localURL = URL.createObjectURL(svg);
      await loadImage(localURL);
      if (version !== state.renderVersion) return;
      state.svg = svg;
      state.previewURL = localURL;
      localURL = null;

      const event = state.catalog?.events.find(item => item.id === $('event').value);
      const role = state.catalog?.roles.find(item => item.id === $('role').value);
      $('card-preview').alt = isSocial()
        ? `${event.label}: ${role.statement}. ${$('layout').value === 'avatar' ? 'Round avatar frame' : 'Participation announcement'}.`
        : `WordPress.org profile card for ${state.profile.name || state.username}`;
      $('card-preview').src = state.previewURL;
      $('card-preview').hidden = false;
      $('empty-state').hidden = true;
      $('open-preview').href = state.previewURL;
      $('profile-link').href = `https://profiles.wordpress.org/${encodeURIComponent(state.username)}/`;
      $('profile-meta').hidden = false;
      state.ready = true;
      $('exports').disabled = false;
      const message = 'Your image is ready to download.';
      status(state.demo ? `Demo using matt’s profile. Enter your username to make your own. ${message}` : message);
      const fetchedAt = typeof state.profile.fetchedAt === 'string' ? new Date(state.profile.fetchedAt) : null;
      $('cache-note').textContent = fetchedAt && Number.isFinite(fetchedAt.getTime())
        ? ` Profile fetched ${fetchedAt.toLocaleString()}.`
        : ' Fetch time unavailable.';
      $('status-warning').textContent = avatarStatus === 'initials'
        ? ' The avatar could not be loaded, so initials are shown.' : '';
    } catch (error) {
      if (version !== state.renderVersion) return;
      clearCard();
      placeholder('Your preview isn’t ready.', 'Change a setting to retry, or create your card again.');
      status(friendlyError(error), 'error');
    } finally {
      clearTimeout(timeout);
      if (localURL) URL.revokeObjectURL(localURL);
      if (version === state.renderVersion) {
        state.renderController = null;
        $('preview-stage').setAttribute('aria-busy', 'false');
      }
    }
  }

  function download(blob, suffix) {
    const objectURL = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectURL;
    anchor.download = isSocial()
      ? `${state.username}-${$('event').value}-${$('layout').value}.${suffix}` : `${state.username}-profile.${suffix}`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Give the browser time to consume the object URL before releasing it.
    setTimeout(() => URL.revokeObjectURL(objectURL), 60000);
    status(`${suffix.toUpperCase()} download requested. Check your browser’s downloads.`);
  }

  function requireReady() {
    if (state.ready && state.svg && state.profile) return true;
    status('Create a card and wait for the preview before downloading.', 'error');
    return false;
  }

  function downloadSVG() {
    if (!requireReady()) return;
    try { download(state.svg, 'svg'); }
    catch (error) { status(`Download failed: ${error.message}`, 'error'); }
  }

  async function createPNG(version) {
    const source = URL.createObjectURL(state.svg);
    const social = isSocial();
    const checkCurrent = () => {
      if (version !== state.renderVersion || !state.ready) throw new Error('The card changed. Try again with the current preview.');
    };
    try {
      const image = await loadImage(source);
      checkCurrent();
      const width = image.naturalWidth;
      const height = image.naturalHeight;
      if (!width || !height) throw new Error('The SVG has no usable dimensions.');
      const scale = Math.min(social ? 1 : 2, 8192 / width, 8192 / height, Math.sqrt(16000000 / (width * height)));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas is not available in this browser.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const png = await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG conversion failed.')), 'image/png');
      });
      checkCurrent();
      return png;
    } finally { URL.revokeObjectURL(source); }
  }

  async function downloadPNG() {
    if (!requireReady()) return;
    const version = state.renderVersion;
    $('download-png').disabled = true;
    status('Preparing your PNG…');
    try { download(await createPNG(version), 'png'); }
    catch (error) {
      if (version === state.renderVersion) status(`Could not create PNG: ${error.message} You can download SVG instead.`, 'error');
    } finally { $('download-png').disabled = false; }
  }


  function restoreSettings() {
    const params = new URLSearchParams(location.search);
    let invalid = false;
    // Existing shared builder URLs predate layout and must stay classic.
    if (!params.has('layout')) $('layout').value = params.has('username') ? 'classic' : 'profile';
    else if (params.getAll('layout').length === 1 && layouts.includes(params.get('layout'))) $('layout').value = params.get('layout');
    else invalid = true;
    state.layout = $('layout').value;
    // The removed builder master switch never suppresses individual choices.
    // Direct /card API requests still retain their legacy header option.
    if (params.has('header') && (params.getAll('header').length !== 1 || !['true', 'false'].includes(params.get('header')))) invalid = true;
    for (const key of [...toggles, 'eventDetails']) {
      $(key).checked = defaultVisibility(key);
      if (!params.has(key)) continue;
      if (key === 'eventDetails' && !isSocial()) { invalid = true; continue; }
      const value = params.get(key);
      if (params.getAll(key).length !== 1 || !['true', 'false'].includes(value)) { invalid = true; continue; }
      $(key).checked = value === 'true';
    }
    for (const key of colors) {
      if (!params.has(key)) continue;
      const value = params.get(key);
      if (params.getAll(key).length !== 1 || !/^[0-9A-Fa-f]{6}$/.test(value)) { invalid = true; continue; }
      $(key).value = `#${value}`;
      state.customColorKeys.add(key);
    }
    if (params.has('username')) {
      const value = params.get('username');
      if (params.getAll('username').length === 1 && /^[a-z0-9][a-z0-9._-]{0,59}$/.test(value)) $('username').value = value;
      else invalid = true;
    }
    for (const [key, expression] of [['event', /^[a-z]+-20\d{2}$/], ['role', /^[a-z]{1,24}$/]]) {
      if (!params.has(key)) continue;
      if (!isSocial() || params.getAll(key).length !== 1 || !expression.test(params.get(key))) { invalid = true; continue; }
      state[key === 'event' ? 'pendingEvent' : 'pendingRole'] = params.get(key);
    }
    state.selectionUsername = $('username').value;
    for (const key of ['omitTeams']) {
      if (!params.has(key)) continue;
      const value = params.get(key);
      const items = value.split(',').map(item => item.trim());
      if (params.getAll(key).length !== 1 || value.length > 2000 || /[\u0000-\u001f\u007f-\u009f]/.test(value)
        || items.length > 40 || items.some(item => !item || item.length > 80)) { invalid = true; continue; }
      state[key] = new Set(items);
    }
    syncControls();
    state.restoreInvalid = invalid;
    if (isSocial()) loadEvents();
    if (invalid) status('Some URL settings were invalid and were not restored. Check your settings, then create your card.', 'error');
    else if (params.size) status('Settings restored. Choose Create card to look up the profile.');
  }

  $('profile-form').addEventListener('submit', submitProfile);
  $('username').addEventListener('input', invalidateProfile);
  $('layout').addEventListener('change', () => {
    state.restoreInvalid = false;
    state.layoutChoices[state.layout] = Object.fromEntries(visibilityKeys(state.layout).map(key => [key, $(key).checked]));
    state.layout = $('layout').value;
    for (const key of visibilityKeys(state.layout)) $(key).checked = state.layoutChoices[state.layout]?.[key] ?? defaultVisibility(key);
    syncControls();
    scheduleRender();
    if (isSocial()) loadEvents();
  });
  for (const key of [...toggles, 'eventDetails']) $(key).addEventListener('change', () => {
    syncControls();
    scheduleRender();
  });
  for (const key of colors) $(key).addEventListener('input', () => { state.customColorKeys.add(key); scheduleRender(60); });
  for (const key of ['event', 'role']) $(key).addEventListener('change', () => { state.restoreInvalid = false; syncControls(); scheduleRender(); });
  $('retry-events').addEventListener('click', () => loadEvents());
  $('preset-event').addEventListener('click', () => {
    if (!isSocial() || !state.catalog) return;
    state.customColorKeys.clear();
    syncControls();
    scheduleRender();
  });
  for (const name of ['light', 'dark']) {
    $(`preset-${name}`).addEventListener('click', () => {
      colors.forEach((key, index) => { $(key).value = `#${palettes[name][index]}`; state.customColorKeys.add(key); });
      scheduleRender();
      if (!state.profile && !state.profileController) status(`${name === 'light' ? 'Light' : 'Dark'} palette selected. Create a card to see it.`);
    });
  }
  $('download-svg').addEventListener('click', downloadSVG);
  $('download-png').addEventListener('click', downloadPNG);
  $('background-choose').addEventListener('click', () => $('background-file').click());
  $('background-file').addEventListener('change', chooseBackground);
  $('background-remove').addEventListener('click', () => {
    resetBackground();
    scheduleRender();
    $('background-choose').focus();
  });
  for (const key of ['x', 'y', 'zoom', 'tint', 'strength']) $('background-' + key).addEventListener('input', () => {
    syncBackgroundControls();
    scheduleRender(60);
  });
  // Do not retain local image state in a back/forward-cache page snapshot.
  addEventListener('pagehide', () => { resetBackground(); cancelRender(); });
  addEventListener('pageshow', event => { if (event.persisted) scheduleRender(); });
  restoreSettings();
  // Only a fresh builder gets the demo; shared or invalid settings stay explicit.
  if (!location.search) submitProfile(null, true);
})();
