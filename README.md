# GEM Monitor · XTB

Narzędzie, które codziennie analizuje rynki według strategii **Global Equity Momentum (GEM)** i mówi, w który rynek inwestować, z dokładnym tickerem ETF-u dostępnego w **XTB**. Pokazuje też, dlaczego warto teraz wybrać ten instrument, i śledzi wiadomości polityczne, geopolityczne oraz wskaźniki ryzyka. Działa samo w chmurze (GitHub Actions). Wyniki widzisz w panelu na telefonie i dostajesz w powiadomieniach.

📄 **Dogłębna analiza strategii i wyniki historyczne: [ANALIZA_GEM.md](ANALIZA_GEM.md)**
🧾 **Strategia podatkowa dla polskiego rezydenta (IKE, IKZE, OKI, konto zwykłe, wybór brokera): [PODATKI_STRATEGIA.md](PODATKI_STRATEGIA.md)**
💳 **Dziennik finansowy offline (wydatki, kategorie, raporty, Apple Pay, wyciągi CSV): [FINANSE.md](FINANSE.md)**

> To nie jest porada inwestycyjna. Narzędzie mechanicznie realizuje opublikowaną strategię na Twoich ustawieniach. Decyzje i ich skutki podatkowe należą do Ciebie.

## Co dostajesz

Aplikacja ma trzy części (menu na dole ekranu): **GEM** – strategia i jej portfel, **Finanse** – Twoje pieniądze (konta, wydatki, inwestycje, PPE), **Rynki** – co się dzieje na świecie, wyszukiwarka instrumentów i podatki. Stronę, która otwiera się na starcie, wybierzesz w Ustawieniach (koło zębate) albo w Finansach (Więcej → Kopia → Aplikacja).

- **GEM → Sygnał:**
  - sygnał miesięczny pierwszego dnia sesyjnego miesiąca, np. „BEZ ZMIAN: trzymaj CSPX.UK” albo „ZMIANA: sprzedaj CSPX.UK, kup IUAA.UK”, z nazwą ETF-u, ISIN, giełdą, walutą i uzasadnieniem opartym na liczbach;
  - podgląd w trakcie miesiąca: ostrzeżenie, gdy wstępny sygnał zaczyna wskazywać inny rynek;
  - ranking rynków, historia sygnałów i wyniki strategii od 1991 r.;
  - waluta zakupu: na IKE/IKZE w XTB (rachunek tylko w PLN) i na koncie zwykłym (np. SXR8.DE w EUR zamiast CSPX.UK w USD, żeby uniknąć przewalutowania);
  - komentarz AI (opcjonalnie): Claude z wyszukiwaniem w sieci opisuje kontekst sygnału i ryzyka do obserwowania.
- **GEM → Mój portfel GEM:**
  - dziennik wpłat, zakupów, sprzedaży i wycen dla kont IKE, IKZE, OKI i zwykłego;
  - wycena w PLN po kursach NBP;
  - wykres zwrotu z dowolnym zakresem dat (przyciski, daty od–do albo przeciągnięcie palcem), porównanie z modelem GEM i S&P 500;
  - zysk do PIT-38 liczony według przepisów i podpowiedzi realizacji strat;
  - limity IKE i IKZE oraz eksport danych do pliku.
- **Rynki → Przegląd** – zob. [Przegląd rynku i notatka](#przegląd-rynku-i-notatka):
  - codzienna **notatka rynkowa**: co się dzieje na świecie, jak to zwykle wpływa na rynki, najbliższe dni i co z tego wynika dla inwestora długoterminowego (z reguł aplikacji, a z kluczem `ANTHROPIC_API_KEY` – pisana przez AI z wyszukiwaniem najnowszych wiadomości i scenariuszami);
  - **termometr nastroju** (defensywne – ostrożne – neutralne – sprzyjające) z wyjaśnieniem, które wskaźniki o nim decydują;
  - **rynki świata**: S&P 500, Nasdaq, Europa, Japonia, rynki wschodzące, WIG20, WIG, mWIG40, sWIG80, obligacje (USA i Polska), złoto, ropa, bitcoin, kursy złotego – zmiana dzienna, tygodniowa, miesięczna, od początku roku i trend;
  - **najbliższe wydarzenia**: decyzje Fed, EBC i RPP, dane z rynku pracy w USA, inflacja w Polsce, nowy sygnał GEM;
  - **statystyka**: co zwykle działo się z S&P 500 w kolejnym tygodniu, miesiącu i kwartale w podobnych warunkach od 1993 r.;
  - wskaźniki ryzyka (VIX, spready kredytowe, krzywa rentowności, niepewność polityczna, dolar, ropa, USD/PLN) i wiadomości z kilkunastu źródeł.
- **Rynki → Instrumenty:**
  - **biblioteka instrumentów XTB**: wyszukiwarka wszystkich ok. 9 000 akcji i ETF/ETN/ETC z oferty XTB (nazwa, symbol albo ISIN) z automatyczną wyceną – zob. [Biblioteka instrumentów XTB](#biblioteka-instrumentów-xtb);
  - **fundusze ING TFI** (PPE, PPK, IKE): porównanie wycen i stóp zwrotu w wybranej kategorii jednostek – zob. [Fundusze ING TFI (PPE)](#fundusze-ing-tfi-ppe).
- **Rynki → Podatki:**
  - plan wpłat (IKZE → IKE → OKI → konto zwykłe) ze zwrotem z IKZE;
  - porównanie kosztów brokerów;
  - kalendarz i przypomnienia;
  - monitor zmian w przepisach (wiadomości oraz comiesięczny raport AI).
- **Finanse (offline):**
  - dziennik wydatków i przychodów: konta, własne kategorie, budżety, reguły;
  - przegląd jak w aplikacji Money Manager: dzień, tydzień, miesiąc, rok albo dowolny okres, wykres kategorii;
  - kalendarz: wydatki dzień po dniu, jedno dotknięcie pokazuje operacje z danego dnia;
  - stałe przelewy i dochody (pensja, czynsz, subskrypcje), zapisywane automatycznie albo po zatwierdzeniu;
  - karty kredytowe: zadłużenie jako saldo ujemne, limit, termin i spłata z wybranego konta;
  - konta w złotych, euro, dolarach, funtach i frankach – przeliczane na złote po kursie średnim NBP;
  - konto inwestycyjne z aktywami: dowolny instrument z oferty XTB (wycena automatyczna, gdy jest darmowe źródło notowań), fundusz ING TFI z PPE (wycena jednostki z ING TFI) albo inne aktywo z wyceną ręczną;
  - przy każdym koncie inwestycyjnym i każdej pozycji: **ile zainwestowano, ile to jest warte i jaki jest zysk** (w złotych i procentach, z efektem kursu walut), a w podsumowaniu majątku – łączny zysk z inwestycji;
  - tabela porównania kategorii z poprzednim miesiącem: dotknięcie kwoty pokazuje dymek z wydatkami, z których się składa;
  - wykres majątku i dochodów miesiąc po miesiącu;
  - dokumenty offline (paski płacowe, paragony, umowy) przy operacjach i w osobnej zakładce;
  - usuwanie i zmiany zawsze z potwierdzeniem i przyciskiem „Cofnij”;
  - import z aplikacji Money Manager (plik .mmbackup) z łączeniem kont i kategorii, płatności Apple Pay przez Skróty (karta → konto, zapis dwuetapowy – płatność nie ginie, nawet gdy okno z kategoriami się nie pokaże) i wyciągi CSV z banku;
  - strona ma zablokowaną sieć, więc dane zostają na urządzeniu.
- **Bezpieczniki:**
  - bez kompletnych i aktualnych danych sygnał nie powstaje, a Ty dostajesz komunikat o problemie;
  - dwa niezależne źródła danych są ze sobą porównywane;
  - 99 testów automatycznych.

| Rola | ETF w XTB | Waluta |
|---|---|---|
| Akcje USA | **CSPX.UK** – iShares Core S&P 500 UCITS ETF (Acc) | USD |
| Akcje poza USA | **EXUS.DE** – Xtrackers MSCI World ex USA UCITS ETF 1C | EUR |
| Obligacje USA | **IUAA.UK** – iShares US Aggregate Bond UCITS ETF (Acc) | USD |
| Bony skarbowe USA | **IB01.UK** – iShares $ Treasury Bond 0-1yr UCITS ETF (Acc) | USD |
| Rynki wschodzące (wariant rozszerzony) | **EIMI.UK** – iShares Core MSCI EM IMI UCITS ETF (Acc) | USD |

## Wdrożenie krok po kroku (ok. 30 minut, bez programowania)

### Krok 1. Repozytorium na GitHubie

1. Załóż darmowe konto na [github.com](https://github.com), jeśli jeszcze go nie masz.
2. Kliknij **New repository**. Nazwa: np. `gem-monitor`, widoczność: **Public** (darmowy panel GitHub Pages wymaga repozytorium publicznego; zob. „Prywatność” niżej). Kliknij **Create repository**.
3. Wgraj pliki z tego folderu. Najprościej przez [GitHub Desktop](https://desktop.github.com): *File → Add local repository*, wskaż ten folder, a potem *Publish*. Możesz też przeciągnąć pliki na stronie repozytorium (*uploading an existing file*). **Nie wgrywaj pliku `.env`** (zawiera Twoje klucze) ani folderu `node_modules`. Upewnij się, że trafił tam folder `.github`.

### Krok 2. Klucz do danych rynkowych (darmowy)

- **Tiingo** (zalecane): załóż konto na [tiingo.com](https://www.tiingo.com), wejdź w *Account → API → Token* i skopiuj token.
- **Alpha Vantage** (opcjonalnie, jako drugie źródło do kontroli danych): pobierz klucz na [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key).

### Krok 3. Powiadomienia na telefon (wybierz jedno lub oba)

**A. ntfy (najprostsze, bez zakładania konta)**
1. Zainstaluj aplikację **ntfy** (Google Play / App Store).
2. Stuknij **+** → *Subscribe to topic* i wpisz długą, losową nazwę, np. `gem-xtb-7f3k9q2m1x`. Ta nazwa działa jak hasło: kto ją zna, ten czyta powiadomienia.

**B. Telegram**
1. W Telegramie napisz do **@BotFather** → `/newbot` → podaj nazwę. Dostaniesz **token** bota.
2. Napisz do swojego nowego bota `/start`.
3. Odczytaj **chat ID**. Otwórz w przeglądarce `https://api.telegram.org/bot<TOKEN>/getUpdates` i znajdź `"chat":{"id":123456789`. Możesz też uruchomić lokalnie `node src/cli.js telegram-chat-id`.

### Krok 4. Sekrety w GitHubie

W repozytorium otwórz **Settings → Secrets and variables → Actions → New repository secret** i dodaj:

| Nazwa | Wartość | Wymagane |
|---|---|---|
| `TIINGO_API_KEY` | token z Tiingo | tak (albo `ALPHAVANTAGE_API_KEY`) |
| `ALPHAVANTAGE_API_KEY` | klucz Alpha Vantage | nie, ale zalecane do kontroli danych |
| `NTFY_TOPIC` | nazwa tematu z kroku 3A | jeden z kanałów |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | z kroku 3B | jeden z kanałów |
| `ANTHROPIC_API_KEY` | klucz z [console.anthropic.com](https://console.anthropic.com) | nie – tylko dla notatki rynkowej AI i komentarza AI |

### Krok 5. Panel WWW (GitHub Pages)

**Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main`, folder: `/docs` → Save.**
Panel będzie pod adresem `https://<twój-login>.github.io/gem-monitor/`.

### Krok 6. Pierwsze uruchomienie

Otwórz **Actions → GEM Monitor → Run workflow**. Po 1–2 minutach dostaniesz powiadomienie z aktualnym sygnałem, a panel się zaktualizuje. Od tej pory narzędzie uruchamia się samo w dni robocze o 06:15 UTC (7:15 zimą, 8:15 latem).

Jeśli krok „Zapis panelu” zgłasza błąd uprawnień: **Settings → Actions → General → Workflow permissions → Read and write permissions → Save**.

### Krok 7. Ikona na telefonie

Otwórz adres panelu w telefonie:
- **iPhone (Safari):** *Udostępnij → Do ekranu początkowego*.
- **Android (Chrome):** *⋮ → Dodaj do ekranu głównego*.

Panel otwiera się wtedy jak aplikacja.

### Krok 8 (opcjonalnie). Ten sam portfel na telefonie i komputerze

Dziennik transakcji zapisuje się w przeglądarce, w której go prowadzisz. Aby mieć te same dane na kilku urządzeniach, możesz je synchronizować przez **prywatne** repozytorium GitHub:

1. Utwórz nowe repozytorium, np. `gem-dane`, i ustaw je jako **Private**. Repozytorium z aplikacją jest publiczne, więc danych o portfelu nie trzymaj w nim.
2. Utwórz token: *Settings (profil) → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token*.
   - Repository access: *Only select repositories → gem-dane*.
   - Permissions: *Contents → Read and write*.
3. W aplikacji stuknij ⚙️ → *Synchronizacja między urządzeniami*. Wpisz `login/gem-dane` i token, a potem zapisz. Zrób to samo na drugim urządzeniu.

Token zostaje tylko w przeglądarce i daje dostęp wyłącznie do tego jednego repozytorium. Bez synchronizacji rób czasem kopię: *GEM → Mój portfel GEM → Twoje dane → Eksportuj kopię*.

## Jak czytać powiadomienia

| Wiadomość | Kiedy | Co zrobić |
|---|---|---|
| 📊 **Sygnał na [miesiąc]** | pierwszy dzień sesyjny miesiąca, rano | **Jedyna wiadomość, na podstawie której działasz.** „BEZ ZMIAN”: nic nie robisz. „ZMIANA”: sprzedajesz stary ETF i kupujesz nowy na pierwszej sesji miesiąca. |
| ⚠️ **Zmienił się wstępny sygnał** | w trakcie miesiąca | Nic. To uprzedzenie, że na koniec miesiąca sygnał może się zmienić. |
| 🗞️ **Podsumowanie tygodnia** | poniedziałek | Przegląd ryzyka i wiadomości. |
| ❗ **Problem z danymi** | gdy dane są niepełne lub nieaktualne | Nie podejmuj decyzji, dopóki nie przyjdzie poprawny sygnał. |
| 🗓️ **Przypomnienie** | terminy podatkowe (limity IKE/IKZE, PIT-38, realizacja strat) | Zajrzyj do zakładki Rynki → Podatki. |
| 📜 **Zmiany dla inwestorów** | ważne wiadomości o IKE, IKZE, OKI, podatku Belki | Sprawdź, czy dotyczą Twoich kont. |

## Konfiguracja

Wszystkie ustawienia są w [config/gem.config.js](config/gem.config.js), z opisem każdej opcji. Najważniejsze:

| Opcja | Domyślnie | Opis |
|---|---|---|
| `variant` | `klasyczny` | `klasyczny` (USA kontra reszta świata, jak w oryginale) albo `rozszerzony` (USA, rynki rozwinięte, rynki wschodzące) |
| `safeAssetRule` | `obligacje` | `lepsze_z_obligacji_i_bonow` chroni przed scenariuszem z 2022 r., gdy obligacje traciły |
| `switchBufferPct` | `0` | np. `2` ogranicza częste zmiany (warto rozważyć na IKE, gdzie każda zmiana kosztuje ok. 1% na przewalutowaniu) |
| `assets.*.xtb` | ETF-y z tabeli wyżej | tu zmienisz instrument, jeśli XTB zmieni ofertę |

Zanim cokolwiek zmienisz, przeczytaj [ANALIZA_GEM.md](ANALIZA_GEM.md), rozdz. 8.

Parametry podatkowe (limity, OKI, opłaty brokerów, kalendarz) są w [config/podatki.js](config/podatki.js). Każdy ma źródło i status („oficjalne”, „prognoza”, „do weryfikacji”). Narzędzie ostrzeże Cię, gdy raport AI wykryje rozbieżność z aktualnymi przepisami, ale wartości zmieniasz sam.

## Biblioteka instrumentów XTB

Katalog [config/xtb-instrumenty.json](config/xtb-instrumenty.json) zawiera wszystkie akcje oraz ETF-y, ETN i ETC z oferty XTB (ok. 7 000 akcji i 2 000 funduszy z 18 giełd), przepisane z oficjalnej tabeli specyfikacji instrumentów XTB. Wyszukasz je w zakładce **Rynki → Instrumenty**, w oknie transakcji portfela GEM oraz w Finansach (konto inwestycyjne → **Aktywa** → **+ Instrument z XTB**) – po nazwie, symbolu albo ISIN.

Skąd aplikacja bierze ceny (aktualizacja w każdy dzień roboczy razem z sygnałem):

| Instrumenty | Źródło ceny | Dokładność |
|---|---|---|
| ETF-y strategii GEM (CSPX.UK, EXUS.DE, IUAA.UK, IB01.UK, EIMI.UK…) | indeks-proxy i notowania z Alpha Vantage | jak dotąd |
| Akcje, ETF-y, ETC i ETN z GPW (ok. 420) i NewConnect (ok. 290) | oficjalne archiwum notowań GPW i tabela notowań NewConnect | kurs zamknięcia z ostatniej sesji |
| ETF-y UCITS na popularne indeksy (ok. 450, np. VWCE, IWDA, SXR8, VUAA, CNDX, złoto, obligacje USA) | zmiana amerykańskiego ETF-u na ten sam indeks (Tiingo), przeliczona na walutę funduszu | przybliżona (oznaczona „≈”) – od Twojej ceny zakupu według zmiany indeksu |
| Akcje i ETF-y z USA | Tiingo – po dopisaniu symbolu do [config/obserwowane.txt](config/obserwowane.txt) (do 20 symboli) | kurs zamknięcia |
| Pozostałe (np. akcje z Frankfurtu, Paryża, Londynu) | brak darmowego źródła | wycena ręczna |

- **Lista obserwowanych** to zwykły plik tekstowy: jeden symbol XTB w wierszu (np. `AAPL.US`). Edytujesz go na GitHubie (link w karcie Instrumenty XTB), a ceny pojawiają się od następnej aktualizacji. Plik jest publiczny jak całe repozytorium – widać w nim tylko symbole, nigdy ilości ani kwoty.
- **Odświeżenie katalogu**, gdy XTB opublikuje nową tabelę (kilka razy w roku): pobierz PDF ze strony XTB i uruchom `node tools/xtb-katalog.mjs <plik.pdf> <data obowiązywania>` (instrukcja w nagłówku pliku). Codzienna aktualizacja nie potrzebuje do tego żadnych dodatkowych pakietów.
- Strona Finanse wczytuje ceny z pliku aplikacji `data/notowania.js` (to zwykłe pobranie pliku z tej samej strony), więc blokada sieci i prywatność dziennika zostają bez zmian.

## Fundusze ING TFI (PPE)

Pracownicze programy emerytalne w ING prowadzi **ING TFI** (dawniej NN Investment Partners i Goldman Sachs TFI). W PPE dostępnych jest 29 funduszy (akcji, mieszanych, obligacji, cyklu życia „Perspektywa” i innych) w kategoriach jednostek dla PPE: **E, F, S, T albo W** – kategorię wyznacza umowa Twojego pracodawcy i widać ją w serwisie ING TFI24 przy nazwie funduszu. Każda kategoria ma inną cenę jednostki (inne opłaty), dlatego aplikacja zapisuje wszystkie.

- **Skąd dane:** codziennie (w dni robocze) aplikacja odwiedza publiczną stronę notowań [ingtfi.pl/notowania-funduszy](https://www.ingtfi.pl/notowania-funduszy) – tak jak przeglądarka – i pobiera z niej wyceny wszystkich funduszy (46) we wszystkich kategoriach. Za pierwszym razem uzupełnia historię z końców miesięcy z ostatnich 3 lat. Wynik trafia do pliku `data/fundusze.js`. Jeśli ING TFI zmieni zasady strony, aplikacja zostawi ostatnie wyceny i pokaże ostrzeżenie w logu Actions.
- **Śledzenie zysku z PPE:** Finanse → konto inwestycyjne (np. „PPE ING”) → **Aktywa** → **+ Fundusz ING TFI (PPE)** → wybierz fundusz i kategorię, wpisz **liczbę jednostek** i **sumę wpłat** (obie liczby są w ING TFI24). Aplikacja pokaże wartość według najnowszej wyceny jednostki i zysk w złotych i procentach.
- **Porównanie funduszy:** Rynki → Instrumenty → **Fundusze ING TFI** – wycena jednostki i stopy zwrotu (miesiąc, 12 miesięcy, od początku roku, 5 lat) w wybranej kategorii.

## Przegląd rynku i notatka

Zakładka **Rynki → Przegląd** zbiera dane ze świata w każdy dzień roboczy (przed otwarciem giełd w Europie):

| Co | Źródło |
|---|---|
| S&P 500, Nasdaq, rentowności obligacji USA (2 i 10 lat), ropa Brent, EUR/USD | FRED (Bank Rezerwy Federalnej w St. Louis) |
| Europa, Japonia, rynki wschodzące, akcje świata, małe spółki USA, obligacje USA 20+, złoto, bitcoin | ETF-y z USA (Tiingo – ten sam klucz co dla GEM) |
| WIG20, WIG, mWIG40, sWIG80, indeks obligacji skarbowych TBSP | archiwum notowań GPW |
| EUR/PLN, USD/PLN | NBP |
| Wiadomości | kanały RSS: BBC, CNBC, MarketWatch, Al Jazeera, Fed, EBC, Bankier.pl, Parkiet, Puls Biznesu, Google News |
| Decyzje banków centralnych | [config/kalendarz.js](config/kalendarz.js) – terminy Fed, EBC i RPP z oficjalnych terminarzy (uzupełnij kolejny rok, gdy banki je opublikują; aplikacja przypomni) |

Z tych danych powstają:
- **Notatka rynkowa** – podsumowanie tygodnia, najważniejsze tematy z wiadomości z wyjaśnieniem, jak zwykle wpływają na rynki, największe zmiany, najbliższe wydarzenia i wnioski: co mówi sygnał GEM, czy utrzymać regularne wpłaty, kiedy rozłożyć większą kwotę na raty, rola poduszki finansowej.
- **Termometr nastroju** – suma punktów za: trend S&P 500 (średnia 200 sesji), szerokość rynku (ile rynków akcji jest w trendzie wzrostowym), obsunięcie od szczytu, VIX, stres kredytowy, niepewność polityczną, krzywą rentowności i sygnał GEM. Wynik: defensywne, ostrożne, neutralne albo sprzyjające.
- **Co zwykle działo się dalej** – statystyka S&P 500 od 1993 r.: w podobnych warunkach (trend i zmienność jak dziś) jak często indeks rósł w ciągu tygodnia, miesiąca i 3 miesięcy, mediana i typowy zakres. To uczciwsza „prognoza” niż zgadywanie kursu: pokazuje szanse i rozrzut, a nie jedną liczbę.

Nikt nie przewiduje rynku w krótkim terminie. Notatka i statystyka to kontekst edukacyjny, a nie rekomendacja inwestycyjna – decyzje w portfelu GEM nadal podejmuje sygnał na koniec miesiąca.

### Notatka rynkowa AI

Bez klucza notatka powstaje z reguł aplikacji (liczby i tematy wiadomości). Gdy dodasz sekret `ANTHROPIC_API_KEY` (krok 4), codziennie rano model Claude (`claude-sonnet-5-5`) dostaje te same dane, sprawdza w wyszukiwarce najnowsze wydarzenia i kalendarz na 7 dni i pisze notatkę po polsku: **W skrócie**, **Co się dzieje na świecie**, **Wpływ na rynki** (USA, Europa i rynki wschodzące, Polska i złoty, obligacje, surowce), **Najbliższe dni** (wydarzenia z datami i trzy scenariusze – bazowy, pozytywny, negatywny – z orientacyjnym prawdopodobieństwem) i **Co z tym zrobić** (ogólnie, bez osobistych rekomendacji). Źródła są pod notatką.

- Klucz założysz na [console.anthropic.com](https://console.anthropic.com) → API Keys (potrzebne doładowanie konta, np. 10 USD). W konsoli ustaw też miesięczny limit wydatków.
- Koszt: orientacyjnie 3–5 USD miesięcznie za notatkę (22 dni robocze, do 4 wyszukiwań dziennie) plus 1–2 USD za komentarz do sygnału GEM.
- Model, poziom wysiłku i liczbę wyszukiwań zmienisz w [config/gem.config.js](config/gem.config.js) (`ai.marketNote`); `enabled: false` wyłącza notatkę AI.

## Komentarz AI do sygnału (opcjonalnie)

Gdy dodasz `ANTHROPIC_API_KEY`, przy sygnale miesięcznym i raz w tygodniu model Claude (`claude-opus-5-5`) przeszuka sieć i napisze krótki komentarz po polsku (zakładka GEM → Sygnał):
- dlaczego teraz ten rynek;
- kontekst polityczny i geopolityczny;
- ryzyka do obserwowania.

Model ma polecenie nie zmieniać sygnału. Szacunkowy koszt to ok. 1–2 USD miesięcznie. Limit wydatków ustawisz w konsoli Anthropic. Bez klucza panel nadal zawiera uzasadnienie liczbowe, wskaźniki ryzyka i wiadomości.

## Uruchomienie na komputerze (opcjonalnie)

Wymaga Node.js w wersji 20 lub nowszej.

```bash
npm test
```

```bash
node src/cli.js demo
```

```bash
node scripts/serve.js
```

- `npm test` uruchamia 99 testów.
- `node src/cli.js demo` buduje aplikację demonstracyjną bez kluczy API. Sygnał pochodzi z danych historycznych, a w zakładce GEM → Mój portfel GEM możesz wczytać przykładowe transakcje.
- `node scripts/serve.js` udostępnia panel pod adresem http://localhost:8080.

Z kluczami: skopiuj `.env.example` jako `.env`, uzupełnij i uruchom `node src/cli.js run --dry` (bez wysyłania powiadomień) albo `npm run research` (backtest od 1991 r.).

## Struktura

```
config/gem.config.js      ustawienia strategii, mapowanie ETF-ów XTB, instrumenty portfela
config/podatki.js         limity IKE/IKZE, OKI, brokerzy, kalendarz (ze źródłami)
config/kalendarz.js       terminy decyzji Fed, EBC i RPP (przegląd rynku)
src/strategy.js           reguły GEM (czyste funkcje)
src/engine.js             sygnał miesięczny, podgląd, historia
src/data.js, providers/   dane: Tiingo, Alpha Vantage, FRED, Ken French
src/validate.js           kontrola jakości danych i porównanie źródeł
src/explain.js            uzasadnienie po polsku
src/macro.js, news.js     wskaźniki ryzyka i wiadomości
src/markets.js            przegląd rynku: rynki świata i GPW, termometr, statystyka, kalendarz, notatka
src/funds.js              fundusze ING TFI (PPE): wyceny jednostek wszystkich kategorii
src/prices.js             kursy NBP i historia cen do wyceny portfela
src/instruments.js        biblioteka instrumentów XTB: katalog, kursy GPW/NewConnect, Tiingo, wycena przez indeks
src/xls.js                czytnik plików Excel (.xls) z archiwum notowań GPW, bez zależności
src/client/instruments.js wyszukiwarka instrumentów, fundusze ING TFI i wycena w przeglądarce
config/xtb-instrumenty.json  katalog akcji i ETF-ów z oferty XTB (z tabeli specyfikacji XTB)
config/obserwowane.txt    obserwowane instrumenty z USA (ceny z Tiingo)
tools/xtb-katalog.mjs     odświeżenie katalogu z nowej tabeli XTB (PDF)
src/taxmonitor.js         monitor przepisów, przypomnienia, raport podatkowy AI
src/ai.js                 notatka rynkowa i komentarz AI (opcjonalne)
src/notify.js             Telegram i ntfy
src/dashboard.js          aplikacja WWW (docs/) – GEM (Sygnał, Mój portfel GEM), Finanse, Rynki (Przegląd, Instrumenty, Podatki)
src/client/core.js        obliczenia portfela i podatków (przeglądarka + testy)
src/client/ui.js          interfejs: dziennik, wykres, kalkulatory, synchronizacja
src/client/finance-*.js   dziennik finansowy offline (obliczenia, import, raporty, interfejs)
src/client/mmbackup.js    odczyt kopii .mmbackup z aplikacji Money Manager (ZIP + SQLite, bez sieci)
src/financePage.js        strona finanse.html (blokada sieci) i service worker (praca offline)
src/backtest.js, research.js  backtest od 1991 r. i scenariusze podatkowe (research/)
.github/workflows/gem.yml harmonogram w GitHub Actions
test/                     testy automatyczne
```

## Prywatność i ograniczenia

- **Klucze API** są bezpieczne w *Secrets* i nie trafiają do repozytorium ani na panel.
- **Panel i historia sygnałów** w publicznym repozytorium są widoczne dla każdego, kto zna adres. Strona nie jest indeksowana przez wyszukiwarki. Jeśli wolisz pełną prywatność, ustaw repozytorium jako prywatne i korzystaj tylko z powiadomień (GitHub Pages dla repozytoriów prywatnych wymaga płatnego planu).
- GitHub może opóźnić zaplanowane uruchomienie o kilkanaście minut. Gdy przez 60 dni w repozytorium nie ma aktywności, GitHub wyłącza harmonogram. Narzędzie codziennie zapisuje panel, więc aktywność jest, ale jeśli harmonogram się wyłączy, włączysz go w zakładce *Actions*.
- Przed transakcją upewnij się, że ticker jest nadal w ofercie XTB. Instrumenty sprawdzono 2 listopada 2026 r.
