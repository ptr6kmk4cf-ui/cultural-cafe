import { COUNTRY_CITIES } from './country-cities';

/** Turns a typed place into a comparable key. "U.S.A." and "Côte d'Ivoire" both collapse cleanly. */
export function placeKey(value: string) {
  let key = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  let previous = '';
  while (previous !== key) {
    previous = key;
    key = key.replace(/\b([a-z]) (?=[a-z]\b)/g, '$1');
  }
  return key;
}

/** Common spellings that should land on the name drawn on the map. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'united states of america',
  us: 'united states of america',
  'u s a': 'united states of america',
  america: 'united states of america',
  'united states': 'united states of america',
  uk: 'united kingdom',
  'u k': 'united kingdom',
  britain: 'united kingdom',
  'great britain': 'united kingdom',
  england: 'united kingdom',
  scotland: 'united kingdom',
  wales: 'united kingdom',
  uae: 'united arab emirates',
  emirates: 'united arab emirates',
  'czech republic': 'czechia',
  'bosnia and herzegovina': 'bosnia and herz',
  bosnia: 'bosnia and herz',
  'central african republic': 'central african rep',
  drc: 'dem rep congo',
  'dr congo': 'dem rep congo',
  'democratic republic of the congo': 'dem rep congo',
  'democratic republic of congo': 'dem rep congo',
  'congo kinshasa': 'dem rep congo',
  'republic of the congo': 'congo',
  'congo brazzaville': 'congo',
  'ivory coast': 'cote d ivoire',
  'cote divoire': 'cote d ivoire',
  'dominican republic': 'dominican rep',
  'equatorial guinea': 'eq guinea',
  'falkland islands': 'falkland is',
  'falklands': 'falkland is',
  'western sahara': 'w sahara',
  swaziland: 'eswatini',
  'republic of korea': 'south korea',
  'south korea': 'south korea',
  korea: 'south korea',
  holland: 'netherlands',
  'the netherlands': 'netherlands',
  'russian federation': 'russia',
  'viet nam': 'vietnam',
  burma: 'myanmar',
  'north macedonia': 'macedonia',
  'republic of china': 'taiwan',
  'islamic republic of iran': 'iran',
  'syrian arab republic': 'syria',
  'united republic of tanzania': 'tanzania',
  'cape verde': 'cabo verde',
  'the gambia': 'gambia',
  'the bahamas': 'bahamas',
  'south sudan': 's sudan',
  'solomon islands': 'solomon is',
};

/** The map's country name for what someone typed, or null when it is not on the map. */
export function matchCountry(written: string, atlasNames: readonly string[]) {
  const typed = placeKey(written);
  if (!typed) return null;
  const key = COUNTRY_ALIASES[typed] ?? typed;
  return atlasNames.find((name) => placeKey(name) === key) ?? null;
}

export function cityLabel(raw: string) {
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';
  if (trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed.replace(/(^|\s)\p{L}/gu, (letter) => letter.toUpperCase());
}

export type PlacePerson = { city: string; country: string };

export function countriesWithPeople<T extends PlacePerson>(people: readonly T[], atlasNames: readonly string[]) {
  const counts = new Map<string, number>();
  for (const person of people) {
    const country = matchCountry(person.country, atlasNames);
    if (!country || !person.city.trim()) continue;
    counts.set(country, (counts.get(country) ?? 0) + 1);
  }
  return counts;
}

export function citiesInCountry<T extends PlacePerson>(people: readonly T[], countryName: string, atlasNames: readonly string[]) {
  const groups = new Map<string, { label: string; count: number }>();
  for (const person of people) {
    if (matchCountry(person.country, atlasNames) !== countryName) continue;
    const key = placeKey(person.city);
    if (!key) continue;
    const current = groups.get(key);
    const written = person.city.trim().replace(/\s+/g, ' ');
    if (!current) {
      groups.set(key, { label: cityLabel(written), count: 1 });
    } else {
      current.count += 1;
      if (written !== written.toLowerCase()) current.label = written;
    }
  }
  return [...groups.entries()]
    .map(([key, group]) => ({ key, label: group.label, count: group.count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function peopleInCity<T extends PlacePerson>(people: readonly T[], countryName: string, cityKey: string, atlasNames: readonly string[]) {
  return people.filter((person) => matchCountry(person.country, atlasNames) === countryName && placeKey(person.city) === cityKey);
}

/** Exact name, a name that starts with the query, or a later word that does. "usa" must not match "Busan". */
function placeScore(key: string, typed: string) {
  if (!typed || !key) return 0;
  if (key === typed) return 100;
  if (key.startsWith(typed)) return 80;
  if (key.split(' ').some((word) => word.startsWith(typed))) return 70;
  return 0;
}

function countryScore(name: string, typed: string) {
  const key = placeKey(name);
  let score = placeScore(key, typed);
  for (const [alias, target] of Object.entries(COUNTRY_ALIASES)) {
    if (target !== key) continue;
    score = Math.max(score, placeScore(alias, typed));
  }
  return score;
}

/** Countries for the search box, including everyday names such as USA, UK, and Ivory Coast. */
export function searchCountries(query: string, atlasNames: readonly string[]) {
  const typed = placeKey(query);
  if (!typed) return [];
  return atlasNames
    .map((name) => ({ name, score: countryScore(name, typed) }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 8)
    .map((hit) => hit.name);
}

/** Cities for the search box, from the saved list and from people who named a city. */
export function searchCities<T extends PlacePerson>(query: string, atlasNames: readonly string[], people: readonly T[] = []) {
  const typed = placeKey(query);
  if (typed.length < 2) return [];
  const hits: { country: string; key: string; label: string; count: number; score: number }[] = [];
  for (const country of atlasNames) {
    for (const city of citiesForCountry(country, people, atlasNames)) {
      const score = placeScore(city.key, typed);
      if (!score) continue;
      hits.push({ country, key: city.key, label: city.label, count: city.count, score });
    }
  }
  return hits
    .sort((a, b) => b.score - a.score || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, 8)
    .map((hit) => ({ country: hit.country, key: hit.key, label: hit.label, count: hit.count }));
}

/** Every city for a country: the saved list, plus any city a person actually wrote. */
export function citiesForCountry<T extends PlacePerson>(countryName: string, people: readonly T[], atlasNames: readonly string[]) {
  const groups = new Map<string, { key: string; label: string; count: number }>();
  for (const name of COUNTRY_CITIES[countryName] ?? []) {
    const key = placeKey(name);
    if (key) groups.set(key, { key, label: name, count: 0 });
  }
  for (const city of citiesInCountry(people, countryName, atlasNames)) {
    const current = groups.get(city.key);
    if (current) current.count = city.count;
    else groups.set(city.key, city);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
