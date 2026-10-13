'use client';

import { useEffect, useMemo, useState } from 'react';
import { geoArea, geoNaturalEarth1, geoPath } from 'd3-geo';
import { countryFeatures } from '@/lib/atlas';
import { cityPoint } from '@/lib/city-points';

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
  place = null,
  focus = false,
  bare = false,
  quiet = false,
}: {
  selected: string | null;
  counts: ReadonlyMap<string, number>;
  onSelect: (name: string) => void;
  /** City label drawn on the selected country. */
  place?: string | null;
  /** Keep the full map height while zoomed on one country. */
  focus?: boolean;
  /** Drop the rounded frame, for the spinning disc. */
  bare?: boolean;
  /** A picture of the map. Countries are not buttons. */
  quiet?: boolean;
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
  const drawnMap = useMemo(() => {
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
    return { path: geoPath(projection), projection, land: chosen ? mainLand(chosen) : null };
  }, [selected]);
  const pathOf = drawnMap.path;
  const marker = useMemo(() => {
    if (!selected || !place || !drawnMap.land) return null;
    const known = cityPoint(place);
    const projected = known ? drawnMap.projection(known) : null;
    const onMap = projected && projected[0] >= 12 && projected[0] <= WIDTH - 12 && projected[1] >= 16 && projected[1] <= HEIGHT - 12;
    const [x, y] = onMap && projected ? projected : pathOf.centroid(drawnMap.land);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }, [selected, place, drawnMap, pathOf]);

  const frame = bare ? '' : 'rounded-2xl';
  if (!ready) return <div className={`${selected && !focus ? 'h-40' : 'aspect-[960/500]'} w-full ${frame} bg-ink-800`} aria-hidden />;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label="World map. Tap a country."
      preserveAspectRatio="xMidYMid meet"
      className={`${selected && !focus ? 'h-40' : 'h-auto'} w-full ${frame} bg-ink-800`}
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
            role={quiet ? undefined : 'button'}
            tabIndex={quiet ? undefined : 0}
            aria-label={quiet ? undefined : count ? `${name}, ${count} ${count === 1 ? 'person' : 'people'}` : name}
            aria-pressed={quiet ? undefined : on}
            fill={on ? '#e6c98a' : hot ? (count ? '#c48a2a' : '#5c5140') : count ? '#955816' : '#3a3024'}
            stroke="#120e0a"
            strokeWidth={on ? 1.4 : 0.6}
            className={quiet ? undefined : 'cursor-pointer outline-none focus-visible:stroke-white'}
            onMouseEnter={quiet ? undefined : () => setHovered(name)}
            onMouseLeave={quiet ? undefined : () => setHovered((current) => (current === name ? null : current))}
            onClick={quiet ? undefined : () => onSelect(name)}
            onKeyDown={quiet ? undefined : (event) => {
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
      {marker && (
        <g
          pointerEvents="none"
          aria-hidden
          style={{
            transformOrigin: `${marker.x}px ${marker.y}px`,
            transformBox: 'view-box',
            animation: 'cafe-pin-in 1.1s ease both',
          }}
        >
          <text
            x={marker.x}
            y={Math.max(22, marker.y - 16)}
            textAnchor="middle"
            fill="#fff7e6"
            stroke="#120e0a"
            strokeWidth={4}
            paintOrder="stroke"
            fontSize={18}
            fontWeight={700}
          >
            {place}
          </text>
          <circle cx={marker.x} cy={marker.y} r={8} fill="#fff7e6" stroke="#b45309" strokeWidth={2.5} />
          <circle cx={marker.x} cy={marker.y} r={3} fill="#b45309" />
        </g>
      )}
    </svg>
  );
}
