# POST-GUIDE — przewodnik po wpisach (szablon, ADR 0013)

> Ogólny punkt startu dla NOWEGO bloga. Skopiuj do `docs/POST-GUIDE.md` w repo bloga, wypełnij
> i wskaż w `blog-seed.config.yml` (`post_guide: docs/POST-GUIDE.md`). Treść specyficzna dla
> bloga (marka, czytelnik, zakazy) żyje TYLKO w repo bloga, nigdy w claude-patterns.
> Ten plik czyta model piszący szkic z zalążka (`status: picked`).

## 1. Czytelnik i rola bloga

- Dla kogo jest ten blog (jeden konkretny czytelnik, nie „wszyscy").
- Rola: `personal` (droga autora — wpis ma sens dla kogoś, kto nigdy nie użyje produktu)
  albo `product` (jak działa produkt, zmiany, poradniki).

## 2. Filary i proporcje

| Filar (`pillar`) | Udział docelowy | Czym jest tutaj |
|---|---|---|
| decisions | …% | |
| mistakes | …% | |
| people | …% | |
| numbers | …% | |
| journey | …% | |

## 3. Formaty

| `format` | Wymagany dowód | Długość |
|---|---|---|
| decision | ADR/decyzja, odrzucone alternatywy, niewiadoma w chwili decyzji | 600–1200 |
| post-mortem | oś czasu, liczby, co zmieniono po fakcie | 600–1500 |
| conversation | zgoda rozmówcy, cytaty za zgodą | 800–1500 |
| interactive | działający komponent, dane ilustracyjne oznaczone | — |
| note | jeden konkret, jeden wniosek | 150–400 |
| numbers | te same pola co miesiąc, źródło każdej liczby | 400–800 |

## 4. Kontrakt z zalążkiem (obowiązuje piszącego)

1. Twierdzisz tylko to, co w zalążku jest `[FAKT]`. Luki z „Czego nie wiem" zostawiasz jawne
   albo pytasz autora — nie wypełniasz ich z pamięci.
2. `[HIPOTEZA]` oznaczasz jako hipotezę; `[WNIOSEK]` (z odpowiedzi autora) potwierdzasz z autorem
   przed użyciem w 1. osobie.
3. „NIE UŻYWAĆ" z „Proponowanego kształtu" to twardy zakaz.
4. Kształt dobierasz do `format`/`length`/`pillar` — bez obowiązkowych sekcji i morału na końcu.
5. Szkic: `draft: true` (nigdy `false`), w zalążku `status: drafted` + `draft_path`. Bez commita.

## 5. Głos

- Zaczynaj od sceny lub faktu, nie od definicji. Konkret: liczba, godzina, nazwa.
- Liczba ma pochodzenie (zmierzone / oszacowane / zewnętrzne). Jeden wniosek na wpis.
- 1. osoba, czas przeszły. Spokojnie, rzeczowo, z dystansem do siebie.
- Zużyte zwroty (do uzupełnienia przez blog): „To nie X, tylko Y", obowiązkowe „Podsumowanie",
  „W tym wpisie opowiem…", retoryczne pytania w nagłówkach, listy po trzy dla symetrii.

## 6. Czego nigdy nie publikujemy

Kategorie (konkretna lista: deny-lista bloga, `stage/deny-list.yml`):
nazwy kodowe repo, ścieżki, hashe, ID zadań, nazwy tabel/kolejek, adresy wewnętrzne, sekrety,
dane osobowe; szczegóły mechanizmów zabezpieczeń; osoby trzecie bez zgody.

## 7. Bramka przed publikacją

Pięć pytań: co czytelnik zyska? jaki jest dowód? czego nie wiem? czy wpis mógłby stać na cudzym
blogu? czy naprawdę tak było? Odpowiedź „nic" na pierwsze lub drugie = do notatek, nie na blog.
Test głosu: pierwszy akapit przeczytany na głos.
