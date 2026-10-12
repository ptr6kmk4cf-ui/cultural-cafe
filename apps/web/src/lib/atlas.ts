import { feature } from 'topojson-client';
import type { FeatureCollection, Geometry } from 'geojson';
import type { GeometryCollection, Topology } from 'topojson-specification';
import raw from 'world-atlas/countries-110m.json';

type CountryProps = { name: string };

const topology = raw as unknown as Topology;
const countries = topology.objects.countries as GeometryCollection<CountryProps>;

export const countryFeatures = (feature(topology, countries) as unknown as FeatureCollection<Geometry, CountryProps>).features;

export const atlasCountryNames = countryFeatures.map((country) => country.properties.name);
