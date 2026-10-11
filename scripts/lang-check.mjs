// Language coverage check against the running dashboard (real or mock AI).
// Usage: node --env-file=apps/web/.env scripts/lang-check.mjs
const API = process.env.CONVERSA_API_URL || 'http://localhost:3000';
const email = process.env.SEED_DEMO_EMAIL || 'demo@conversa.local';
const password = process.env.SEED_DEMO_PASSWORD;
if (!password) throw new Error('SEED_DEMO_PASSWORD not set (run with --env-file=apps/web/.env)');

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? `  — ${detail}` : ''}`);
};

const login = await fetch(`${API}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: API }, body: JSON.stringify({ email, password }) });
if (!login.ok) throw new Error(`login failed: ${login.status}`);
const cookie = login.headers.get('set-cookie').split(';')[0];
const call = async (path, body, method = body ? 'POST' : 'GET') => {
  const r = await fetch(`${API}${path}`, { method, headers: { cookie, origin: API, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
};

const original = (await call('/api/settings')).data.language;

console.log('Language settings');
const chosen = ['en', 'ru', 'ja', 'sw', 'pl', 'he', 'ru'];
let r = await call('/api/settings/language', { ...original, myLanguage: 'en', preferredLanguages: chosen }, 'PUT');
check('save chosen languages', r.status === 200, `status ${r.status}`);
const saved = (await call('/api/settings')).data.language.preferredLanguages;
check('chosen languages stored in order, duplicates removed', JSON.stringify(saved) === JSON.stringify(['en', 'ru', 'ja', 'sw', 'pl', 'he']), JSON.stringify(saved));
r = await call('/api/settings/language', { ...original, preferredLanguages: ['en', 'klingon'] }, 'PUT');
check('unknown language code rejected', r.status === 422, `status ${r.status}`);
r = await call('/api/settings/language', { ...original, preferredLanguages: Array(21).fill(0).map((_, i) => ['en', 'fr', 'es', 'de', 'it', 'pt', 'nl', 'ar', 'ru', 'tr', 'pl', 'zh', 'ja', 'ko', 'hi', 'he', 'uk', 'vi', 'th', 'id', 'sv'][i]) }, 'PUT');
check('more than 20 languages rejected', r.status === 422, `status ${r.status}`);
r = await call('/api/contacts', { name: 'LangCheck Ola', language: 'sw' });
check('contact accepts a new language (Swahili)', r.status === 200 || r.status === 201, `status ${r.status}`);
if (r.data?.contact?.id) await call(`/api/contacts/${r.data.contact.id}`, null, 'DELETE');

const SCRIPT = { ru: /[\u0400-\u04FF]/, ja: /[\u3040-\u30FF\u4E00-\u9FFF]/, ko: /[\uAC00-\uD7AF]/, fa: /[\u0600-\u06FF]/, he: /[\u0590-\u05FF]/ };
const cases = [
  ['ru', 'Привет! Видела, что ты тоже любишь походы. Куда ходил в последний раз?'],
  ['ja', 'こんにちは！プロフィールの猫の写真、かわいいですね。名前は何ですか？'],
  ['ko', '안녕하세요! 요리 좋아한다고 하셨는데 제일 자신 있는 요리가 뭐예요?'],
  ['fa', 'سلام! دیدم تو هم عاشق سفر هستی. آخرین جایی که رفتی کجا بود؟'],
  ['sw', 'Habari! Nimeona unapenda muziki. Ni msanii gani unayempenda zaidi?'],
  ['tl', 'Hi! Nakita ko na mahilig ka rin sa beach. Saan ka huling nagbakasyon?'],
  ['pl', 'Cześć! Widzę, że też lubisz góry. Gdzie byłeś ostatnio?'],
];

console.log('\nAuto-detect replies (I read English)');
let mock = false;
await Promise.all(
  cases.map(async ([lang, text]) => {
    const res = await call('/api/ai/quick-reply', { name: 'Test', mode: 'AUTO', conversation: [{ direction: 'IN', text }] });
    mock ||= res.data.mockAi;
    const d = res.data;
    const s = d.suggestions?.[0];
    const scriptOk = SCRIPT[lang] ? SCRIPT[lang].test(s?.text ?? '') : true;
    check(
      `${lang}: detected, replied in ${lang}, translated for me`,
      res.status === 200 && d.detectedLanguage === lang && d.replyLanguage === lang && scriptOk && !!d.incomingTranslation && !!s?.translation,
      res.status !== 200 ? `status ${res.status} ${d.error ?? ''}` : `detected=${d.detectedLanguage} reply=${d.replyLanguage} → "${(s?.text ?? '').slice(0, 60)}" / "${(s?.translation ?? '').slice(0, 50)}"`,
    );
  }),
);

console.log('\nSelected language');
r = await call('/api/ai/quick-reply', { name: 'Test', mode: 'SELECTED', language: 'vi', conversation: [{ direction: 'IN', text: 'Hey! What are you up to this weekend?' }] });
check('English message, reply forced to Vietnamese', r.status === 200 && r.data.replyLanguage === 'vi' && /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(r.data.suggestions?.[0]?.text ?? ''), `"${(r.data.suggestions?.[0]?.text ?? '').slice(0, 70)}"`);

await call('/api/settings/language', original, 'PUT');
console.log(`\n${pass} passed, ${fail} failed${mock ? '  (mock AI — language output not meaningful)' : ''}`);
process.exit(fail ? 1 : 0);
