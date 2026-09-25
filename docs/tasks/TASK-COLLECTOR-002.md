---
id: TASK-COLLECTOR-002
title: 'Nasłuchiwacz obecności (idle) z wymiennym źródłem bezczynności + wskaźnik w statusline'
type: task
status: todo
priority: P1
created_date: 2026-09-12
updated_date: 2026-09-12
epic_id: EP-COLLECTOR-0
story_points: 3
dependencies: [TASK-COLLECTOR-001]
blocks: []
---

# TASK-COLLECTOR-002 — Nasłuchiwacz obecności

**Epik:** [EP-COLLECTOR-0](./EP-COLLECTOR-0.md). **Kanon:** `/opt/projects/grant-flow/docs/product/work-ledger-canon.md` §3.7, D6, D20.

## Cel

System ma odróżnić „człowiek czyta wynik agenta" od „człowiek poszedł na obiad, agent pracuje".
Sygnały Claude Code mówią, kiedy człowiek *pisze*; nasłuchiwacz mówi, kiedy *jest*.

## Zakres

1. Proces użytkownika `grantflow-presence` (Node lub bash + timer systemd `--user`; na macOS
   launchd): co `PRESENCE_INTERVAL` (domyślnie 120 s) odczytuje bezczynność i dopisuje
   `presence { idleSeconds, source }` do bufora z TASK-COLLECTOR-001 (ten sam format, bez `repositoryRef`).
2. **Wymienne źródła bezczynności** (wzorzec strategii, pierwsze dostępne wygrywa, `source` w sygnale):
   `xprintidle` (X11), D-Bus `org.gnome.Mutter.IdleMonitor` / `org.freedesktop.ScreenSaver` (Wayland),
   `ioreg HIDIdleTime` (macOS), `none` (fallback: sygnał `presence` z `idleSeconds: null` →
   grant-flow policzy dzień jako `inferred`).
3. Sterowanie: `grantflow presence start|stop|status`; opcjonalny autostart tylko po jawnej
   decyzji osoby (`--enable-autostart`). Domyślnie **wyłączony** po `setup-project.sh`.
4. Opcja `focusedRepo` (nazwa repo z aktywnego terminala) — **wyłączona domyślnie**, włączana per
   osoba; bez niej sygnał nie niesie nic poza bezczynnością.
5. Wskaźnik w `statusline-pm.js`: `● presence` / `○ presence off` / `! presence stale` (brak
   heartbeatu > 3 interwały).
6. Test na hoście właściciela (D20): tabela „źródło → działa/nie" w README; jeśli żadne nie jest
   miarodajne na Waylandzie, zgłosić alternatywę (np. `swayidle`, `hypridle`) jako follow-up.

## Kryteria akceptacji

- [ ] Heartbeat co interwał trafia do bufora; po `stop` przestaje; `status` pokazuje ostatni
- [ ] Sygnał nie zawiera tytułów okien, nazw aplikacji ani niczego poza `idleSeconds` i `source`
      (chyba że `focusedRepo` włączone jawnie)
- [ ] Brak dostępnego źródła nie wywala procesu — `source: none`, `idleSeconds: null`
- [ ] Wskaźnik w statusline reaguje w ≤ 1 interwał
- [ ] README: instalacja, prywatność (co zbiera, czego nie), tabela źródeł per system

## Pliki (planowane)

- `tools/integrations/grant-flow/grantflow-presence` (+ `lib/idle-sources/*.js`)
- `tools/integrations/grant-flow/systemd/grantflow-presence.timer|service`
- `hooks/statusline-pm.js`
- `docs/work-signal-schema.md` (sekcja `presence`)
