import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { detectSensitiveRequest, detectStopRequest, sanitizeUntrusted } from '../ai/safety';
import { encrypt } from '../crypto';
import { db } from '../db';
import { HttpError, notFound } from '../http';
import { writeCafeGuestLine } from '../ai/tasks';
import { contentWords, guestLineUsable } from '../table-reply';
import { tablePromptFor } from './cafe-topics';

/** How many café seats stay open for guests. One real opted-in person closes one seat. */
export const CAFE_GUEST_CAP = 6;
/** Seeded demo logins. They are not people waiting in the café, and a visit removes them from it. */
export const CAFE_FIXTURE_EMAIL_SUFFIX = '@conversa.local';
const SYNC_MS = 20_000;
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function guestSlots(realOptedIn: number, cap = CAFE_GUEST_CAP) {
  const real = Number.isFinite(realOptedIn) ? Math.max(0, Math.floor(realOptedIn)) : 0;
  return Math.max(0, cap - real);
}

type GuestLine = { hello: string; reply: string; bye: string };

type Guest = GuestLine & {
  email: string;
  name: string;
  birth: string;
  language: string;
  city: string;
  country: string;
  interests: string[];
  bio: string;
  english: GuestLine;
};

const GUESTS: Guest[] = [
  {
    email: 'guest.ines@culturalcafe.invalid',
    name: 'Inès',
    birth: '1993-04-12',
    language: 'fr',
    city: 'Lyon',
    country: 'France',
    interests: ['bakeries', 'river walks', 'rain'],
    bio: 'I live in Lyon. Evenings smell like bread, and I like hearing what a city sounds like after work.',
    hello: 'Bonjour. À Lyon, le soir sent le pain chaud. Chez toi, le soir sent quoi ?',
    reply: 'J’aime cette image. Ici on reste longtemps en terrasse. Qu’est-ce qu’on fait le dimanche dans ta ville ?',
    bye: 'D’accord. On s’arrête là. Prends soin de toi.',
    english: {
      hello: 'Hello from Lyon. Evenings smell like fresh bread. What do evenings smell like where you are?',
      reply: 'I like that picture. Here we sit outside for a long time. What do people do on Sundays in your city?',
      bye: 'All right. We can stop here. Take care.',
    },
  },
  {
    email: 'guest.mateo@culturalcafe.invalid',
    name: 'Mateo',
    birth: '1991-11-03',
    language: 'es',
    city: 'Buenos Aires',
    country: 'Argentina',
    interests: ['late dinners', 'football on the radio', 'bookstores'],
    bio: 'I live in Buenos Aires. Nights start late, and I like talking about ordinary Sundays.',
    hello: 'Hola. En Buenos Aires la noche empieza tarde. ¿Cómo empieza la noche en tu ciudad?',
    reply: 'Me gusta escucharte. Acá el domingo es para caminar sin prisa. ¿Qué haces cuando no trabajas?',
    bye: 'Está bien. Lo dejamos aquí. Cuídate.',
    english: {
      hello: 'Hello from Buenos Aires. The night starts late. How does the night start in your city?',
      reply: 'I like hearing that. Here Sunday is for walking slowly. What do you do when you are not working?',
      bye: 'All right. We can leave it here. Take care.',
    },
  },
  {
    email: 'guest.lena@culturalcafe.invalid',
    name: 'Lena',
    birth: '1995-07-19',
    language: 'pt',
    city: 'Lisbon',
    country: 'Portugal',
    interests: ['trams', 'grilled fish', 'viewpoints'],
    bio: 'I live in Lisbon. I like the tram on the hills and talking about what home sounds like.',
    hello: 'Olá. Em Lisboa o elétrico range nas subidas. Que som tem a tua cidade?',
    reply: 'Que bom ouvir isso. Aqui a gente fica no miradouro até escurecer. O que te faz sentir em casa?',
    bye: 'Está bem. Ficamos por aqui. Cuida-te.',
    english: {
      hello: 'Hello from Lisbon. The tram creaks on the hills. What sound does your city make?',
      reply: 'I am glad to hear that. Here we stay at the viewpoint until it gets dark. What makes you feel at home?',
      bye: 'All right. We can stop here. Take care.',
    },
  },
  {
    email: 'guest.hassan@culturalcafe.invalid',
    name: 'Hassan',
    birth: '1989-02-08',
    language: 'ar',
    city: 'Alexandria',
    country: 'Egypt',
    interests: ['the corniche', 'tea', 'evening walks'],
    bio: 'I live in Alexandria. Evenings are the sea and sesame, and I like hearing how another city winds down.',
    hello: 'مرحبا. في الإسكندرية المساء فيه بحر وسمسم. كيف يبدو المساء في مدينتك؟',
    reply: 'يسعدني هذا. هنا نمشي على الكورنيش ببطء. ما الذي يذكرك ببيتك؟',
    bye: 'حسنا. نتوقف هنا. اعتنِ بنفسك.',
    english: {
      hello: 'Hello from Alexandria. Evenings are the sea and sesame. What is the evening like in your city?',
      reply: 'I am glad to hear that. Here we walk the corniche slowly. What reminds you of home?',
      bye: 'All right. We stop here. Take care of yourself.',
    },
  },
  {
    email: 'guest.mei@culturalcafe.invalid',
    name: 'Mei',
    birth: '1994-09-21',
    language: 'ja',
    city: 'Kyoto',
    country: 'Japan',
    interests: ['tea', 'evening walks', 'side streets'],
    bio: 'I live in Kyoto. Evenings near the temples smell like tea, and I like asking what a city smells like.',
    hello: 'こんにちは。京都の夕方はお茶の匂いがします。あなたの街の夕方はどんな匂いですか？',
    reply: 'それを聞けてうれしいです。こちらでは夜にゆっくり歩きます。家を思い出す音は何ですか？',
    bye: 'わかりました。この話はここでやめましょう。気をつけて。',
    english: {
      hello: 'Hello from Kyoto. Evenings smell like tea. What do evenings smell like in your city?',
      reply: 'I am glad to hear that. Here we walk slowly at night. What sound reminds you of home?',
      bye: 'All right. Let us stop this talk here. Take care.',
    },
  },
  {
    email: 'guest.amina@culturalcafe.invalid',
    name: 'Amina',
    birth: '1992-12-01',
    language: 'sw',
    city: 'Nairobi',
    country: 'Kenya',
    interests: ['dawn runs', 'tea', 'markets'],
    bio: 'I live in Nairobi. Mornings smell like tea and bread, and I like hearing what home reminds you of.',
    hello: 'Habari. Nairobini asubuhi ina harufu ya chai na mkate. Mji wako una harufu gani asubuhi?',
    reply: 'Nimefurahi kusikia. Hapa tunakimbia alfajiri. Nini inakukumbusha nyumbani?',
    bye: 'Sawa. Tunaacha hapa. Jitunze.',
    english: {
      hello: 'Hello from Nairobi. Mornings smell like tea and bread. What does your city smell like in the morning?',
      reply: 'I am glad to hear that. Here we run at dawn. What reminds you of home?',
      bye: 'All right. We stop here. Take care.',
    },
  },
];

export function cafeGuestEmails() {
  return GUESTS.map((g) => g.email);
}

/** Public guest cards for the front-page wheel. No email, no scripted lines. */
export function cafeGuestRoster() {
  return GUESTS.map((guest) => ({
    id: guest.name,
    name: guest.name,
    city: guest.city,
    country: guest.country,
    bio: guest.bio,
    language: guest.language,
    interests: guest.interests,
    birth: guest.birth,
  }));
}

/** Later lines in a guest hour. Each one is a new topic, so the table does not repeat itself. */
const FOLLOW: Record<string, { say: string; english: string }[]> = {
  'guest.ines@culturalcafe.invalid': [
    { say: 'Le dimanche à Lyon, la queue pour une brioche est déjà longue le matin.', english: 'On Sundays in Lyon the queue for brioche is long by morning.' },
    { say: 'Après le travail je descends vers la Saône et j’écoute l’eau.', english: 'After work I walk down to the river and listen to the water.' },
    { say: 'Quand il pleut, les cafés restent pleins et personne ne se presse.', english: 'When it rains the cafés stay full and nobody hurries.' },
    { say: 'À Croix-Rousse, les murs ont encore des traces de soie.', english: 'In Croix-Rousse the walls still show traces of the old silk workshops.' },
  ],
  'guest.mateo@culturalcafe.invalid': [
    { say: 'Acá la cena empieza cuando en otros lugares ya se duerme.', english: 'Here dinner starts when other places are already asleep.' },
    { say: 'El domingo camino despacio por un parque, sin rumbo.', english: 'On Sunday I walk slowly through a park with nowhere to be.' },
    { say: 'El fútbol se escucha por la radio en la cocina, no siempre en la tele.', english: 'Football is on the kitchen radio, not always on the television.' },
    { say: 'En Corrientes hay librerías abiertas hasta muy tarde.', english: 'On Corrientes the bookshops stay open very late.' },
  ],
  'guest.lena@culturalcafe.invalid': [
    { say: 'O elétrico 28 sobe tão devagar que se ouve cada curva.', english: 'Tram 28 climbs so slowly you hear every bend.' },
    { say: 'Ao almoço pede-se peixe grelhado e um limão, quase sempre.', english: 'At lunch people order grilled fish and a lemon, almost every time.' },
    { say: 'No miradouro ficamos até a cidade acender as luzes.', english: 'At the viewpoint we stay until the city turns its lights on.' },
    { say: 'De manhã o café é curto e o pão vem quente.', english: 'In the morning the coffee is short and the bread arrives warm.' },
  ],
  'guest.hassan@culturalcafe.invalid': [
    { say: 'على الكورنيش نمشي ببطء والبحر على اليمين.', english: 'On the corniche we walk slowly with the sea on the right.' },
    { say: 'الشاي يأتي مع السمسم، وهذا طعم المساء هنا.', english: 'Tea comes with sesame, and that is what the evening tastes like here.' },
    { say: 'يوم الجمعة الشوارع تهدأ ثم تمتلئ مرة واحدة.', english: 'On Friday the streets go quiet, then fill up all at once.' },
    { say: 'أحب صوت الموج أكثر من صوت السيارات.', english: 'I like the sound of the waves more than the sound of cars.' },
  ],
  'guest.mei@culturalcafe.invalid': [
    { say: 'お寺の近くでお茶を飲むと、話がゆっくりになります。', english: 'Tea near a temple makes the talk slow down.' },
    { say: '細い道のほうが大きな道より好きです。', english: 'I like the narrow streets more than the wide ones.' },
    { say: '雨の日は軒下で人を待つのが普通です。', english: 'On a rainy day it is normal to wait for someone under the eaves.' },
    { say: '夜になるとお店の暖簾が揺れます。', english: 'At night the shop curtains move in the doorway.' },
  ],
  'guest.amina@culturalcafe.invalid': [
    { say: 'Alfajiri mimi hukimbia kabla ya jiji kuamka.', english: 'At dawn I run before the city wakes up.' },
    { say: 'Chai na mkate ndiyo kifungua kinywa cha watu wengi.', english: 'Tea and bread is breakfast for a lot of people.' },
    { say: 'Sokoni harufu ya viungo inachanganyika na sauti za watu.', english: 'In the market the smell of spices mixes with people’s voices.' },
    { say: 'Jioni matatu hujaa na kila mtu ana hadithi fupi.', english: 'In the evening the matatus fill up and everyone has a short story.' },
  ],
};

/** Fixed lines for automatic answering at a guest table. Each one is sent once, then answering stops. */
const TABLE_AUTO_LINES = [
  'In my city the morning is the street waking up. What is morning like where you are?',
  'On a normal Sunday I stay close to home. What do people do on Sunday there?',
  'The market is where I hear the city. What do you hear at yours?',
  'Rain changes the street here. People slow down. Does the weather change your day?',
];

/** The next hardcoded line, or null when every line was already sent. */
export function nextHardcodedTableLine(saidByMe: string[]) {
  return TABLE_AUTO_LINES.find((line) => !saidByMe.some((previous) => previous.includes(line))) ?? null;
}

/** The next hardcoded line, with nothing pasted in front of it. */
export function hardcodedTableReply(saidByMe: string[], _latestFromThem: string) {
  return nextHardcodedTableLine(saidByMe);
}

/** The next guest line. Each topic is said once, on its own. */
export function guestFollowUp(email: string, said: string[], _latest: string) {
  const lines = FOLLOW[email] ?? [];
  const next = lines.find((line) => !said.some((previous) => previous.includes(line.say)));
  if (!next) return null;
  return { text: next.say, english: next.english };
}

/** Written answers. The first match that has not been said yet is the one that goes out. */
const ANSWERS: Record<string, { test: RegExp; say: string; english: string }[]> = {
  'guest.ines@culturalcafe.invalid': [
    { test: /neighbou?r|greet|bonjour|wave/i, say: 'À Lyon, les voisins disent bonjour et s’arrêtent souvent une minute. Un signe de la main seul serait trop court.', english: 'In Lyon, neighbours say bonjour and often stop for a minute. A wave on its own would feel too short.' },
    { test: /bread|brioche|baker|smell|evening/i, say: 'Le soir sent le pain chaud. Le dimanche, la queue pour une brioche est déjà longue le matin.', english: 'Evenings smell like fresh bread. On Sunday the queue for brioche is already long in the morning.' },
    { test: /river|sa[oô]ne|water|walk/i, say: 'Après le travail je descends vers la Saône et j’écoute l’eau.', english: 'After work I walk down to the Saône and listen to the water.' },
    { test: /rain|weather|caf[eé]/i, say: 'Quand il pleut, les cafés restent pleins et personne ne se presse.', english: 'When it rains the cafés stay full and nobody hurries.' },
    { test: /sunday|dimanche|weekend/i, say: 'Le dimanche à Lyon, la queue pour une brioche est déjà longue le matin.', english: 'On Sundays in Lyon the queue for brioche is long by morning.' },
    { test: /food|eat|visitor|lunch|market/i, say: 'Pour une première bouchée, je donnerais une brioche encore chaude.', english: 'The first thing I would want a visitor to eat is a brioche that is still warm.' },
    { test: /morning|school/i, say: 'Le matin, c’est l’odeur du pain et la queue devant la boulangerie.', english: 'Morning is the smell of bread and the queue outside the bakery.' },
    { test: /home|song|sound|music|remind/i, say: 'Le son de la maison, c’est l’eau de la Saône après le travail.', english: 'The sound of home is the Saône after work.' },
  ],
  'guest.mateo@culturalcafe.invalid': [
    { test: /neighbou?r|greet|wave|kiss|hello/i, say: 'En Buenos Aires los vecinos saludan con un beso o un hola largo. Un gesto breve es solo para el otro lado de la calle.', english: 'In Buenos Aires, neighbours greet with a kiss on the cheek or a long hello. A small wave is only for someone across the street.' },
    { test: /dinner|night|food|eat|late/i, say: 'Acá la cena empieza cuando en otros lugares ya se duerme.', english: 'Here dinner starts when other places are already asleep. That is the meal I would tell a visitor to wait for.' },
    { test: /sunday|weekend|park|walk/i, say: 'El domingo camino despacio por un parque, sin rumbo.', english: 'On Sunday I walk slowly through a park with nowhere to be.' },
    { test: /football|radio|sport/i, say: 'El fútbol se escucha por la radio en la cocina, no siempre en la tele.', english: 'Football is on the kitchen radio, not always on the television.' },
    { test: /book|market|shop/i, say: 'En Corrientes hay librerías abiertas hasta muy tarde.', english: 'On Corrientes the bookshops stay open very late. That is what a walk through the neighbourhood sounds like.' },
    { test: /morning|school/i, say: 'La mañana empieza tarde. El desayuno también.', english: 'Morning starts late here. Breakfast does too.' },
    { test: /rain|weather/i, say: 'Con lluvia la gente entra en un café y deja la prisa afuera.', english: 'In the rain people step into a café and leave the hurry outside.' },
    { test: /home|song|sound|music|remind/i, say: 'El sonido de casa es la radio en la cocina.', english: 'The sound of home is the radio in the kitchen.' },
  ],
  'guest.lena@culturalcafe.invalid': [
    { test: /tram|el[eé]tric|hill/i, say: 'O elétrico 28 sobe tão devagar que se ouve cada curva.', english: 'Tram 28 climbs so slowly you hear every bend. A quiet tram is not the one I ride.' },
    { test: /neighbou?r|greet|wave/i, say: 'Em Lisboa os vizinhos dizem uma palavra no elétrico e na ladeira. O aceno vem depois.', english: 'In Lisbon, neighbours say a word on the tram and on the hill. The wave comes after the word.' },
    { test: /fish|lunch|food|eat|lemon/i, say: 'Ao almoço pede-se peixe grelhado e um limão, quase sempre.', english: 'At lunch people order grilled fish and a lemon, almost every time. That is what I would want a visitor to try first.' },
    { test: /sunday|viewpoint|light|weekend/i, say: 'No miradouro ficamos até a cidade acender as luzes.', english: 'On a slow day we stay at the viewpoint until the city turns its lights on.' },
    { test: /morning|coffee|bread|school/i, say: 'De manhã o café é curto e o pão vem quente.', english: 'In the morning the coffee is short and the bread arrives warm.' },
    { test: /market/i, say: 'No mercado ouve-se o elétrico lá fora e as pessoas a pedir o peixe.', english: 'In the market you hear the tram outside and people asking for fish.' },
    { test: /rain|weather/i, say: 'Com chuva o elétrico vai cheio e ninguém tem pressa de descer.', english: 'In the rain the tram is full and nobody is in a hurry to get off.' },
    { test: /home|song|sound|music|remind|sea/i, say: 'O som de casa é o elétrico a ranger na subida.', english: 'The sound of home is the tram creaking as it climbs.' },
  ],
  'guest.hassan@culturalcafe.invalid': [
    { test: /neighbou?r|greet/i, say: 'على الكورنيش يقول الجيران كلمة أولاً ثم يلوّحون قليلاً. لا نمرّ في صمت.', english: 'On the corniche, neighbours say a word first and then a small wave. We do not pass in silence.' },
    { test: /wave|sea|promenade|sound|beach/i, say: 'في المساء صوت الموج أعلى من صوت السيارات.', english: 'In the evening the waves are louder than the cars. That is the sound of a walk here.' },
    { test: /tea|sesame/i, say: 'الشاي مع السمسم هو طعم المساء هنا.', english: 'Tea with sesame is what the evening tastes like here.' },
    { test: /home|remind/i, say: 'البيت عندي هو البحر على يميني والشاي بالسمسم.', english: 'Home for me is the sea on my right and tea with sesame.' },
    { test: /friday|sunday|weekend/i, say: 'يوم الجمعة الشوارع تهدأ ثم تمتلئ مرة واحدة. الأحد أبطأ على البحر.', english: 'On Friday the streets go quiet, then fill up all at once. Sunday is a slower walk by the water.' },
    { test: /food|eat|fish|lunch|visitor/i, say: 'أود أن يذوق الزائر سمكاً مشوياً بجانب البحر، مع ليمون وسمسم.', english: 'I would want a visitor to try grilled fish by the sea, with lemon and sesame.' },
    { test: /morning|school/i, say: 'الصباح يبدأ بالشاي، ثم مشي قبل أن يمتلئ الكورنيش.', english: 'A weekday morning starts with tea, then a walk before the corniche gets busy.' },
    { test: /market/i, say: 'السوق أصوات وسمسم وسمك. تسمع الناس قبل أن ترى الماء.', english: 'The market is voices, sesame, and fish. You hear people before you see the water.' },
    { test: /rain|weather|wind/i, say: 'عندما تأتي الريح من البحر، يمشي الناس أقرب إلى الجدار ويتكلمون أقل.', english: 'When the wind comes off the sea, people walk closer to the wall and talk less.' },
  ],
  'guest.mei@culturalcafe.invalid': [
    { test: /neighbou?r|greet|wave|bow/i, say: '京都では近所の人は軽く会釈して短い挨拶をします。手を振るより会釈のほうが多いです。', english: 'In Kyoto, neighbours give a small bow and a short greeting. A bow is more usual than a wave.' },
    { test: /tea|temple/i, say: 'お寺の近くでお茶を飲むと、話がゆっくりになります。', english: 'Tea near a temple makes the talk slow down.' },
    { test: /rain|weather|eave/i, say: '雨の日は軒下で人を待つのが普通です。', english: 'On a rainy day it is normal to wait for someone under the eaves.' },
    { test: /street|narrow|walk|sunday|weekend/i, say: '細い道のほうが大きな道より好きです。', english: 'I like the narrow streets more than the wide ones. A free afternoon is a slow walk there.' },
    { test: /night|curtain|shop/i, say: '夜になるとお店の暖簾が揺れます。', english: 'At night the shop curtains move in the doorway.' },
    { test: /morning|school/i, say: '朝はお茶から始まって、広い道より細い道を歩きます。', english: 'Morning starts with tea, and I walk the narrow streets rather than the wide ones.' },
    { test: /food|eat|market|lunch|visitor/i, say: '市場ではお茶の匂いと人の声が一緒にあります。', english: 'At the market the smell of tea sits with people’s voices. That is what I would want a visitor to notice first.' },
    { test: /home|song|sound|music|remind/i, say: '家を思い出す音は、夜の暖簾が揺れる音です。', english: 'The sound that reminds me of home is the shop curtain moving at night.' },
  ],
  'guest.amina@culturalcafe.invalid': [
    { test: /neighbou?r|greet|wave/i, say: 'Nairobi majirani husalimiana kwa neno na mara nyingi husimama kuzungumza. Kupepesa mkono ni kwa mtu aliyeharakisha.', english: 'In Nairobi, neighbours greet with a word and often stop to talk. A wave is for when someone is already in a hurry.' },
    { test: /dawn|run|morning|school/i, say: 'Alfajiri mimi hukimbia kabla ya jiji kuamka.', english: 'At dawn I run before the city wakes up. A weekday morning starts there.' },
    { test: /tea|bread|breakfast|food|eat/i, say: 'Chai na mkate ndiyo kifungua kinywa cha watu wengi.', english: 'Tea and bread is breakfast for a lot of people. That is what I would want a visitor to try first.' },
    { test: /market|spice/i, say: 'Sokoni harufu ya viungo inachanganyika na sauti za watu.', english: 'In the market the smell of spices mixes with people’s voices.' },
    { test: /evening|matatu|sunday|weekend|story/i, say: 'Jioni matatu hujaa na kila mtu ana hadithi fupi.', english: 'In the evening the matatus fill up and everyone has a short story.' },
    { test: /rain|weather/i, say: 'Mvua inaponyesha watu husimama pamoja na mazungumzo huwa mafupi.', english: 'When it rains people stand together and the talk gets shorter.' },
    { test: /home|song|sound|music|remind/i, say: 'Sauti ya nyumbani ni soko asubuhi na chai.', english: 'The sound of home is the market in the morning, and tea.' },
  ],
};

function normLine(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function alreadySaid(said: string[], line: string) {
  const next = normLine(line);
  if (!next) return true;
  return said.some((previous) => {
    const prior = normLine(previous);
    return prior === next || prior.includes(next);
  });
}

function focusSentence(latest: string) {
  const clean = normLine(latest);
  const parts = clean.split(/(?<=[.!?])\s+/).filter(Boolean);
  return [...parts].reverse().find((part) => part.includes('?')) ?? parts.at(-1) ?? clean;
}

function pickScriptedAnswer(guest: Guest, latest: string, said: string[], topic: string) {
  const bank = ANSWERS[guest.email] ?? [];
  const focus = focusSentence(latest);
  for (const pool of [focus, latest]) {
    const hit = bank.find((item) => item.test.test(pool) && !alreadySaid(said, item.english));
    if (hit) return hit;
  }
  const word = contentWords(focus)[0] || contentWords(latest)[0] || '';
  if (!word && topic) {
    const hit = bank.find((item) => item.test.test(topic) && !alreadySaid(said, item.english));
    if (hit) return hit;
  }
  const fact = (FOLLOW[guest.email] ?? []).find((item) => !alreadySaid(said, item.english) && !alreadySaid(said, item.say));
  if (fact) {
    const english = word ? `You mentioned ${word}. ${fact.english}` : fact.english;
    if (!alreadySaid(said, english)) return { say: fact.say, english };
  }
  const english = word ? `In ${guest.city} I am staying with ${word}.` : `In ${guest.city} that is part of an ordinary day.`;
  return {
    say: guest.reply,
    english: alreadySaid(said, english) ? `${english} This is a different moment.` : english,
  };
}

function inviteCode() {
  const bytes = randomBytes(8);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

let lastSync = 0;
let running: Promise<void> | null = null;

/** Keeps a few labeled guests in the café, then hides them as real people opt in. */
export function syncCafeGuests() {
  if (running) return running;
  if (Date.now() - lastSync < SYNC_MS) return Promise.resolve();
  lastSync = Date.now();
  running = paintGuests().catch((err) => {
    console.error('[cafe-guests]', err);
  }).finally(() => {
    running = null;
  });
  return running;
}

async function paintGuests() {
  await db.worldProfile.updateMany({
    where: { user: { synthetic: false, email: { endsWith: CAFE_FIXTURE_EMAIL_SUFFIX } } },
    data: { optedIn: false, available: false, queuedAt: null },
  });
  await db.worldInvite.deleteMany({
    where: {
      status: 'PENDING',
      OR: [
        { from: { email: { endsWith: CAFE_FIXTURE_EMAIL_SUFFIX } } },
        { to: { email: { endsWith: CAFE_FIXTURE_EMAIL_SUFFIX } } },
      ],
    },
  });
  const realOptedIn = await db.user.count({
    where: {
      synthetic: false,
      email: { not: { endsWith: CAFE_FIXTURE_EMAIL_SUFFIX } },
      worldProfile: { is: { optedIn: true } },
    },
  });
  const slots = guestSlots(realOptedIn);
  const visible = new Set(GUESTS.slice(0, slots).map((g) => g.email));
  for (const guest of GUESTS) {
    const id = await ensureGuest(guest);
    if (!id) continue;
    const inHour = !!(await db.worldConversation.findFirst({
      where: { status: 'ACTIVE', OR: [{ userAId: id }, { userBId: id }] },
      select: { id: true },
    }));
    const show = visible.has(guest.email) || inHour;
    const data = show
      ? {
          optedIn: true,
          available: !inHour,
          queuedAt: inHour ? null : new Date(),
          lastSeenAt: new Date(),
          city: guest.city,
          country: guest.country,
          bio: encrypt(guest.bio),
        }
      : { optedIn: false, available: false, queuedAt: null as Date | null };
    await db.worldProfile.upsert({
      where: { userId: id },
      update: data,
      create: { userId: id, inviteCode: inviteCode(), city: guest.city, country: guest.country, bio: encrypt(guest.bio), ...data },
    });
  }
}

async function ensureGuest(guest: Guest) {
  const existing = await db.user.findUnique({
    where: { email: guest.email },
    select: { id: true, synthetic: true },
  });
  if (existing && !existing.synthetic) return null;
  if (existing) return existing.id;
  const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 8);
  try {
    const created = await db.user.create({
      data: {
        email: guest.email,
        name: guest.name,
        passwordHash,
        synthetic: true,
        birthDate: new Date(`${guest.birth}T00:00:00Z`),
        adultConfirmed: true,
        termsAcceptedAt: new Date(),
        language: {
          create: { myLanguage: guest.language, defaultReplyLanguage: guest.language, preferredLanguages: [guest.language, 'en'] },
        },
        personality: {
          create: {
            displayName: guest.name,
            aboutMe: encrypt(guest.bio),
            interests: guest.interests,
            intentions: 'a café table about everyday life',
            personality: 'warm, curious, not romantic',
            style: 'natural',
            flirtingLevel: 0,
          },
        },
        worldProfile: {
          create: {
            inviteCode: inviteCode(),
            optedIn: false,
            city: guest.city,
            country: guest.country,
            bio: encrypt(guest.bio),
          },
        },
      },
      select: { id: true },
    });
    return created.id;
  } catch {
    const again = await db.user.findUnique({ where: { email: guest.email }, select: { id: true, synthetic: true } });
    return again?.synthetic ? again.id : null;
  }
}

type GuestTurn = { mine: boolean; text: string; translation?: string | null };

function packGuestLine(
  guest: Guest,
  text: string,
  translation: string | null,
  translationLang: string | null,
  flagged: boolean,
) {
  return {
    id: randomBytes(12).toString('base64url'),
    text,
    language: guest.language,
    translation,
    translationLang,
    flagged,
    createdAt: new Date().toISOString(),
    mine: false as const,
  };
}

/** Fixed guest lines. English comes from the catalog, never from a translator. */
export function scriptedGuestTurn(email: string, history: GuestTurn[], humanLang = 'en', topic = '') {
  const guest = GUESTS.find((item) => item.email === email);
  if (!guest) return null;
  const latest = [...history].reverse().find((turn) => turn.mine)?.text ?? '';
  const said = history.filter((turn) => !turn.mine).flatMap((turn) => [turn.text, turn.translation ?? '']);
  const stop = !!latest && (detectStopRequest(latest) || detectSensitiveRequest(latest));
  let native = guest.hello;
  let english = guest.english.hello;
  if (latest && stop) {
    native = guest.bye;
    english = guest.english.bye;
  } else if (latest) {
    const next = pickScriptedAnswer(guest, latest, said, topic);
    native = next.say;
    english = next.english;
  }
  const translate = humanLang !== guest.language;
  return {
    text: native,
    language: guest.language,
    translation: translate ? english : null,
    translationLang: translate ? 'en' as const : null,
    closed: native === guest.bye,
  };
}

/** A spoken line when the model can write one. The written catalog is the backup. */
async function spokenGuestLine(userId: string, guest: Guest, turns: GuestTurn[], humanLang: string, topic: string) {
  const scripted = scriptedGuestTurn(guest.email, turns, humanLang, topic);
  const latest = [...turns].reverse().find((turn) => turn.mine)?.text ?? '';
  const stop = !!latest && (detectStopRequest(latest) || detectSensitiveRequest(latest));
  if (!scripted || stop) return scripted;
  const visible = turns.map((turn) => ({
    mine: turn.mine,
    text: turn.mine ? turn.text : (turn.translation || turn.text),
  }));
  const already = visible.filter((turn) => !turn.mine).map((turn) => turn.text);
  try {
    const account = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, plan: true },
    });
    if (!account) return scripted;
    const draft = await writeCafeGuestLine({
      user: account,
      name: guest.name,
      city: guest.city,
      country: guest.country,
      bio: guest.bio,
      interests: guest.interests,
      humanLang,
      topic,
      history: visible,
    });
    const sources = latest ? [latest, topic] : [];
    if (!guestLineUsable(draft, humanLang, already, sources)) return scripted;
    return {
      text: draft,
      language: humanLang,
      translation: draft,
      translationLang: humanLang,
      closed: false,
    };
  } catch (err) {
    console.error('[cafe-guest]', err instanceof Error ? err.message : err);
    return scripted;
  }
}

/** A labeled guest answers in the hour. The line is returned and not stored. */
export async function replyAsCafeGuest(userId: string, conversationId: string, history: GuestTurn[]) {
  const c = await db.worldConversation.findUnique({ where: { id: conversationId } });
  if (!c || (c.userAId !== userId && c.userBId !== userId)) throw notFound();
  if (c.status !== 'ACTIVE' || c.endsAt < new Date()) throw new HttpError(409, 'This table has closed.', 'ended');
  const otherId = c.userAId === userId ? c.userBId : c.userAId;
  const other = await db.user.findUnique({
    where: { id: otherId },
    select: { synthetic: true, email: true },
  });
  if (!other?.synthetic) throw new HttpError(404, 'This table is with a person.', 'not_guest');
  const guest = GUESTS.find((g) => g.email === other.email);
  if (!guest) throw notFound();
  const mine = await db.languageSettings.findUnique({ where: { userId }, select: { myLanguage: true } });
  const humanLang = mine?.myLanguage ?? 'en';
  const topic = (await tablePromptFor({
    id: c.id,
    promptTitle: c.promptTitle,
    promptQuestion: c.promptQuestion,
  })).question;
  const turns = history.slice(-12).map((turn) => ({
    mine: !!turn.mine,
    text: sanitizeUntrusted(turn.text, 500),
    translation: sanitizeUntrusted(turn.translation, 500),
  })).filter((turn) => turn.text);
  const line = await spokenGuestLine(userId, guest, turns, humanLang, topic);
  if (!line) throw notFound();
  await db.worldPeerLink.upsert({
    where: { conversationId_userId: { conversationId, userId: otherId } },
    create: { conversationId, userId: otherId, phase: 'open' },
    update: { phase: 'open' },
  });
  return {
    message: packGuestLine(guest, line.text, line.translation, line.translationLang, line.closed),
    closed: line.closed,
  };
}

