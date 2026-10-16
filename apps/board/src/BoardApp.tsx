import { useCallback, useEffect, useRef, useState } from 'react';
import {
  boardLinesFromElements,
  boardLinesToTranslate,
  pruneBoardCaches,
  restoreSharedElements,
  stampNewText,
  viewedElements,
  type BoardReader,
  type BoardTextElement,
} from '@conversa/shared';
import { Excalidraw } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { api, ApiError } from './api';

type SceneEl = BoardTextElement & Record<string, unknown>;
type BoardState = {
  ended: boolean;
  version: number;
  elements: SceneEl[];
  me: BoardReader & { name: string };
  peerLanguage: string;
};

const table = new URLSearchParams(window.location.search).get('table') || '';
const cafe = import.meta.env.DEV ? 'http://localhost:3000' : '';

const LANG: Record<string, string> = {
  en: 'en',
  fr: 'fr-FR',
  es: 'es-ES',
  de: 'de-DE',
  it: 'it-IT',
  pt: 'pt-BR',
  ja: 'ja-JP',
  ko: 'ko-KR',
  zh: 'zh-CN',
  ru: 'ru-RU',
  ar: 'ar-SA',
  nl: 'nl-NL',
  pl: 'pl-PL',
  tr: 'tr-TR',
  vi: 'vi-VN',
  hi: 'hi-IN',
  uk: 'uk-UA',
  cs: 'cs-CZ',
  hu: 'hu-HU',
  ro: 'ro-RO',
  sv: 'sv-SE',
  fi: 'fi-FI',
  da: 'da-DK',
  el: 'el-GR',
  he: 'he-IL',
  ca: 'ca-ES',
};

export function BoardApp() {
  const [boot, setBoot] = useState<BoardState | null>(null);
  const [error, setError] = useState('');
  const source = useRef<SceneEl[]>([]);
  const version = useRef(0);
  const reader = useRef<BoardReader | null>(null);
  const translations = useRef<Record<string, string>>({});
  const translatedFrom = useRef<Record<string, string>>({});
  const apiRef = useRef<{ updateScene: (scene: { elements: readonly unknown[] }) => void } | null>(null);
  const applying = useRef(false);
  const saveTimer = useRef(0);
  const translateTimer = useRef(0);
  const live = useRef(true);

  const keepCaches = (elements: SceneEl[]) => {
    pruneBoardCaches(
      boardLinesFromElements(elements).map((line) => line.id),
      translations.current,
      translatedFrom.current,
    );
  };

  const paint = useCallback((elements: SceneEl[]) => {
    const who = reader.current;
    const apiNow = apiRef.current;
    if (!who || !apiNow) return;
    keepCaches(elements);
    applying.current = true;
    apiNow.updateScene({ elements: viewedElements(elements, who, translations.current) as never });
    applying.current = false;
  }, []);

  const translateSoon = useCallback(
    (elements: SceneEl[]) => {
      const who = reader.current;
      if (!who || !table) return;
      window.clearTimeout(translateTimer.current);
      const needed = boardLinesToTranslate(boardLinesFromElements(elements), who).filter(
        (line) => translatedFrom.current[line.id] !== line.text,
      );
      if (!needed.length) return;
      translateTimer.current = window.setTimeout(() => {
        api<{ translations: Record<string, string> }>(`/api/world/conversations/${table}/board/translate`, {
          body: { elements },
        })
          .then((r) => {
            if (!live.current) return;
            translations.current = { ...translations.current, ...r.translations };
            for (const line of needed) {
              if (r.translations[line.id]) translatedFrom.current[line.id] = line.text;
            }
            paint(source.current);
          })
          .catch(() => {});
      }, 700);
    },
    [paint],
  );

  const saveSoon = useCallback(
    (elements: SceneEl[]) => {
      if (!table) return;
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        api<{ conflict?: boolean; version: number; elements: SceneEl[] }>(`/api/world/conversations/${table}/board`, {
          method: 'PUT',
          body: { version: version.current, elements },
          allow: [409],
        })
          .then((r) => {
            if (!live.current) return;
            version.current = r.version;
            if (r.conflict) {
              source.current = r.elements;
              paint(r.elements);
              translateSoon(r.elements);
            }
          })
          .catch((err) => {
            if (!live.current) return;
            if (err instanceof ApiError && (err.status === 409 || err.status === 403)) setError(err.message);
          });
      }, 500);
    },
    [paint, translateSoon],
  );

  useEffect(() => {
    live.current = true;
    if (!table) {
      setError('Open the board from a table in the café.');
      return;
    }
    api<BoardState>(`/api/world/conversations/${table}/board`)
      .then((data) => {
        if (!live.current) return;
        source.current = data.elements;
        version.current = data.version;
        reader.current = { id: data.me.id, language: data.me.language };
        setBoot(data);
        if (data.ended) setError('This table has closed.');
      })
      .catch((err) => {
        if (!live.current) return;
        if (err instanceof ApiError && err.status === 401) {
          window.location.href = `${cafe}/login?next=${encodeURIComponent(window.location.href)}`;
          return;
        }
        setError(err instanceof Error ? err.message : 'Could not open the board.');
      });
    return () => {
      live.current = false;
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(translateTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!boot || boot.ended) return;
    const tick = () => {
      api<BoardState>(`/api/world/conversations/${table}/board`)
        .then((data) => {
          if (!live.current) return;
          if (data.ended) {
            setError('This table has closed.');
            setBoot((b) => (b && !b.ended ? { ...b, ended: true } : b));
            return;
          }
          if (data.version <= version.current) return;
          version.current = data.version;
          source.current = data.elements;
          paint(data.elements);
          translateSoon(data.elements);
        })
        .catch(() => {});
    };
    const t = window.setInterval(tick, 2000);
    return () => window.clearInterval(t);
  }, [boot, paint, translateSoon]);

  if (error && !boot) {
    return (
      <div className="cafe-board-msg">
        <p>{error}</p>
        <p>
          <a href={`${cafe}/app/world`}>Back to the Café</a>
        </p>
      </div>
    );
  }
  if (!boot) return <div className="cafe-board-msg">Opening the board…</div>;

  return (
    <>
      <header className="cafe-board-bar">
        <div>
          <h1>Café board</h1>
          <p>
            You write in your language.{' '}
            {boot.me.language !== boot.peerLanguage
              ? 'They see a translation. You see theirs. Your own words stay as you wrote them.'
              : 'You both read the same words.'}
          </p>
        </div>
        <a href={`${cafe}/app/world/${table}`}>Back to the table</a>
      </header>
      <div className="cafe-board-stage">
        <Excalidraw
          excalidrawAPI={(next) => {
            apiRef.current = next as unknown as { updateScene: (scene: { elements: readonly unknown[] }) => void };
            paint(source.current);
            translateSoon(source.current);
          }}
          theme="dark"
          langCode={LANG[boot.me.language] || 'en'}
          name="Café board"
          viewModeEnabled={boot.ended}
          UIOptions={{ canvasActions: { loadScene: false, saveToActiveFile: false } }}
          initialData={{
            elements: viewedElements(boot.elements, boot.me, {}) as never[],
            appState: { theme: 'dark' },
          }}
          onChange={(elements) => {
            const who = reader.current;
            if (applying.current || !who || boot.ended) return;
            const stamped = stampNewText(elements as unknown as SceneEl[], who);
            const shared = restoreSharedElements(stamped, source.current, who);
            source.current = shared;
            saveSoon(shared);
            translateSoon(shared);
          }}
        />
      </div>
      {error && boot ? <div className="cafe-board-msg">{error}</div> : null}
    </>
  );
}
