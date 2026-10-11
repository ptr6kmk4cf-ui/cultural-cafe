// Amora demo site front-end. Plain JS, no framework.
// The data-conversa-* attributes form the documented integration contract the
// Conversa extension's adapter reads (see apps/extension/src/adapters/demo.ts).
(() => {
  const page = document.body.dataset.page;
  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, ...children) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'dataset') Object.assign(n.dataset, v);
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of children.flat()) if (c != null) n.append(c instanceof Node ? c : document.createTextNode(String(c)));
    return n;
  };
  const getJson = (u) => fetch(u).then((r) => r.json());

  function field(name, value, tag = 'span', attrs = {}) {
    return el(tag, { 'data-field': name, ...attrs }, value ?? '');
  }

  function wireComposer(root, onSent) {
    const input = $('[data-conversa-input]', root);
    const file = $('[data-conversa-photo-input]', root);
    const preview = $('.preview', root);
    const sendBtn = $('[data-conversa-send]', root);
    let photo = null;
    file.addEventListener('change', () => {
      const f = file.files?.[0];
      photo = null;
      preview.replaceChildren();
      if (!f) return;
      if (f.size > 3 * 1024 * 1024) return alert('Max 3 MB');
      const r = new FileReader();
      r.onload = () => {
        photo = r.result;
        preview.replaceChildren(el('img', { src: photo, alt: 'attachment preview' }));
      };
      r.readAsDataURL(f);
    });
    // Enter sends, Shift+Enter inserts a newline (ignored while an IME is composing).
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        if (!sendBtn.disabled) sendBtn.click();
      }
    });
    sendBtn.addEventListener('click', async () => {
      const text = input.value.trim();
      if (!text && !photo) return;
      sendBtn.disabled = true;
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ profileId: root.dataset.profileId, text, photo }),
      }).then((r) => r.json());
      sendBtn.disabled = false;
      input.value = '';
      file.value = '';
      photo = null;
      preview.replaceChildren();
      onSent?.(res);
    });
  }

  function profileCard(p) {
    return el(
      'article',
      { class: 'card', 'data-conversa-profile': '', 'data-profile-id': p.id },
      el('a', { href: `/profile.html?id=${p.id}` }, el('img', { src: p.photos[0], alt: `${p.name}`, 'data-field': 'photo' })),
      el(
        'div',
        { class: 'body' },
        el('h3', {}, field('name', p.name), ', ', field('age', p.age)),
        el('div', { class: 'muted' }, field('city', p.city), ' · ', field('distance', p.distanceKm, 'span', { 'data-unit': 'km' }), ' km'),
        field('bio', p.bio, 'p', { class: 'bio', lang: p.language }),
        el('ul', { class: 'tags' }, p.interests.map((i) => field('interest', i, 'li'))),
        el('div', { class: 'muted' }, 'Looking for: ', field('lookingFor', p.lookingFor)),
        el('div', { hidden: '' }, field('language', p.language), field('height', p.stated.height), p.lifestyle.map((l) => field('lifestyle', l))),
        el(
          'div',
          { class: 'row' },
          el('a', { class: 'btn secondary', href: `/profile.html?id=${p.id}` }, 'View'),
          el('button', { class: 'btn', 'data-conversa-open-composer': p.id, onclick: () => openComposer(p) }, 'Say hi'),
        ),
      ),
    );
  }

  function openComposer(p) {
    const modal = $('#composerModal');
    $('#composerTitle').textContent = `Say hi to ${p.name}`;
    $('[data-conversa-composer]', modal).dataset.profileId = p.id;
    modal.classList.add('open');
    $('[data-conversa-input]', modal).focus();
  }

  async function discover() {
    const load = async () => {
      const { profiles } = await getJson(`/api/profiles?minAge=${$('#minAge').value}&maxAge=${$('#maxAge').value}`);
      $('#results').replaceChildren(...profiles.map(profileCard));
    };
    $('#apply').addEventListener('click', load);
    $('#closeModal').addEventListener('click', () => $('#composerModal').classList.remove('open'));
    wireComposer($('[data-conversa-composer]'), () => {
      $('#composerModal').classList.remove('open');
      toast('Message sent! Check Messages for replies.');
    });
    await load();
  }

  async function profilePage() {
    const id = new URLSearchParams(location.search).get('id');
    const { profile: p } = await getJson(`/api/profiles/${id}`);
    if (!p) return ($('#profileRoot').textContent = 'Profile not found');
    const composer = el(
      'div',
      { class: 'composer', 'data-conversa-composer': '', 'data-profile-id': p.id },
      el('textarea', { 'data-conversa-input': '', placeholder: `Message ${p.name}…` }),
      el('div', { class: 'attach' }, '📎 ', el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'data-conversa-photo-input': '' })),
      el('div', { class: 'preview' }),
      el('div', { class: 'row' }, el('button', { class: 'btn', 'data-conversa-send': '' }, 'Send')),
    );
    $('#profileRoot').replaceChildren(
      el(
        'div',
        { class: 'profile', 'data-conversa-profile': '', 'data-profile-id': p.id, 'data-page': 'profile' },
        el('div', { class: 'photos' }, p.photos.map((src, i) => el('img', { src, alt: `${p.name} photo ${i + 1}`, 'data-field': 'photo' }))),
        el(
          'div',
          {},
          el('h1', {}, field('name', p.name), ', ', field('age', p.age)),
          el('p', { class: 'muted' }, field('city', p.city), ' · ', field('distance', p.distanceKm), ' km away'),
          field('bio', p.bio, 'p', { lang: p.language, style: 'font-size:16px;line-height:1.5' }),
          el('ul', { class: 'tags' }, p.interests.map((i) => field('interest', i, 'li'))),
          el(
            'dl',
            {},
            el('dt', {}, 'Looking for'), el('dd', {}, field('lookingFor', p.lookingFor)),
            el('dt', {}, 'Lifestyle'), el('dd', {}, p.lifestyle.map((l, i) => [i ? ', ' : '', field('lifestyle', l)])),
            el('dt', {}, 'Height'), el('dd', {}, field('height', p.stated.height)),
            el('dt', {}, 'Speaks'), el('dd', {}, field('language', p.language)),
          ),
          el('h3', {}, `Message ${p.name}`),
          composer,
        ),
      ),
    );
    wireComposer(composer, (r) => (location.href = `/messages.html?thread=${r.threadId}`));
  }

  async function messagesPage() {
    let current = new URLSearchParams(location.search).get('thread');
    let rendered = '';

    async function renderThreads() {
      const { threads } = await getJson('/api/threads');
      if (!current && threads[0]) current = threads[0].id;
      $('#threads').replaceChildren(
        ...threads.map((t) =>
          el(
            'a',
            { class: `thread-link${t.id === current ? ' active' : ''}`, href: `?thread=${t.id}`, 'data-conversa-thread-link': '', 'data-thread-id': t.id, 'data-unread': t.unread ? '1' : '0', onclick: (e) => { e.preventDefault(); select(t.id); } },
            el('img', { src: t.photo, alt: '' }),
            el('div', {}, el('div', { style: 'font-weight:700' }, t.name), el('div', { class: 'snippet' }, t.last?.text ?? '')),
            t.unread ? el('span', { class: 'unread', title: 'unread' }) : null,
          ),
        ),
      );
    }

    async function renderConvo(force = false) {
      if (!current) return;
      const { thread } = await getJson(`/api/threads/${current}`);
      if (!thread) return;
      const sig = `${thread.id}:${thread.messages.length}`;
      if (!force && sig === rendered) return;
      let root = $('[data-conversa-thread]');
      if (!root || root.dataset.threadId !== thread.id) {
        const composer = el(
          'div',
          { class: 'composer', 'data-conversa-composer': '', 'data-profile-id': thread.profileId },
          el('textarea', { 'data-conversa-input': '', placeholder: `Message ${thread.name}…` }),
          el('div', { class: 'attach' }, '📎 ', el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', 'data-conversa-photo-input': '' })),
          el('div', { class: 'preview' }),
          el('div', { class: 'row' }, el('button', { class: 'btn', 'data-conversa-send': '' }, 'Send')),
        );
        root = el(
          'div',
          { 'data-conversa-thread': '', 'data-thread-id': thread.id, 'data-profile-id': thread.profileId, 'data-contact-name': thread.name, style: 'display:flex;flex-direction:column;height:100%' },
          el('div', { class: 'convo-head' }, el('a', { href: `/profile.html?id=${thread.profileId}` }, thread.name)),
          el('div', { class: 'convo-body' }),
          composer,
        );
        $('#convo').replaceChildren(root);
        wireComposer(composer, () => setTimeout(() => { renderConvo(true); renderThreads(); }, 150));
      }
      const body = $('.convo-body', root);
      body.replaceChildren(
        ...thread.messages.map((m) =>
          el(
            'div',
            { class: `msg ${m.from === 'me' ? 'out' : 'in'}`, 'data-conversa-message': '', 'data-message-id': m.id, 'data-direction': m.from === 'me' ? 'out' : 'in', 'data-has-photo': m.photo ? '1' : '0', 'data-sent-at': m.at, dir: 'auto' },
            m.photo ? el('img', { src: m.photo, alt: 'photo' }) : null,
            el('span', { 'data-text': '' }, m.text),
            el('time', {}, new Date(m.at).toLocaleTimeString()),
          ),
        ),
      );
      body.scrollTop = body.scrollHeight;
      rendered = sig;
    }

    function select(id) {
      current = id;
      history.replaceState(null, '', `?thread=${id}`);
      renderThreads();
      renderConvo(true);
    }

    await renderThreads();
    await renderConvo(true);
    setInterval(() => { renderThreads(); renderConvo(); }, 2000);
  }

  function toast(msg) {
    const t = el('div', { style: 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#2b2330;color:#fff;padding:10px 16px;border-radius:10px;z-index:20' }, msg);
    document.body.append(t);
    setTimeout(() => t.remove(), 3000);
  }

  ({ discover, profile: profilePage, messages: messagesPage })[page]?.();
})();
