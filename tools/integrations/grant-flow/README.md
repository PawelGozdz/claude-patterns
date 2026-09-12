# grant-flow Tools — Instalacja i Quick Start

## Ostatnio zweryfikowano

- **Data**: 2026-09-09
- **Względem**: grant-flow API po TS-SSO-023 (2026-08-24, usunięcie `/api/auth/login` +
  `/api/auth/refresh`) i `iam@d032ec4` (PAT flow, TS-SSO-028/033/035).
- **Co sprawdzono**: `grantflow-log-time.sh` używa wyłącznie PAT (`pat-login-cli/`) — zero
  odwołań do starych endpointów email+hasło.
- **Kiedy odświeżyć**: przy każdej zmianie auth w grant-flow lub `iam`, która mogłaby złamać
  ten skrypt — zaktualizuj tę sekcję razem z fixem (konwencja: `docs/CONTRIBUTING.md` →
  "Adding / Updating a tools/integrations/\* entry"). Ten skrypt sam nie zauważy, że kontrakt
  API się zmienił — brak tego pola przez ~2 tygodnie (2026-08-24 → 2026-09-09) to był realny,
  niezasygnalizowany drift.

## Auth: PAT przez `iam`, nie hasło

Od TS-SSO-023 (2026-08-24) grant-flow nie ma już własnego logowania email+hasło —
uwierzytelnianie idzie przez firmową bramę (`iam`), przez ten sam mechanizm co ludzie w
przeglądarce, tylko przez **Personal Access Token (PAT)** (`iam`: TS-SSO-028/033/035).
Logowanie CLI to loopback-redirect (RFC 8252) — dokładnie ten wzorzec co `gh auth login`/
`aws sso login`: skrypt otwiera przeglądarkę, Ty się logujesz i wybierasz aplikację
(`grant-flow`), token wraca do terminala automatycznie.

## Instalacja

**Skopiuj CAŁY katalog**, nie sam skrypt — `grantflow-log-time.sh` wymaga `pat-login-cli/`
jako towarzyszącego modułu (Node/TS, loguje przez przeglądarkę):

```bash
mkdir -p ~/.local/share/grantflow-cli
cp -r pat-login-cli ~/.local/share/grantflow-cli/pat-login-cli
cp grantflow-log-time.sh ~/.local/bin/grantflow-log-time
chmod +x ~/.local/bin/grantflow-log-time

# Weryfikacja
which grantflow-log-time
grantflow-log-time --status
```

Jeśli instalujesz gdzie indziej niż `~/.local/share/grantflow-cli/pat-login-cli`, ustaw
`GRANTFLOW_PAT_CLI_DIR` w środowisku (np. w `.bashrc`/`.zshrc`) na realną ścieżkę.

Wymagania: `bash`, `curl`, `python3` (lub `jq`) — plus **Node.js + `npx`** (używa `tsx` przez
`npx`) do logowania przez przeglądarkę. Reszta operacji (logowanie godzin z ważnym tokenem
w cache) nie potrzebuje Node.

## Quick Start

```bash
# 1. Jednorazowo — skonfiguruj URL-e i zaloguj się przez przeglądarkę
grantflow-log-time --setup
# Podaje: URL grant-flow (przez bramę, np. https://grant-flow.app.dev.juz-ide.pl),
# URL panelu iam (do wydania PAT, np. https://admin.app.dev.juz-ide.pl)

# 2. Jednorazowo per projekt — zmapuj repo na projekt
grantflow-log-time --map grant-flow 0fbf13c5-282a-4f78-9ae2-25ea6d6cf79f

# 3. Koniec sesji — zaloguj czas
grantflow-log-time --project <uuid> --hours 2.5 --description "Implementacja CQRS handlerów"
# lub przez Claude Code: /log-time
```

## Pliki konfiguracyjne

| Plik | Zawartość | Chmod |
|------|-----------|-------|
| `~/.grantflow` | `GRANTFLOW_URL` (brama), `IAM_ADMIN_BASE_URL` (panel iam) — bez sekretów | 600 |
| `~/.cache/iam-pat-cli/token-<host>.json` | Cache PAT (zarządzany przez `pat-login-cli`, nie ręcznie) | 600, katalog 700 |
| `~/.grantflow-projects` | JSON: repo_name → project_uuid (globalne, wszystkie repo) | 600 |
| `$REPO_ROOT/.grantflow` | Opcjonalny, per-repo: `GRANTFLOW_PROJECT_ID`/`GRANTFLOW_PROJECT_NAME` (patrz skill `log-time`, Krok 2a) | gitignored w repo konsumenta |

**Nigdy nie commituj `~/.grantflow-projects` ani cache tokenu.** `$REPO_ROOT/.grantflow` w
repo konsumenta też ma być gitignored — trzymaj tam wyłącznie `.grantflow.example` (bez
realnego UUID, jeśli UUID ma być prywatny) w gicie.

### Format `~/.grantflow`

```bash
GRANTFLOW_URL=https://grant-flow.app.dev.juz-ide.pl
IAM_ADMIN_BASE_URL=https://admin.app.dev.juz-ide.pl
```

> Zero sekretów w tym pliku — sam PAT żyje wyłącznie w cache `pat-login-cli`
> (`~/.cache/iam-pat-cli/`), nigdy w `~/.grantflow`.

## Wszystkie komendy

```bash
grantflow-log-time --setup                      # URL-e + login PAT przez przeglądarkę
grantflow-log-time --status                     # diagnostyka
grantflow-log-time --list-projects              # lista projektów (wymaga read.project.*)
grantflow-log-time --list-projects --json       # lista projektów (JSON)
grantflow-log-time --map <repo> <uuid>          # mapuj repo na projekt (globalnie)
grantflow-log-time --today                      # wpisy z dzisiaj
grantflow-log-time --week                       # suma bieżącego tygodnia

# Logowanie czasu
grantflow-log-time --project <uuid> --hours 2.5 --description "..."
grantflow-log-time --project <uuid> --hours 2.5 --date 2026-05-18 --description "..."

# Logowanie z referencją do zadania/commita/PR/brancha (external_reference)
grantflow-log-time --project <uuid> --hours 1.5 --description "..." --task TS-RATE-001
grantflow-log-time --project <uuid> --hours 1.5 --description "..." --commit
grantflow-log-time --project <uuid> --hours 1.5 --description "..." --pr feature/billing-rates
grantflow-log-time --project <uuid> --hours 1.5 --description "..." --task TS-001 --commit
grantflow-log-time --project <uuid> --hours 1.5 --description "..." --task-id <task-uuid>
grantflow-log-time --project <uuid> --hours 1.5 --description "..." --no-branch  # wyłącz auto-branch
```

Branch bieżącego repo (`git branch --show-current`) trafia do `externalReference`
**automatycznie**, bez flagi — `--pr` nadpisuje go (to samo pole logiczne), `--no-branch`
wyłącza. `--commit`/`--task` są zawsze jawne (dopisywane, nie nadpisywane).

## Multi-repo setup (wiele projektów na jednej maszynie)

`~/.grantflow` (URL-e) i cache PAT (`~/.cache/iam-pat-cli/`) są **globalne** — logujesz się
raz przez przeglądarkę, działa w każdym repo na tej maszynie, bez ponownego logowania (do
wygaśnięcia/odwołania tokenu — wtedy automatyczny re-login przy najbliższym 401).
`~/.grantflow-projects` (mapowanie repo → uuid) jest też **globalne**.

### Krok 1 — jednorazowo: instalacja + logowanie

```bash
mkdir -p ~/.local/share/grantflow-cli
cp -r /opt/projects/claude-patterns/tools/integrations/grant-flow/pat-login-cli ~/.local/share/grantflow-cli/pat-login-cli
cp /opt/projects/claude-patterns/tools/integrations/grant-flow/grantflow-log-time.sh ~/.local/bin/grantflow-log-time
chmod +x ~/.local/bin/grantflow-log-time
grantflow-log-time --setup   # URL-e + login PAT przez przeglądarkę, zapisuje ~/.grantflow
```

### Krok 2 — per repo: stwórz projekt w grant-flow i zmapuj

Dla każdego repozytorium, które chcesz śledzić:

1. Stwórz projekt w grant-flow (przez API lub UI) — zanotuj UUID.
2. Zmapuj globalnie:

```bash
grantflow-log-time --map grant-flow    0fbf13c5-282a-4f78-9ae2-25ea6d6cf79f
grantflow-log-time --map juz-ide-api-1 b528be5e-ef66-4ae5-beca-e71ac8d71dfd
grantflow-log-time --map vytches-ddd   <uuid>
```

albo — jeśli wolisz konfigurację per-repo zamiast globalnej (np. żeby UUID projektu jechał
razem z repo, per-osoba na swoim `.grantflow` lokalnym, nie w gicie) — stwórz w korzeniu
repo:

```bash
# $REPO_ROOT/.grantflow.example (W GICIE, bez realnego UUID)
GRANTFLOW_PROJECT_ID=
GRANTFLOW_PROJECT_NAME=

# $REPO_ROOT/.grantflow (gitignored, realna wartość)
GRANTFLOW_PROJECT_ID=b528be5e-ef66-4ae5-beca-e71ac8d71dfd
GRANTFLOW_PROJECT_NAME=juz-ide-api
```

Skill `log-time` (Krok 2a) czyta ten plik jako PIERWSZY wybór, przed globalnym mapowaniem.

### Krok 3 — codziennie: loguj czas przez Claude Code

Skill `/log-time` (`skills/integrations/log-time/`) — zainstaluj globalnie
(`~/.claude/skills/log-time/`) albo per-repo (`$REPO_ROOT/.claude/skills/log-time/`), żeby
było dostępne jako slash command. W dowolnym repo wpisz `/log-time` — Claude wykryje repo,
znajdzie UUID (lokalny `.grantflow` → globalny `~/.grantflow-projects` → pytanie) i zaloguje
czas, z automatycznym branchem w referencji.

---

## Zmapowane projekty (przykład — uzupełnij per maszyna)

| Repo | Projekt w grant-flow | UUID |
|------|---------------------|------|
| `grant-flow` | `fork()` | `0fbf13c5-282a-4f78-9ae2-25ea6d6cf79f` |
| `juz-ide-api-1` | `juz-ide-api` | `b528be5e-ef66-4ae5-beca-e71ac8d71dfd` |
