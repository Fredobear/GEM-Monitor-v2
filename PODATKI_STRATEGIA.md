# Strategia podatkowa GEM dla polskiego rezydenta podatkowego

Stan prawny i rynkowy: listopad 2026. Parametry używane przez aplikację są w [config/podatki.js](config/podatki.js), każdy ze źródłem i datą weryfikacji. Narzędzie co dzień śledzi wiadomości o zmianach, a raz w miesiącu (z kluczem AI) sprawdza, czy parametry są aktualne.

> **Zastrzeżenie.** To opis przepisów i ich skutków dla strategii GEM, a nie porada podatkowa ani inwestycyjna. W nietypowej sytuacji (np. działalność gospodarcza, dochody zagraniczne, rezydencja w dwóch krajach) skonsultuj się z doradcą podatkowym.

---

## 0. Najważniejsze wnioski

1. **Podatek Belki zjada przewagę GEM.** Strategia zmienia pozycję średnio 1,4 razy w roku. Na koncie zwykłym każda zmiana oznacza 19% podatku od zysku. W backteście 1991–2026 obniża to wynik z 11,7% do 8,3–9,4% rocznie, czyli poniżej strategii „kup i trzymaj” po podatku (10,4%).
2. **Kolejność kont:** IKZE → IKE → OKI (od 2027 r.) → konto zwykłe. W 2026 r. z ulgą możesz zainwestować 39 564 zł (IKE 28 260 zł + IKZE 11 304 zł). Prowadzący firmę mogą zainwestować 45 216 zł. Małżonkowie mają limity osobno, więc razem dwa razy więcej.
3. **Wybór brokera ma znaczenie na IKE/IKZE.** IKE i IKZE w XTB działają tylko w złotówkach, więc każda zmiana pozycji to dwa przewalutowania po 0,5%, czyli ok. 1,4% wartości rocznie. Broker z tańszym przewalutowaniem albo subkontem USD na IKE dawał w backteście od 0,6 do 1,1 punktu procentowego rocznie więcej (szczegóły w rozdz. 4, stawki do weryfikacji).
4. **IKZE to natychmiastowy zwrot podatku:** przy progu 32% to 3 617 zł rocznie, przy podatku liniowym 2 148 zł, przy progu 12% 1 356 zł. Zwrot najlepiej wpłacić na IKE.
5. **OKI od 1 stycznia 2027 r.** to nowe konto bez limitu wpłat. Zagraniczne ETF-y nie są na nim zwolnione: płacisz 0,85% ich wartości rocznie, ale nie płacisz podatku od zysku. Dla GEM to lepsze rozwiązanie niż konto zwykłe: w backteście 10,3% rocznie wobec 9,4%.
6. **Na koncie zwykłym** stosuj:
   - subkonto USD (bez przewalutowania między ETF-ami w dolarach);
   - realizację strat przed końcem roku;
   - rozliczanie strat przez 5 kolejnych lat.

   Aplikacja liczy zysk do PIT-38 dokładnie według przepisów: kolejką FIFO i kursem NBP z dnia poprzedniego.
7. **Obserwuj dwie sprawy:**
   - oficjalne limity na 2027 r. (prognoza: IKE 30 099 zł, IKZE 12 039,60 zł);
   - propozycję połączenia IKE i IKZE w jedno konto IKE+ (na razie tylko propozycja, Ministerstwo Finansów jest sceptyczne).

### Ile to znaczy w złotych

100 000 zł zainwestowane w GEM na 20 lat, przy średnich wynikach z backtestu po kosztach i podatku:

| Gdzie | Rocznie | Po 20 latach | Po 30 latach |
|---|---:|---:|---:|
| IKE/IKZE z tanim przewalutowaniem | 11,2% | 835 787 zł | 2 416 260 zł |
| IKE/IKZE z subkontem USD | 10,7% | 763 752 zł | 2 110 710 zł |
| OKI (od 2027 r.) | 10,3% | 710 412 zł | 1 893 500 zł |
| IKE/IKZE w XTB (tylko PLN) | 10,1% | 685 088 zł | 1 793 162 zł |
| Konto zwykłe z subkontem USD | 9,4% | 603 040 zł | 1 480 879 zł |
| Konto zwykłe w PLN | 8,3% | 492 685 zł | 1 093 588 zł |

Różnica między najlepszym a najgorszym kontem po 20 latach wynosi ok. 343 000 zł przy tej samej strategii. Wyniki historyczne nie gwarantują przyszłych, ale różnice kosztów i podatków są pewne.

---

## 1. Konta z ulgą – zasady na 2026 r.

### IKZE – Indywidualne Konto Zabezpieczenia Emerytalnego

- **Limit wpłat 2026:** 11 304 zł (1,2 × prognozowane przeciętne wynagrodzenie). Dla prowadzących działalność 16 956 zł (1,8 ×). Prognoza na 2027 r.: 12 039,60 zł i 18 059,40 zł.
- **Ulga przy wpłacie:** wpłatę odliczasz od dochodu w rocznym PIT (PIT-37, PIT-36, PIT-36L). Na ryczałcie odliczasz ją od przychodu (PIT-28). Zwrot = wpłata × Twoja stawka krańcowa.

| Twoja stawka | Zwrot przy pełnym limicie 2026 | Firma (pełny limit 2026) |
|---|---:|---:|
| 12% (skala) | 1 356 zł | 2 035 zł |
| 19% (liniowy) | 2 148 zł | 3 222 zł |
| 32% (skala) | 3 617 zł | 5 426 zł |

- **W środku konta:** zmiany pozycji GEM bez podatku.
- **Wypłata:** po 65. roku życia, jeśli wpłacałeś w co najmniej 5 latach kalendarzowych, płacisz 10% ryczałtu od całej kwoty. Wcześniejsza wypłata oznacza doliczenie całej kwoty do dochodu, co jest kosztowne. Pieniądze na IKZE traktuj jako zamrożone do emerytury.
- **Kiedy się opłaca:**
  - Przy stawce 32% i 19% bardzo: dostajesz 32% lub 19% teraz, a oddajesz 10% za kilkadziesiąt lat.
  - Przy 12% nadal tak: 2 punkty procentowe różnicy plus wzrost bez podatku przez całe życie konta.
  - Na ryczałcie 8,5% albo niższym odliczenie jest mniejsze niż późniejsze 10%, więc najpierw wypełnij IKE.
- **Dobry nawyk:** wpłacaj na IKZE co roku, choćby niewiele, żeby spełnić warunek 5 lat. Zwrot z PIT wpłać na IKE.

### IKE – Indywidualne Konto Emerytalne

- **Limit wpłat 2026:** 28 260 zł (3 × prognozowane przeciętne wynagrodzenie). Prognoza na 2027 r.: 30 099 zł. Limit dotyczy wpłat, nie zysków. Niewykorzystany limit przepada 31 grudnia.
- **W środku konta:** zmiany pozycji GEM bez podatku Belki.
- **Wypłata bez podatku:** po 60. roku życia (albo po 55., jeśli nabędziesz prawo do emerytury), jeśli wpłacałeś w co najmniej 5 latach kalendarzowych albo ponad połowę wpłat zrobiłeś ponad 5 lat przed wypłatą.
- **Wcześniejszy zwrot:** zapłacisz 19% tylko od zysku, tak jak na koncie zwykłym. IKE nigdy nie jest gorsze od konta zwykłego. Jedyną ceną jest limit i formalności przy wypłacie.
- **Jedno IKE i jedno IKZE na osobę.** Mogą być w różnych instytucjach. Można je przenieść do innego brokera bez utraty ulgi (wypłata transferowa). Przy przeniesieniu w ciągu 12 miesięcy instytucja może pobrać opłatę.

### OKI – Osobiste Konto Inwestycyjne (od 1 stycznia 2027 r.)

Podstawa prawna: ustawa z 3 lipca 2026 r. o osobistych kontach inwestycyjnych (Dz.U. 2026 poz. 1098).

- **Kto i ile:** każda osoba pełnoletnia może mieć kilka kont OKI, ale zwolnienie z podatku jest jedno, wspólne dla wszystkich. Nie ma limitu wpłat ani wieku wypłaty. Wypłaty są możliwe w każdej chwili.
- **Zwolnienie (do średnio 100 000 zł wartości, w tym do 25 000 zł aktywów oszczędnościowych):** obejmuje polskie akcje, obligacje w PLN, gotówkę w PLN oraz fundusze i ETF-y, które co najmniej 70% aktywów lokują w takich instrumentach. Do 2029 r. limity są stałe, potem waloryzowane inflacją.
- **Zagraniczne ETF-y (CSPX, EXUS, IUAA, IB01 – wszystko, czego używa GEM) nie są zwolnione.** Płacisz podatek od ich średniej wartości:
  - w 2027 r. 0,85%;
  - od 2028 r. 19% stopy referencyjnej NBP z 31 października poprzedniego roku, nie mniej niż 0,1% (np. przy stopie 3,75% wyniesie to 0,71%).
- **Bez podatku od zysków i dywidend.** Strat nie rozliczasz, a podatek od wartości płacisz także w roku straty.
- **Rozliczenie:** instytucja przesyła informację do końca lutego. Zeznanie składasz w e-Urzędzie Skarbowym między 15 marca a 31 maja, pierwszy raz w 2028 r. za 2027 r.
- **Dla GEM:** OKI wygrywa z kontem zwykłym, gdy roczny zrealizowany zysk przekracza ok. 4,5% wartości portfela (0,85% ÷ 19%). GEM często realizuje zyski, więc w backteście OKI dawało 10,3% wobec 9,4% na koncie zwykłym z subkontem USD. W roku straty OKI wypada gorzej, bo podatek od wartości i tak trzeba zapłacić.
- **Do sprawdzenia przed otwarciem:**
  - czy broker pozwala trzymać na OKI waluty (subkonto USD);
  - czy oferuje ETF-y używane w GEM;
  - jakie pobiera opłaty.

### PPK – Pracownicze Plany Kapitałowe

To nie jest narzędzie do GEM, bo PPK zarządza TFI. Jeśli jesteś zatrudniony, pozostanie w PPK zwykle się opłaca. Pracodawca wpłaca co najmniej 1,5% Twojej pensji, a państwo dopłaca (wpłata powitalna i dopłaty roczne).

### Konto zwykłe (maklerskie)

- **Podatek:** 19% od dochodu ze sprzedaży (PIT-38), płacony za cały rok do 30 kwietnia. Polski broker przesyła PIT-8C. Przy zagranicznym brokerze (np. Interactive Brokers) liczysz zysk sam.
- **Jak liczy się dochód** (aplikacja robi to automatycznie):
  - kolejka FIFO;
  - przychód i koszt przeliczane po średnim kursie NBP z ostatniego dnia roboczego przed transakcją (art. 11a ustawy o PIT);
  - prowizje i opłaty są kosztem.
- **Straty:** strata z danego roku obniża dochody z tego samego źródła w kolejnych 5 latach. W jednym roku możesz odliczyć do 50% straty albo jednorazowo do 5 mln zł.
- **Realizacja strat przed końcem roku:** w Polsce nie ma zakazu odkupienia tego samego papieru zaraz po sprzedaży. Jeśli masz w roku zysk, a jakaś pozycja jest pod kreską, sprzedaj ją i od razu odkup. Strata obniży podatek o 19% jej wartości. Rozliczenie trwa 2 sesje (T+2), więc zrób to kilka dni przed 31 grudnia. Aplikacja pokazuje takie pozycje i możliwą oszczędność.
- **ETF-y akumulujące** (wszystkie w GEM) nie wypłacają dywidend, więc nie ma podatku od dywidend przed sprzedażą.
- **Subkonto USD w XTB:** zmiany między CSPX.UK, IUAA.UK i IB01.UK bez przewalutowania. Koszt pojawia się tylko przy ETF-ie w EUR (EXUS.DE), w 62% zmian pozycji.

---

## 2. Plan na każdy rok (dla GEM)

1. **Styczeń:** wpłać na IKZE i IKE, ile możesz. Wcześniejsza wpłata dłużej pracuje bez podatku. Dodaj wpis „Wpłata” w aplikacji, aby śledzić limity.
2. **Pierwszy dzień sesyjny każdego miesiąca:** wykonaj sygnał GEM na wszystkich kontach. Ten sam ETF trzymasz na IKZE, IKE, OKI i koncie zwykłym.
3. **Do 30 kwietnia:** odlicz wpłaty na IKZE w PIT i złóż PIT-38. Zwrot z IKZE wpłać na IKE.
4. **Grudzień:**
   - wykorzystaj limity IKE i IKZE (przelew do ok. 20 grudnia);
   - na koncie zwykłym zrealizuj straty, jeśli masz w roku zysk.
5. **Od 2028 r.:** do 31 maja rozlicz podatek od OKI.

Przykład na 2026 r.: 50 000 zł do zainwestowania, podatek liniowy 19%.

| Krok | Konto | Kwota | Efekt |
|---|---|---:|---|
| 1 | IKZE | 11 304 zł | zwrot 2 148 zł w PIT za 2026 r. |
| 2 | IKE | 28 260 zł | GEM bez podatku |
| 3 | Konto zwykłe (od 2027 r. OKI) | 10 436 zł | subkonto USD, realizacja strat w grudniu |

W zakładce **Podatki → Twój plan wpłat** aplikacja liczy to dla Twojej kwoty, formy opodatkowania i już dokonanych wpłat.

---

## 3. Gdzie inwestować: porównanie platform (listopad 2026)

| | XTB | mBank eMakler | DM BOŚ (bossa) | Interactive Brokers |
|---|---|---|---|---|
| IKE / IKZE | tak / tak | tak / tak | tak / tak | nie |
| OKI | zapowiedź na 2027 r. | brak informacji | brak informacji | nie |
| Waluty na IKE | **tylko PLN** (potwierdzone) | tylko PLN | PLN, USD, EUR (do weryfikacji) | – |
| Przewalutowanie | 0,5% (potwierdzone) | ok. 0,15% (do weryfikacji) | ok. 0,1% (do weryfikacji) | ok. 0,01% (do weryfikacji) |
| Prowizja ETF | 0% do 100 tys. EUR obrotu/mies. | 0 zł za 550+ ETF-ów na IKE/IKZE | 0% do 28.02.2027, potem 0,29% (do weryfikacji) | ok. 0,05% z minimum |
| Koszt jednej zmiany GEM na IKE | 1,00% | 0,30% | 0,06% (po promocji 0,64%) | – |
| Rocznie przy 100 000 zł na IKE | ok. 1 420 zł | ok. 430 zł | ok. 90 zł (po promocji ok. 910 zł) | – |

Moja ocena:
- **Do IKE/IKZE z GEM:** najważniejsze jest przewalutowanie. Jeśli bossa potwierdzi subkonta USD na IKE/IKZE i marżę ok. 0,1%, albo mBank potwierdzi marżę ok. 0,15% i obecność CSPX, EXUS, IUAA i IB01 (lub odpowiedników) na liście ETF-ów bez prowizji, to IKE/IKZE u tego brokera będzie wyraźnie tańsze niż w XTB, nawet o ok. 1 punkt procentowy rocznie.
- **XTB:** najlepsze miejsce na konto zwykłe (0% prowizji, subkonto USD, ułamkowe ETF-y, dobra aplikacja, PIT-8C). Prawdopodobnie także na OKI, które zapowiada od 2027 r.
- **Jeśli wolisz wszystko w XTB** (prostota też ma wartość): na IKE/IKZE włącz bufor 2 punktów procentowych (`switchBufferPct: 2`). W backteście ograniczył on liczbę zmian i poprawił wynik IKE w XTB z 10,1% do 10,4% rocznie.
- **Interactive Brokers** ma najniższe koszty, ale tylko na koncie zwykłym, bez IKE, IKZE i OKI, i bez PIT-8C. Opłaca się przy dużych kwotach ponad limity, o ile chcesz sam rozliczać podatek. Aplikacja liczy go według polskich zasad.

Przed wyborem sprawdź w aktualnej tabeli opłat:
- dostępność ETF-ów;
- marżę walutową na IKE/IKZE;
- koniec promocji;
- opłaty za przechowywanie zagranicznych papierów.

Kalkulator w zakładce **Podatki → Koszt GEM u brokerów** liczy roczny koszt dla Twojej kwoty.

### IKE i IKZE w XTB – jak ograniczyć koszty

XTB prowadzi zarówno IKE, jak i IKZE. Jeśli zostajesz przy XTB (jeden broker, jedna aplikacja, 0% prowizji):

1. **Bufor 2 pp** (`switchBufferPct: 2` w `config/gem.config.js`) ogranicza liczbę zmian pozycji. W backteście poprawił wynik IKE w XTB z 10,1% do 10,4% rocznie.
2. **Waluta notowania na IKE/IKZE w XTB nie ma znaczenia dla kosztu.** Rachunek jest tylko w PLN, więc zakup i sprzedaż każdego zagranicznego ETF-u kosztują po 0,5%. Wybieraj najpłynniejsze notowanie, np. CSPX.UK dla S&P 500. Bez przewalutowania kupisz tylko ETF-y z GPW w PLN, np. ETFBSPXPL.PL (Beta ETF S&P 500 PLN-Hedged). To jednak inny fundusz: jest zabezpieczony walutowo i ma wyższe koszty, więc nie traktuj go jako zamiennika 1:1.
3. **Na koncie zwykłym w XTB** otwórz subkonta USD i EUR i kupuj w walucie, którą już masz po sprzedaży. Na przykład po sprzedaży EXUS.DE (EUR) kup S&P 500 jako **SXR8.DE** (EUR), a nie CSPX.UK (USD). To ten sam fundusz, a unikasz przewalutowania. Przy nowych złotówkach aplikacja wybiera walutę, której GEM najczęściej potrzebuje przy następnej zmianie. Z historii sygnałów: z akcji USA w 59% przypadków przejście było do akcji poza USA (EUR), a w 41% do obligacji (USD).

Zakładka **Sygnał → W jakiej walucie kupić** pokazuje to przy każdym sygnale, a dla Twoich pozycji z zakładki Portfel – konkretnie dla każdego rachunku.

**Waluta notowania nie zmienia ryzyka walutowego.** Fundusz na S&P 500 trzyma akcje amerykańskie, więc zarabia i traci na kursie dolara tak samo, czy kupisz go w USD, czy w EUR. Wybór waluty decyduje tylko o liczbie przewalutowań.

---

## 4. Kalendarz inwestora

| Termin | Co zrobić |
|---|---|
| 2 stycznia | Nowe limity IKE/IKZE – wpłać jak najwcześniej |
| do końca lutego | PIT-8C od brokera; informacje o wpłatach na IKZE; od 2028 r. informacje o OKI |
| 15 lutego – 30 kwietnia | PIT-38 i odliczenie IKZE w rocznym PIT |
| 15 marca – 31 maja | Podatek od OKI (od 2028 r. za rok poprzedni) |
| do 30 listopada | Minister Finansów ogłasza stawkę podatku OKI na kolejny rok |
| grudzień | Obwieszczenie limitów IKE/IKZE na kolejny rok |
| 1–20 grudnia | Ostatnie wpłaty na IKE/IKZE w danym roku |
| ok. 15–27 grudnia | Realizacja strat na koncie zwykłym |

Najważniejsze terminy aplikacja wysyła jako przypomnienia (Telegram/ntfy).

---

## 5. Co robi aplikacja

- **Portfel:**
  - dziennik wpłat, zakupów, sprzedaży i wycen dla kont IKE, IKZE, OKI i zwykłego;
  - wycena w PLN po kursach NBP;
  - stopa zwrotu ważona czasem (TWR) i zysk w złotych.
- **Wykres** w trybie stopy zwrotu albo wartości:
  - zakres wybierasz przyciskami (1 mies. – całość), datami od–do albo przeciągając palcem po wykresie;
  - porównanie z modelem GEM i z S&P 500 w PLN.
- **Podatki:**
  - szacunek PIT-38 (FIFO, kurs NBP z dnia poprzedniego);
  - pozycje do realizacji straty;
  - wykorzystanie limitów i zwrot z IKZE;
  - plan wpłat i kalkulator kosztów brokerów;
  - monitor zmian w przepisach (wiadomości oraz comiesięczny raport AI, który porównuje parametry z aktualnymi przepisami).
- **Synchronizacja:** dane są zapisane w przeglądarce. Opcjonalnie trafiają do prywatnego repozytorium GitHub, dzięki czemu masz je na telefonie i komputerze (README, krok 8).

---

## 6. Ryzyka i ograniczenia

- **Przepisy się zmieniają.** Limity na 2027 r. to prognoza, szczegóły OKI u brokerów nie są jeszcze znane, a IKE+ to na razie propozycja. Narzędzie śledzi zmiany, ale parametry w `config/podatki.js` zmieniasz sam po weryfikacji.
- **Stawki brokerów** oznaczone „do weryfikacji” pochodzą z porównań i stron promocyjnych, a nie z tabel opłat.
- **IKZE jest niepłynne do 65. roku życia.** Wcześniejsza wypłata jest kosztowna.
- **OKI pobiera podatek także w latach strat.**
- **Wycena w aplikacji to przybliżenie.** Cena z Twojej ostatniej transakcji jest przesuwana o zmianę indeksu i kursu NBP. Dodawaj czasem „Wycenę” z ceną z XTB. Wiążące są dokumenty brokera (PIT-8C).

---

## 7. Źródła

- [XTB – IKE (limity 2026, waluta PLN)](https://www.xtb.com/pl/ike), [XTB – konto i opłaty](https://www.xtb.com/pl/konto-i-oplaty)
- [mBank – IKE eMakler (0 zł za ETF-y)](https://www.mbank.pl/indywidualny/inwestycje-i-oszczednosci/emerytura/ike-emakler)
- [ETFkalkulator – porównanie IKE 2026](https://etfkalkulator.pl/blog/gdzie-otworzyc-ike-2026-porownanie-brokerow.html), [Analizy.pl – DM BOŚ przedłuża 0% na ETF-y na IKE/IKZE](https://www.analizy.pl/puls-rynku/39381/dm-bos-przedluza-zerowe-prowizje-na-etf-y-ike-ikze)
- [Analizy.pl – limity IKE, IKZE, OIPE, PPE 2026](https://www.analizy.pl/oszczedzanie-na-emeryture/24551/limity-wplat-na-ike-ikze-i-ppe), [kfas.pl – limity 2027 (prognoza)](https://kfas.pl/poradniki/ike-ikze-oki/)
- [Finwire – OKI 2027](https://finwire.pl/konta/oki), [Inwestomat – OKI](https://inwestomat.eu/jak-ma-dzialac-osobiste-konto-inwestycyjne-oki/)
- [Bankier – IKE+ (propozycja)](https://www.bankier.pl/wiadomosc/Rewolucja-w-oszczedzaniu-Jedno-konto-IKE-i-wyplata-pieniedzy-w-wieku-60-lat-9218328.html), [Rzeczpospolita – propozycje zmian IKE/IKZE/PPE/PPK](https://www.rp.pl/ekonomia/art45379631-rewolucja-w-oszczedzaniu-na-emeryture-ike-i-ikze-moga-zniknac)
- Backtest: [research/wyniki.md](research/wyniki.md) (Ken French Data Library, FRED)
