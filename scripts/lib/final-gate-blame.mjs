// scripts/lib/final-gate-blame.mjs — którą warstwę wskazują naruszenia pierwszej bramki końcowej
// (TASK-OBS-012, ADR 0012 aneks).
//
// Zdarzenie `step.end` bramki nie niesie naruszeń, a wynik Workflow (`wf_*.json`) niesie je jako
// teksty ze ścieżkami. Ta funkcja zamienia je w listę id warstw (bez ścieżek), którą kolektor dopisuje
// do pierwszego kroku bramki, a skrypt `telemetry-backfill-gate-blame.mjs` do zdarzeń historii.
// Jedna implementacja dla obu, żeby stare i nowe dane miały tę samą semantykę.
//
// Przypisanie jest dolną granicą: naruszenie bez ścieżki z plików warstwy (dokument, luka w sprawdzeniu,
// przyczyna maszynowa) zostaje bez właściciela i jest liczone osobno (`unblamed`).

const PATH_TOKEN = /[\w@.\-/]+\.[a-z0-9]{1,6}/gi;

/** Krok bramki końcowej: rola `gate` i id zaczynające się od `final` (`final:final:gate#1`, `final-gate-r2`). */
export function isFinalGateStep(ev) {
  return Boolean(ev && ev.kind === 'step.end' && ev.step && ev.step.role === 'gate' && /^final/.test(String(ev.step.id)));
}

/** Pierwszy (wg `ts`) krok bramki końcowej każdego przebiegu: Map<runId, zdarzenie>. */
export function firstFinalGates(events) {
  const first = new Map();
  for (const ev of events) {
    if (!isFinalGateStep(ev)) continue;
    const cur = first.get(ev.runId);
    if (!cur || ev.ts < cur.ts || (ev.ts === cur.ts && ev.id < cur.id)) first.set(ev.runId, ev);
  }
  return first;
}

const norm = (p) => String(p).replace(/^\.?\//, '');

// Właściciel ścieżki: pierwsza warstwa, której plik pasuje całą ścieżką (równo lub jako sufiks).
// Sama nazwa pliku (`index.ts`) liczy się tylko wtedy, gdy w całym wyniku pasuje do jednego pliku —
// inaczej każdy barrel zrzuciłby winę na pierwszą warstwę z listy.
function ownerOf(token, files) {
  const t = norm(token);
  if (t.includes('/')) {
    const hit = files.find((f) => f.path === t || f.path.endsWith(`/${t}`) || t.endsWith(`/${f.path}`));
    return hit ? hit.layer : null;
  }
  const hits = files.filter((f) => f.path === t || f.path.endsWith(`/${t}`));
  return hits.length === 1 ? hits[0].layer : null;
}

/**
 * Wynik skryptu Workflow → { units: [id warstw], unblamed: n } albo null (brak bramki albo warstw —
 * ręczny skrypt Workflow, przebieg przerwany). Dla bramki `go` zwraca `units: []`: pole obecne znaczy
 * „przypisanie wykonano", co daje mianownik odsetka fałszywych GO.
 */
export function blameFromResult(result) {
  if (!result || typeof result !== 'object' || !Array.isArray(result.layers)) return null;
  const first = result.finalGateRound1 || result.finalGate;
  if (!first || typeof first.verdict !== 'string') return null;
  if (first.verdict.toUpperCase() === 'GO') return { units: [], unblamed: 0 };

  const files = [];
  for (const layer of result.layers) {
    if (!layer || typeof layer.id !== 'string' || !Array.isArray(layer.files)) continue;
    for (const f of layer.files) if (typeof f === 'string') files.push({ layer: layer.id, path: norm(f) });
  }
  const units = new Set();
  let unblamed = 0;
  for (const violation of Array.isArray(first.violations) ? first.violations : []) {
    const text = typeof violation === 'string' ? violation : JSON.stringify(violation);
    const owner = (text.match(PATH_TOKEN) || []).map((t) => ownerOf(t, files)).find(Boolean);
    if (owner) units.add(owner); else unblamed++;
  }
  return { units: [...units].sort(), unblamed };
}

/** Jednostka weryfikacji → warstwa, w obu postaciach id kroku (`<warstwa>:verifier`, starsze `<warstwa>-verify[-noop]`). */
export function layerOfVerifierUnit(unit) {
  return String(unit).replace(/(:verifier|-verify(-noop)?)$/, '');
}
