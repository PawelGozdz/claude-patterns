// scripts/lib/card-scope.mjs — przypisuje karty reguł do warstw po tagach (ORC-163).
//
// Po co: `cardsFor` oddawał każdej warstwie WSZYSTKIE karty z `always`/triggerów, więc implementer
// infrastruktury dostawał karty handlerów, a implementer testów karty repozytoriów (TS-OBS-LOG-LINE-001:
// 20 kart, 91 tys. znaków w każdym agencie, każda tura płaci za nie cache-read). Tagi kart (`**Tags**:
// "api:app"`) i warstw (`tags:` w runtime.yml) już mówią, kto czego potrzebuje; silnik z nich nie korzystał.
//
// Reguła (zachowawcza — karta bez jednoznacznego adresata zostaje dla wszystkich):
//   • karta z tagiem `any:*`, bez tagów albo spoza `always`/triggerów (analiza, warstwa) → wszystkie warstwy;
//   • tag karty pasuje do tagu warstwy, gdy są równe albo jeden jest przedrostkiem drugiego po `:`
//     (`api:domain:aggregate` ↔ `api:domain`);
//   • karta pasuje do ≥ 1 uruchamianej warstwy → tylko do nich;
//   • karta pasuje wyłącznie do warstw POMINIĘTYCH w tym przebiegu (np. karty domeny przy pominiętej domenie)
//     → `forLayers: []`: żaden implementer ani weryfikator jej nie dostaje, bramka końcowa tak;
//   • karta bez dopasowania do żadnej warstwy planu (przekrojowa: bezpieczeństwo, logowanie, zdarzenia) → wszystkie;
//   • warstwa bez tagów dostaje wszystko (nie wiemy, czego potrzebuje).
// Wynik: `forLayers: [<id warstwy bazowej>…]` na karcie albo brak pola (= wszystkie). Bramka końcowa nie
// używa `forLayers` — ocenia całość zmiany i dostaje komplet.

function tagsOf(content) {
  const m = /^\*\*Tags\*\*:\s*(.+)$/m.exec(String(content ?? ''));
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
}

function tagMatches(a, b) {
  return a === b || a.startsWith(b + ':') || b.startsWith(a + ':');
}

export function scopeCardsToLayers(patterns, runningLayers, allLayers = runningLayers) {
  const bases = [...new Map(runningLayers.map((l) => [l.base || l.id, l.tags ?? []])).entries()]
    .map(([id, tags]) => ({ id, tags }));
  const untagged = bases.filter((b) => !b.tags.length).map((b) => b.id);
  return patterns.map((p) => {
    if (p.origin !== 'always' && p.origin !== 'trigger') return p;
    const tags = tagsOf(p.content);
    if (!tags.length || tags.some((t) => t.startsWith('any:'))) return p;
    const hit = bases
      .filter((b) => b.tags.length && b.tags.some((lt) => tags.some((t) => tagMatches(t, lt))))
      .map((b) => b.id);
    if (!hit.length) {
      const matchesSkipped = allLayers.some((l) => (l.tags ?? []).some((lt) => tags.some((t) => tagMatches(t, lt))));
      return matchesSkipped ? { ...p, forLayers: [] } : p;
    }
    return { ...p, forLayers: [...new Set([...hit, ...untagged])] };
  });
}
