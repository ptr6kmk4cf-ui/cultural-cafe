import assert from 'node:assert/strict';
import test from 'node:test';
import { atlasCountryNames } from './atlas';
import { COUNTRY_CITIES } from './country-cities';
import { citiesForCountry, citiesInCountry, matchCountry, peopleInCity, searchCities, searchCountries } from './map-places';

const NAMES = ['France', 'United States of America', 'Japan', "Côte d'Ivoire", 'Dem. Rep. Congo'];

test('A typed country lands on the name drawn on the map', () => {
  assert.equal(matchCountry('france', NAMES), 'France');
  assert.equal(matchCountry('USA', NAMES), 'United States of America');
  assert.equal(matchCountry('Ivory Coast', NAMES), "Côte d'Ivoire");
  assert.equal(matchCountry('DRC', NAMES), 'Dem. Rep. Congo');
  assert.equal(matchCountry('Atlantis', NAMES), null);
  assert.equal(matchCountry('  ', NAMES), null);
});

test('Cities in a country stay together when the spelling differs', () => {
  const people = [
    { city: 'nice', country: 'france' },
    { city: 'Nice', country: 'France' },
    { city: 'Lyon', country: 'France' },
    { city: 'Kyoto', country: 'Japan' },
  ];
  const cities = citiesInCountry(people, 'France', NAMES);
  assert.deepEqual(cities.map((city) => city.label), ['Lyon', 'Nice']);
  assert.equal(cities.find((city) => city.label === 'Nice')?.count, 2);
  const nice = cities.find((city) => city.label === 'Nice');
  assert.equal(peopleInCity(people, 'France', nice?.key ?? '', NAMES).length, 2);
});

test('A country opens with its cities, and a person is counted on theirs', () => {
  const cities = citiesForCountry('France', [{ city: 'nice', country: 'france' }], NAMES);
  assert.ok(cities.some((city) => city.label === 'Lyon'));
  assert.equal(cities[0]?.label, 'Nice');
  assert.equal(cities[0]?.count, 1);
  const missing = atlasCountryNames.filter((name) => !(COUNTRY_CITIES[name]?.length));
  assert.deepEqual(missing, []);
});

test('Search accepts everyday country names and city names', () => {
  assert.equal(searchCountries('USA', atlasCountryNames)[0], 'United States of America');
  assert.equal(searchCountries('UK', atlasCountryNames)[0], 'United Kingdom');
  assert.ok(searchCountries('ivory coast', atlasCountryNames).includes("Côte d'Ivoire"));
  assert.ok(searchCountries('cote', atlasCountryNames).includes("Côte d'Ivoire"));
  assert.deepEqual(searchCountries('zzz', atlasCountryNames), []);
  const hits = searchCities('alex', atlasCountryNames, [{ city: 'Alexandria', country: 'Egypt' }]);
  assert.equal(hits[0]?.label, 'Alexandria');
  assert.equal(hits[0]?.country, 'Egypt');
  assert.equal(hits[0]?.count, 1);
  assert.equal(searchCities('usa', atlasCountryNames).some((hit) => hit.label === 'Busan'), false);
  assert.ok(searchCities('york', atlasCountryNames).some((hit) => hit.label === 'New York' && hit.country === 'United States of America'));
});
