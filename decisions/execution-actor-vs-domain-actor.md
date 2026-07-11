# Decision: ExecutionActor vs ActorId vs ActorType (trzy pojęcia "actor")

**Kiedy wypływa:** kod dotyka słowa "actor" — tożsamość wykonawcy żądania (admin/CS/AI działa
w imieniu usera), właściciel zasobu, albo klasyfikacja uczestnika rynku. Trzy RÓŻNE pojęcia
o zbieżnych nazwach; pomylenie = privilege escalation albo błędny cennik.
**Wybór między:** `ExecutionActor` (infra, na `IActor` z `@vytches/ddd-domain-primitives`)
↔ `ActorId` (domenowe VO, Dual Identity) ↔ `ActorType`/`ActorTypeVO` (domenowe VO, klasa rynkowa)

## Jedno zdanie rozstrzygające

**ActorType = kim jesteś na rynku · ActorId = czyj jest zasób · ExecutionActor = w jakiej roli
wykonujesz TO żądanie.**

## Wybierz ExecutionActor (warstwa infra/application) gdy

- pytasz "**kto fizycznie wykonuje** to wywołanie i w jakiej roli": `user`, `admin`,
  `moderator`, `ai_agent`, `system` (cron),
- budujesz audyt "wykonane przez X w imieniu Y" (actor ≠ subject ⇒ Tier-1),
- implementujesz onBehalf/impersonację (CS naprawia coś za usera) albo dispatcher AI
  (AI działa w imieniu usera sesji),
- ustawiasz go WYŁĄCZNIE w guardzie/dispatcherze (kryptowalidowane źródło), żyje w
  RequestContext (CLS) — **nigdy nie schodzi do warstwy domeny**.

## Wybierz ActorId (domena) gdy

- pytasz "**czyj jest ten zasób**" — polimorficzny właściciel: user LUB organizacja LUB grupa
  (Dual Identity: WHO OWNS = ActorId, WHO CREATED = zawsze UserId),
- agregat/event potrzebuje przypisania własności niezależnego od tego, który człowiek kliknął
  (pracownik odchodzi → zasób zostaje przy organizacji).

## Wybierz ActorType / ActorTypeVO (domena) gdy

- pytasz "**jaką klasą uczestnika rynku** jest właściciel": INDIVIDUAL / NGO / HOSPITAL /
  MUNICIPAL_OFFICE... — cennik (multiplikatory), wymogi weryfikacji (NIP/KRS), reguły
  per typ instytucji,
- NIGDY do autoryzacji żądania — to nie jest rola wykonawcy.

## Pytania rozstrzygające

1. Czy odpowiedź zmienia się między dwoma żądaniami tego samego usera? (tak → ExecutionActor;
   własność i klasa rynkowa nie zależą od żądania)
2. Czy pole ma trafić do agregatu/eventu domenowego? (tak → ActorId/ActorType;
   ExecutionActor nie przecieka do domeny — domena jest ślepa na impersonację)
3. Czy wartość wpływa na cenę lub wymóg weryfikacji? (tak → ActorType)
4. Czy potrzebujesz "admin zrobił X za usera Y" w audycie? (tak → ExecutionActor +
   onBehalfOfUserId; ownerId zasobu = Y, nie admin)

## Pułapki

- **Autoryzacja po ActorType** ("HOSPITAL może więcej") zamiast po permissions wykonawcy —
  klasa rynkowa ≠ uprawnienia żądania.
- **ExecutionActor w agregacie/evencie** — domena zaczyna rozróżniać "kto kliknął",
  łamie czystość i blokuje onBehalf/AI (handler musiałby kłamać).
- **Zapis admina jako ownerId** przy akcji onBehalf — zasób ma należeć do usera (subject);
  wykonawca idzie wyłącznie do audytu.
- **Tożsamość wykonawcy z request body** (`targetUserId` w komendzie) — zawsze z guarda/
  RequestContext (Dual Identity, ADR-0021 w LocalHero).
- **Rozszerzanie enuma `DefaultActorType` w bibliotece pod potrzeby projektu** —
  `IActor.type: string | DefaultActorType` przyjmuje projektowe stringi (`'moderator'`);
  upstream dopiero po walidacji produkcyjnej.

## Sprawdź precedens projektu

`docs/adr/` + BUSINESS_RULES.yaml. W LocalHero: TS-MULTI-ACTOR-001 (ActorId/ActorType),
TS-SEC-ONBEHALF-001 + `project-orchestration/analysis/TS-SEC-ONBEHALF-001.analysis.md` §3
(D-ACTOR — źródło tej karty), vytches-ddd VA-001 (IAIActor, dispatcher AI),
ADR-0104 (2026-07-11 — drugi konsument `ActorId` poza Quick-Jobs: ServiceProvider/
ServiceOffering migrują z bespoke `userId`+`organizationId`+`ownerType` na `ActorId`,
zamiast wymyślać nowe pole — przykład stosowania tej karty przy refaktorze istniejącego
agregatu, nie tylko przy projektowaniu nowego). Jeśli projekt nie ma jeszcze pojęcia
wykonawcy — rekomenduj `ExecutionActor` na `IActor` i zaproponuj ADR.
