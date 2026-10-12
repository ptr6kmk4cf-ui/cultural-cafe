'use client';

import { useEffect, useMemo, useState } from 'react';
import { geoArea, geoNaturalEarth1, geoPath } from 'd3-geo';
import { countryFeatures } from '@/lib/atlas';

const WIDTH = 960;
const HEIGHT = 500;

type Land = (typeof countryFeatures)[number];

/** The largest piece of a country, so France opens on France and not on a distant island. */
function mainLand(country: Land): Land {
  const geometry = country.geometry;
  if (!geometry || geometry.type !== 'MultiPolygon') return country;
  let best = geometry.coordinates[0];
  let bestArea = -1;
  for (const polygon of geometry.coordinates) {
    const area = geoArea({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: polygon } });
    if (area > bestArea) {
      best = polygon;
      bestArea = area;
    }
  }
  return { ...country, geometry: { type: 'Polygon', coordinates: best } };
}

export function CafeMap({
  selected,
  counts,
  onSelect,
}: {
  selected: string | null;
  counts: ReadonlyMap<string, number>;
  onSelect: (name: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const drawn = useMemo(() => {
    return countryFeatures.slice().sort((a, b) => {
      const rank = (name: string) => (name === selected ? 2 : (counts.get(name) ?? 0) > 0 ? 1 : 0);
      return rank(a.properties.name) - rank(b.properties.name);
    });
  }, [selected, counts]);
  const pathOf = useMemo(() => {
    const chosen = selected ? countryFeatures.find((country) => country.properties.name === selected) : null;
    const fitted = {
      type: 'FeatureCollection' as const,
      features: chosen
        ? [mainLand(chosen)]
        : countryFeatures.filter((country) => country.properties.name !== 'Antarctica'),
    };
    const projection = geoNaturalEarth1().fitExtent(
      selected ? [[48, 28], [WIDTH - 48, HEIGHT - 28]] : [[8, 12], [WIDTH - 8, HEIGHT - 8]],
      fitted,
    );
    return geoPath(projection);
  }, [selected]);

  if (!ready) return <div className={`${selected ? 'h-40' : 'aspect-[960/500]'} w-full rounded-2xl bg-ink-800`} aria-hidden />;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="World map. Tap a country."
      preserveAspectRatio="xMidYMid meet"
      className={`${selected ? 'h-40' : 'h-auto'} w-full rounded-2xl bg-ink-800`}
    >
      {drawn.map((country) => {
        const name = country.properties.name;
        const count = counts.get(name) ?? 0;
        const on = selected === name;
        const hot = hovered === name;
        const d = pathOf(country);
        if (!d) return null;
        return (
          <path
            key={name}
            d={d}
            role="button"
            tabIndex={0}
            aria-label={count ? `${name}, ${count} ${count === 1 ? 'person' : 'people'}` : name}
            aria-pressed={on}
            fill={on ? '#e6c98a' : hot ? (count ? '#c48a2a' : '#5c5140') : count ? '#955816' : '#3a3024'}
            stroke="#120e0a"
            strokeWidth={on ? 1.4 : 0.6}
            className="cursor-pointer outline-none focus-visible:stroke-white"
            onMouseEnter={() => setHovered(name)}
            onMouseLeave={() => setHovered((current) => (current === name ? null : current))}
            onClick={() => onSelect(name)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(name);
              }
            }}
          >
            <title>{count ? `${name} · ${count}` : name}</title>
          </path>
        );
      })}
    </svg>
  );
}
