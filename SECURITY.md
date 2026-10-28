# Polityka bezpieczeństwa

## Co to za repozytorium

claude-patterns to zestaw narzędzi deweloperskich uruchamianych **lokalnie** na maszynie dewelopera: wzorce,
agenci, skille, hooki Claude Code, skrypty `scripts/`, a obok nich daemon `mcp-server/knowledge-retriever`
(wyszukiwanie wzorców w Qdrant). Nie jest usługą wystawioną do internetu i nie przetwarza danych użytkowników końcowych.

## Zgłaszanie podatności

Nie zakładaj publicznego issue ani pull requesta z opisem luki. Zgłoszenie przekaż **właścicielowi repozytorium**
(kanał prywatny: wiadomość bezpośrednia albo prywatny wątek). Podaj:

- co jest podatne (ścieżka pliku, komponent, wersja z `METADATA.yml`),
- kroki odtworzenia i skutek (co atakujący zyskuje),
- wersje i środowisko, na którym to sprawdzono.

Potwierdzenie przyjęcia zgłoszenia i ocena powagi następują w rozsądnym terminie, bez gwarantowanego czasu reakcji. Poprawkę
publikujemy z wpisem w `CHANGELOG.md`, bez wskazywania zgłaszającego, jeśli o to poprosi.

## Zakres

W zakresie:

- **Hooki i skrypty** (`hooks/`, `scripts/`): wstrzyknięcie komendy, ucieczka ze ścieżki (path traversal), zapis poza
  zamierzonym katalogiem, nieświadome ujawnienie sekretów (np. do logów i telemetrii), hooki mogące wykonać obcy kod.
- **Vendorowane toolkity** (`skills/marketing`, `skills/finance`, `skills/legal`, `tools/marketing`, `tests/finance-evals`):
  skrypty i narzędzia CLI z kodem wykonywalnym. Błędy w treści merytorycznej skilla to nie podatność. Luki w kodzie
  upstreamu zgłoś także jego autorom; tutaj zajmujemy się wersją przypiętą w repozytorium.
- **mcp-server/knowledge-retriever**: endpointy HTTP (`:6403`), `POST /reindex-file`, obsługa ścieżek z mountu
  `/opt/projects`, połączenie z Qdrant (`127.0.0.1:6401`/`:6402`) i z embedderem.
- **Łańcuch dostaw**: zależności z `package-lock.json` (korzeń i `mcp-server/knowledge-retriever`), przypięte obrazy
  Docker. Skan: `scripts/cron/osv-scan.sh`.
- **Agenci i komendy**: instrukcje, które przy zwykłym użyciu każą agentowi ominąć zabezpieczenia (np. wypisać sekrety,
  wykonać polecenie z niezaufanego źródła).

## Poza zakresem (to nie jest podatność)

- Atak wymagający wcześniejszego dostępu do konta użytkownika, do jego `~/.claude/` albo do zapisu w repozytorium:
  repo i hooki z założenia działają z uprawnieniami użytkownika.
- Daemon i Qdrant wystawione na sieć wbrew konfiguracji: porty Qdrant są w `docker-compose.yml` związane z `127.0.0.1`,
  a daemon `:6403` jest przeznaczony dla zaufanej sieci lokalnej.
- Treść wzorców, reguł i skilli (merytoryczne błędy, nieaktualne rady, styl): zgłaszaj zwykłym issue lub poprawką.
- Skutki użycia `--no-verify` lub wyłączenia bramek pre-commit przez użytkownika.
- Podatności w zależnościach, które nie są osiągalne z naszego kodu, i wyjątki świadomie wpisane do
  `.osv-scanner.toml` (z uzasadnieniem i datą wygaśnięcia).
- Wyniki zautomatyzowanych skanerów bez opisu wykorzystania.

## Wspierane wersje

Poprawki trafiają do bieżącej wersji z `METADATA.yml` (gałąź `main`). Starsze wydania nie dostają łatek.
