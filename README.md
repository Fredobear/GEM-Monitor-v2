# GEM Monitor · XTB

Narzędzie, które codziennie analizuje rynki według strategii **Global Equity Momentum (GEM)** i mówi, w który rynek inwestować, z dokładnym tickerem ETF-u dostępnego w **XTB**. Pokazuje też, dlaczego warto teraz wybrać ten instrument, i śledzi wiadomości polityczne, geopolityczne oraz wskaźniki ryzyka. Działa samo w chmurze (GitHub Actions). Wyniki widzisz w panelu na telefonie i dostajesz w powiadomieniach.

📄 **Dogłębna analiza strategii i wyniki historyczne: [ANALIZA_GEM.md](ANALIZA_GEM.md)**
🧾 **Strategia podatkowa dla polskiego rezydenta (IKE, IKZE, OKI, konto zwykłe, wybór brokera): [PODATKI_STRATEGIA.md](PODATKI_STRATEGIA.md)**
💳 **Dziennik finansowy offline (wydatki, kategorie, raporty, Apple Pay, wyciągi CSV): [FINANSE.md](FINANSE.md)**

> To nie jest porada inwestycyjna. Narzędzie mechanicznie realizuje opublikowaną strategię na Twoich ustawieniach. Decyzje i ich skutki podatkowe należą do Ciebie.

## Co dostajesz

- **Sygnał miesięczny:** pierwszego dnia sesyjnego miesiąca rano, np. „BEZ ZMIAN: trzymaj CSPX.UK” albo „ZMIANA: sprzedaj CSPX.UK, kup IUAA.UK”. Do tego nazwa ETF-u, ISIN, giełda, waluta i uzasadnienie oparte na liczbach.
- **Podgląd w trakcie miesiąca:** ostrzeżenie, gdy wstępny sygnał zaczyna wskazywać inny rynek, żeby nic Cię nie zaskoczyło.
- **Panel na telefonie:**
  - sygnał i jego stabilność;
  - ranking rynków;
  - historia sygnałów;
  - wskaźniki ryzyka (VIX, spready kredytowe, krzywa rentowności, niepewność polityczna, dolar, ropa, USD/PLN);
  - wiadomości polityczne i geopolityczne;
  - wyniki strategii od 1991 r.
- **Komentarz AI (opcjonalnie):** Claude z wyszukiwaniem w sieci opisuje kontekst polityczny i geopolityczny sygnału oraz ryzyka do obserwowania.
- **Portfel:**
  - dziennik wpłat, zakupów, sprzedaży i wycen dla kont IKE, IKZE, OKI i zwykłego;
  - wycena w PLN po kursach NBP;
  - wykres zwrotu z dowolnym zakresem dat (przyciski, daty od–do albo przeciągnięcie palcem), porównanie z modelem GEM i S&P 500;
  - zysk do PIT-38 liczony według przepisów i podpowiedzi realizacji strat;
  - limity IKE i IKZE oraz eksport danych do pliku.
- **Podatki:**
  - plan wpłat (IKZE → IKE → OKI → konto zwykłe) ze zwrotem z IKZE;
  - porównanie kosztów brokerów;
  - kalendarz i przypomnienia;
  - monitor zmian w przepisach (wiadomości oraz comiesięczny raport AI).
- **Waluta zakupu:** przy każdym sygnale aplikacja podpowiada, w jakiej walucie kupić ETF:
  - na IKE/IKZE w XTB (rachunek tylko w PLN);
  - na koncie zwykłym, zależnie od tego, jaką walutę masz po sprzedaży, np. SXR8.DE w EUR zamiast CSPX.UK w USD, żeby uniknąć przewalutowania.
- **Finanse (offline):**
  - dziennik wydatków i przychodów: konta, własne kategorie, budżety, reguły;
  - przegląd jak w aplikacji Money Manager: dzień, tydzień, miesiąc, rok albo dowolny okres, wykres kategorii;
  - kalendarz: wydatki dzień po dniu, jedno dotknięcie pokazuje operacje z danego dnia;
  - stałe przelewy i dochody (pensja, czynsz, subskrypcje), zapisywane automatycznie albo po zatwierdzeniu;
  - karty kredytowe: zadłużenie jako saldo ujemne, limit, termin i spłata z wybranego konta;
  - konta w złotych, euro, dolarach, funtach i frankach – przeliczane na złote po kursie średnim NBP;
  - konto inwestycyjne z aktywami (ETF-y z listy GEM wyceniane co dzień roboczy, inne aktywa z wyceną ręczną);
  - wykres majątku i dochodów miesiąc po miesiącu;
  - dokumenty offline (paski płacowe, paragony, umowy) przy operacjach i w osobnej zakładce;
  - usuwanie i zmiany zawsze z potwierdzeniem i przyciskiem „Cofnij”;
  - import z aplikacji Money Manager (plik .mmbackup) z łączeniem kont i kategorii, płatności Apple Pay przez Skróty (karta → konto) i wyciągi CSV z banku;
  - strona ma zablokowaną sieć, więc dane zostają na urządzeniu.
- **Bezpieczniki:**
  - bez kompletnych i aktualnych danych sygnał nie powstaje, a Ty dostajesz komunikat o problemie;
  - dwa niezależne źródła danych są ze sobą porównywane;
  - 75 testów automatycznych.

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
| `ANTHROPIC_API_KEY` | klucz z [console.anthropic.com](https://console.anthropic.com) | nie, tylko dla komentarza AI |

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

Token zostaje tylko w przeglądarce i daje dostęp wyłącznie do tego jednego repozytorium. Bez synchronizacji rób czasem kopię: *Portfel → Twoje dane → Eksportuj kopię*.

## Jak czytać powiadomienia

| Wiadomość | Kiedy | Co zrobić |
|---|---|---|
| 📊 **Sygnał na [miesiąc]** | pierwszy dzień sesyjny miesiąca, rano | **Jedyna wiadomość, na podstawie której działasz.** „BEZ ZMIAN”: nic nie robisz. „ZMIANA”: sprzedajesz stary ETF i kupujesz nowy na pierwszej sesji miesiąca. |
| ⚠️ **Zmienił się wstępny sygnał** | w trakcie miesiąca | Nic. To uprzedzenie, że na koniec miesiąca sygnał może się zmienić. |
| 🗞️ **Podsumowanie tygodnia** | poniedziałek | Przegląd ryzyka i wiadomości. |
| ❗ **Problem z danymi** | gdy dane są niepełne lub nieaktualne | Nie podejmuj decyzji, dopóki nie przyjdzie poprawny sygnał. |
| 🗓️ **Przypomnienie** | terminy podatkowe (limity IKE/IKZE, PIT-38, realizacja strat) | Zajrzyj do zakładki Podatki. |
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

## Komentarz AI (opcjonalnie)

Gdy dodasz `ANTHROPIC_API_KEY`, przy sygnale miesięcznym i raz w tygodniu model Claude (`claude-opus-5-5`) przeszuka sieć i napisze krótki komentarz po polsku:
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

- `npm test` uruchamia 75 testów.
- `node src/cli.js demo` buduje aplikację demonstracyjną bez kluczy API. Sygnał pochodzi z danych historycznych, a w zakładce Portfel możesz wczytać przykładowe transakcje.
- `node scripts/serve.js` udostępnia panel pod adresem http://localhost:8080.

Z kluczami: skopiuj `.env.example` jako `.env`, uzupełnij i uruchom `node src/cli.js run --dry` (bez wysyłania powiadomień) albo `npm run research` (backtest od 1991 r.).

## Struktura

```
config/gem.config.js      ustawienia strategii, mapowanie ETF-ów XTB, instrumenty portfela
config/podatki.js         limity IKE/IKZE, OKI, brokerzy, kalendarz (ze źródłami)
src/strategy.js           reguły GEM (czyste funkcje)
src/engine.js             sygnał miesięczny, podgląd, historia
src/data.js, providers/   dane: Tiingo, Alpha Vantage, FRED, Ken French
src/validate.js           kontrola jakości danych i porównanie źródeł
src/explain.js            uzasadnienie po polsku
src/macro.js, news.js     wskaźniki ryzyka i wiadomości
src/prices.js             kursy NBP i historia cen do wyceny portfela
src/taxmonitor.js         monitor przepisów, przypomnienia, raport podatkowy AI
src/ai.js                 komentarz AI (opcjonalny)
src/notify.js             Telegram i ntfy
src/dashboard.js          aplikacja WWW (docs/) – zakładki Sygnał, Portfel, Podatki, Rynki
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
