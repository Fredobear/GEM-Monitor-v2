# Dziennik finansowy – instrukcja

Zakładka **Finanse** to osobna strona aplikacji (`finanse.html`) do śledzenia wydatków i przychodów. Układ jest wzorowany na aplikacji *Money Manager: finanse, przychody i wydatki* (Orange Dog). Na górze jest sześć zakładek:

| Zakładka | Co tam jest |
|---|---|
| **Przegląd** | majątek, wydatki i przychody za dzień, tydzień, miesiąc, rok albo dowolny okres, wykres kategorii, duże przyciski **− Wydatek** i **+ Przychód**, raporty |
| **Kalendarz** | miesiąc dzień po dniu: ile wydano każdego dnia; dotknięcie dnia pokazuje jego operacje |
| **Operacje** | lista wszystkich operacji, wyszukiwanie i filtry, eksport do CSV |
| **Konta** | wykres majątku i dochodów, konta w złotych i innych walutach, karty kredytowe (zadłużenie, limit, spłata), konta inwestycyjne z aktywami |
| **Stałe** | stałe dochody, płatności i przelewy (pensja, czynsz, rachunki, subskrypcje) |
| **Więcej** | kategorie i reguły, import (Money Manager, wyciąg CSV), dokumenty (paski płacowe, paragony), Apple Pay, kopia zapasowa |

## Prywatność: dlaczego dane nie wychodzą do sieci

- **Dane są tylko na Twoim urządzeniu**, w pamięci przeglądarki (localStorage). Nie trafiają na GitHub, do mnie ani do nikogo innego. Synchronizacja portfela GEM (GEM → Mój portfel GEM) ich nie obejmuje.
- **Strona ma zablokowaną sieć.** W nagłówku ma politykę bezpieczeństwa `Content-Security-Policy: connect-src 'none'`. Przeglądarka odrzuci każdą próbę połączenia z tej strony, także wysłanie danych w tle. Sprawdziłem to: wszystkie próby połączeń zostały zablokowane.
- **Import też działa bez sieci.** Pliki .mmbackup i CSV są odczytywane w telefonie, w przeglądarce.
- **Dokumenty** (paski płacowe, paragony, umowy) są zapisywane w pamięci przeglądarki na urządzeniu (IndexedDB), tak samo bez sieci.
- **Kursy walut i ceny ETF-ów** nie są pobierane przez dziennik. Automat na GitHubie (ten sam, który liczy sygnał GEM) w każdy dzień roboczy pobiera średnie kursy NBP i ceny, a potem dołącza je do strony dziennika. Telefon pobiera tylko nową wersję strony; nic nie wysyła.
- **Działa bez internetu.** Service worker zapisuje aplikację w pamięci telefonu, więc dziennik otworzysz w trybie samolotowym.
- **Kopia zapasowa jest ręczna**: *Finanse → Więcej → Kopia → Eksportuj kopię*. Plik zapisz w *Plikach* na iPhonie.

Ważne na iPhonie:
- Używaj aplikacji **dodanej do ekranu początkowego**. Safari i aplikacja z ekranu początkowego mają osobne pamięci, więc dane wpisane w jednym miejscu nie będą widoczne w drugim.
- Usunięcie danych witryny w ustawieniach Safari usuwa też dziennik, dlatego rób kopie.

## Pierwsze kroki

Masz dwie drogi.

**A. Przenosisz dane z Money Managera (Orange Dog)** – patrz [Import z Money Managera](#import-z-money-managera). Konta, salda, kategorie i cała historia pojawią się od razu.

**B. Zaczynasz od zera:**
1. **Konta → + Dodaj konto.** Podaj nazwę, rodzaj i **saldo obecne** (ile jest teraz na koncie). Dla karty kredytowej podajesz **zadłużenie** – patrz niżej.
2. **Więcej → Kategorie**: zmień nazwy, emoji i kolory, dodaj własne kategorie, ustaw miesięczne budżety.
3. **Stałe → + Dodaj**: pensja, czynsz, rachunki, subskrypcje.
4. Wydatki dodajesz przyciskiem **− Wydatek** w Przeglądzie: kwota, kategoria jednym dotknięciem, konto. Przelew między własnymi kontami nie jest wydatkiem.

Saldo konta zmienia każda zapisana operacja, także dopisana z datą wsteczną. Jeśli saldo się rozjedzie z bankiem, wejdź w **Konta → Edytuj** i wpisz prawidłowe saldo obecne – różnica zapisze się jako [korekta salda](#korekta-salda).

## Przegląd

- **Okres:** Dzień, Tydzień (poniedziałek–niedziela), Miesiąc, Rok albo Okres (dowolne daty). Strzałki ‹ › przesuwają okres, a „wróć do dziś” wraca do bieżącego.
- **Wydatki / Przychody:** przełącznik nad wykresem. Pod nim bilans okresu i jaka część przychodów zostaje.
- **Kategorie:** dotknięcie kategorii rozwija jej operacje z tego okresu. W widoku miesiąca pasek pokazuje wykorzystanie budżetu (czerwony po przekroczeniu).
- **Raporty pod spodem:**
  - miesiąc: każda kategoria w porównaniu z poprzednim miesiącem i średnią z 3 miesięcy. **Dotknij dowolnej kwoty**, a w dymku zobaczysz wydatki, z których się składa (w średniej – wszystkie z 3 miesięcy). Dotknięcie wydatku w dymku otwiera go do edycji, a dotknięcie poza dymkiem go zamyka;
  - rok: przychody i wydatki miesiąc po miesiącu, średnie miesięczne;
  - każdy okres: sprzedawcy, u których wydajesz najwięcej.
- Na górze pojawiają się przypomnienia: operacje bez kategorii, stałe pozycje do zatwierdzenia, zbliżający się termin spłaty karty.

## Kalendarz

- Każdy dzień miesiąca pokazuje kwotę wydatków. Im ciemniejsze pole, tym więcej wydane.
- Zielona kropka oznacza przychód, a symbol ↻ zaplanowaną stałą pozycję.
- **Dotknij dnia**, a pod kalendarzem zobaczysz wszystkie operacje z tego dnia i zaplanowane stałe pozycje. Przycisk **+ Dodaj operację w tym dniu** wpisuje datę za Ciebie.
- Miesiąc zmieniasz strzałkami albo przesunięciem palca po kalendarzu.
- Nad kalendarzem: suma wydatków i przychodów w miesiącu oraz średni wydatek dzienny.

## Konta i karty kredytowe

**Karta kredytowa ma saldo ujemne – to Twoje zadłużenie.**
- Przy dodawaniu karty (*Konta → + Dodaj konto → Karta kredytowa*) wpisujesz **zadłużenie na karcie**, np. 1250. Saldo karty pokaże się jako −1250,00 zł.
- Możesz podać **limit** (aplikacja pokaże wykorzystanie i ile zostało do wykorzystania) i **dzień spłaty** (5 dni przed terminem w Przeglądzie pojawi się przypomnienie).
- Opcjonalnie **oprocentowanie karty** (np. 18,5%) i **minimalną spłatę** (% zadłużenia, np. 3%). Przy karcie pojawi się wtedy kwota minimalnej spłaty i szacunek odsetek, które bank naliczy, jeśli nie spłacisz całości w terminie (okres bezodsetkowy obejmuje tylko spłatę w terminie).
- **Każdy wydatek opłacony kartą** zwiększa zadłużenie: po zakupie za 200 zł saldo spada z −1250 do −1450 zł. Okno operacji przypomina o tym, gdy wybierzesz kartę.

**Spłata karty** (*Konta → Spłać kartę*):
1. Kwota jest od razu wpisana jako całe zadłużenie. Możesz ją zmienić, np. na minimalną spłatę.
2. Wybierz konto, z którego spłacasz. Aplikacja zapamięta je przy karcie.
3. Pod formularzem widać salda po spłacie, np. „karta 0,00 zł · mBank 3784,50 zł”.
4. **Spłać kartę**: zadłużenie karty spada, a z konta schodzi ta sama kwota. Spłata to przelew między Twoimi kontami, więc nie liczy się jako wydatek – wydatkami były zakupy kartą.

Inne:
- **Majątek** sumuje wszystkie aktywne konta w złotych: konta w innych walutach po bieżącym kursie NBP, konta inwestycyjne razem z aktywami, a zadłużenie kart odejmuje się samo. Pomijane są tylko konta oznaczone „Nie wliczaj do salda łącznego” (np. PPE, z którego nie możesz swobodnie korzystać).
- **Historia** przy koncie pokazuje wszystkie jego operacje i saldo.
- **Ukryj** chowa konto, którego już nie używasz, ale zostawia jego historię. **Usuń…** – patrz [Usuwanie i cofanie zmian](#usuwanie-i-cofanie-zmian).

## Przelew na IKE (konto powiązane z portfelem GEM)

Wpłatę na IKE, IKZE albo OKI zapisujesz raz, a trafia w dwa miejsca: do dziennika jako **przelew między Twoimi kontami** (nie wydatek, więc nie psuje budżetu) i do zakładki **GEM → Mój portfel GEM** jako **wpłata** (liczy się do rocznego limitu).

1. *Konta → + Dodaj konto* (albo **Edytuj** istniejące) → rodzaj **Konto inwestycyjne** → pole **Rachunek w portfelu GEM**: wybierz **IKE** (albo IKZE, OKI, konto zwykłe). Saldo zostaw 0.
2. Zostaw zaznaczone **Wartość konta według wyceny portfela GEM**. Wtedy konto pokazuje wartość rachunku z portfela GEM (ETF-y i gotówka po bieżących cenach), a w majątku liczy się jako inwestycja. ETF-ów nie trzeba wpisywać drugi raz. Wycena odświeża się, gdy otworzysz na tym urządzeniu zakładkę GEM.
3. Przy koncie jest przycisk **Wpłać na IKE**. Otwiera przelew z Twojego konta bankowego na IKE z zaznaczonym polem **„Zapisz też w portfelu GEM jako wpłatę na IKE (liczy się do limitu)”**. To samo pole pojawia się przy każdym przelewie na powiązane konto. Przelew z IKE na konto bankowe zapisze się jako wypłata.
4. Przy koncie widać **wykorzystanie limitu** w tym roku (np. „Wpłaty w 2026: 1 990 zł z 28 260 zł limitu IKE”) oraz wartość, wpłaty netto i zysk z portfela GEM.

**Wpłata dodana w zakładce GEM.** Jeśli wpiszesz wpłatę w *GEM → Mój portfel GEM*, przy koncie w Finansach pojawi się ramka „W portfelu GEM jest operacja na IKE, której nie ma w Finansach”. Wybierz konto, z którego były pieniądze, i dotknij **Zapisz jako przelew**. Ramka pokazuje wpłaty od dnia powiązania konta (starsze są już zwykle w saldach).

**Edycja i usuwanie.** Zmiana kwoty lub daty przelewu poprawia też wpłatę w portfelu GEM, a usunięcie przelewu usuwa ją (z możliwością „Cofnij”).

Prywatność: Finanse i portfel GEM działają w tej samej przeglądarce na Twoim urządzeniu. Dziennik czyta i dopisuje wpłaty w portfelu GEM lokalnie – nic nie jest wysyłane. Jeśli masz włączoną synchronizację portfela GEM z prywatnym repozytorium, wpłata trafi tam przy następnym otwarciu zakładki GEM (jak każda inna wpłata w portfelu). Dane dziennika nadal nie są synchronizowane.

## Kredyty i pożyczki

Rodzaj konta **Kredyt / pożyczka** śledzi kredyt hipoteczny, gotówkowy, samochodowy, zakup na raty (także 0%), kredyt konsolidacyjny albo pożyczkę. Saldo jest ujemne: to kapitał, który został do spłaty (zadłużenie liczy się w majątku jak karta kredytowa).

**Dodanie kredytu** (*Konta → + Dodaj konto → Kredyt / pożyczka*):
- **Rodzaj**, **kwota z umowy**, **data uruchomienia**, **liczba rat** i **termin pierwszej raty** (jego dzień miesiąca to dzień każdej raty).
- **Kredyt spłacany od dawna?** Zaznacz „Kredyt jest już spłacany – podam stan na dziś” i przepisz z aplikacji banku: **kapitał do spłaty**, **ile rat zostało** i **termin najbliższej raty**. To dokładniejsze niż liczenie od początku, bo uwzględnia wszystkie dawne zmiany stóp.
- **Oprocentowanie**:
  - **stałe** – stopa z umowy (nominalna, nie RRSO) i opcjonalnie data końca okresu stałej stopy. Na 120 dni przed końcem przy kredycie pojawi się przypomnienie;
  - **zmienne** – stawka referencyjna (WIBOR 3M, WIBOR 6M, WIRON, EURIBOR…), jej obecna wartość i marża banku. Oprocentowanie to ich suma;
  - **0%** – raty bez odsetek.
- **Raty**: równe albo malejące; opcjonalnie **karencja** (pierwsze miesiące tylko odsetki) i **rata z harmonogramu banku**, jeśli bank podaje inną kwotę niż wyliczona.
- **Koszty**: **prowizja** (zapłacona albo doliczona do kredytu) i **ubezpieczenie oraz opłaty** co miesiąc – wchodzą do całkowitego kosztu kredytu i RRSO.
- **Spłata**: konto, z którego idą raty, i **zapisywanie rat w dzienniku**. W dniu raty część kapitałowa zapisze się jako przelew na kredyt (zmniejsza zadłużenie, nie jest wydatkiem), a odsetki z opłatami jako wydatek w kategorii **Kredyty i odsetki**. Raty zapisują się od dnia dodania kredytu (wcześniejsze są już w saldach kont).
- Na dole formularza widać na żywo: ratę, ile zostało do spłaty, koniec spłaty, odsetki do końca, całkowity koszt i RRSO.

**Przy kredycie na liście kont**: pasek spłaconego kapitału, „zostało X z Y”, najbliższa rata z podziałem na kapitał, odsetki i opłaty, oprocentowanie (np. „6,31% – WIBOR 3M 4,21% + marża 2,10%”) i liczba rat do końca. Raty widać też w **Kalendarzu**, w **Stałych** (razem z miesięczną sumą rat) i na liście najbliższych 30 dni.

**Szczegóły kredytu** (przycisk przy kredycie):
- podsumowanie: zostało do spłaty, spłacono (%), najbliższa rata, RRSO, odsetki zapłacone i do końca, prowizja, ubezpieczenie, **całkowity koszt kredytu**, nadpłaty;
- **zmiana oprocentowania**: data i nowa stopa (przy zmiennym – nowa wartość WIBOR/WIRON, marża dolicza się sama). Obowiązuje od pierwszej raty po tym dniu. Historia zmian zostaje na liście;
- **gdyby oprocentowanie się zmieniło**: rata przy −1, +1 i +2 punktach procentowych;
- **nadpłata z symulacją**: wpisz kwotę i wybierz **Skróć okres** albo **Zmniejsz ratę** – zobaczysz, o ile miesięcy krócej spłacasz albo o ile spadnie rata i ile zaoszczędzisz na odsetkach. **Zapisz nadpłatę** dopisuje przelew z wybranego konta na kredyt i przelicza harmonogram;
- **harmonogram**: każda rata z podziałem na kapitał i odsetki oraz saldo po racie (najbliższe raty albo cały).

**Dokładność.** Odsetki liczone są jak w typowym kalkulatorze kredytowym (saldo × oprocentowanie / 12, stopa z początku okresu). Bank liczy według liczby dni, więc kwoty mogą różnić się o kilka złotych. Jeśli saldo w dzienniku rozjedzie się z harmonogramem, przy kredycie pojawi się różnica i przycisk **Ustaw według harmonogramu** (korekta salda). Gdy bank przyśle nowy harmonogram, wpisz ratę z banku w *Edytuj parametry*.

## Waluty

- Przy zakładaniu konta (albo w *Edytuj*) wybierasz **walutę**: PLN, EUR, USD, GBP albo CHF. Walutę można zmienić, dopóki konto nie ma operacji.
- Kwoty na koncie w euro wpisujesz w euro. Okno operacji pokazuje od razu przeliczenie, np. „≈ 44,19 zł · kurs średni NBP 4,4185 z 2 lis 2026”.
- **W raportach** (wydatki, przychody, kategorie) operacja liczy się w złotych po kursie NBP z jej dnia. **W majątku** saldo konta walutowego liczy się po bieżącym kursie NBP.
- **Przelew między walutami**, np. z konta w złotych na konto maklerskie w euro: wpisujesz kwotę w złotych, a pole **Na konto wpłynie (EUR)** wypełnia się po kursie NBP. Wpisz tam kwotę, która faktycznie wpłynęła (np. po kursie z XTB) – tę zapiszę.
- Kursy pochodzą z tabeli A NBP i są odświeżane w dni robocze razem z aplikacją (data kursu jest widoczna w zakładce Konta).

## Konto inwestycyjne

Rodzaj konta **Konto inwestycyjne** (np. XTB, IKE, IKZE, PPE). Jego wartość to **wolna gotówka** (saldo konta) **+ aktywa** wyceniane po bieżących cenach.

**Zysk z inwestycji.** Przy każdym koncie inwestycyjnym z aktywami widać trzy liczby: **Zainwestowano** (ilość × cena zakupu, w złotych po kursie NBP z dnia zakupu), **Wartość aktywów** (po bieżących cenach i kursach) i **Zysk** w złotych i procentach. Pod spodem każda pozycja ma swój wynik, np. „zainwestowano 7 447,42 zł · +2 085,47 zł (+28,0%)”; przy instrumentach w obcej walucie dodatkowo zmiana samej ceny (np. „cena w USD +12,3%”), bo zysk w złotych obejmuje też zmianę kursu waluty. Sprzedane pozycje dają **zysk zrealizowany**. **Konto w euro** (albo innej walucie) pokazuje wartość, koszt i zysk w swojej walucie – tak jak XTB – a pod spodem te same liczby w złotych (tam zysk obejmuje też zmianę kursu euro). Koszt w złotych liczony jest po kursie NBP zapamiętanym przy zapisie pozycji, więc nie zmienia się sam, gdy NBP opublikuje nowy kurs. Łączny zysk z inwestycji (kont wliczanych do majątku) widać w karcie Majątek i na Przeglądzie.

1. *Konta → przy koncie inwestycyjnym → **Aktywa***.
2. **+ Instrument z XTB**: wyszukaj dowolną akcję albo ETF z oferty XTB – po nazwie (np. „all world”), symbolu (np. „CDR”, „VWCE”) albo ISIN. Zanim cokolwiek wpiszesz, lista podpowiada ETF-y strategii GEM. Wpisz ilość i cenę zakupu za sztukę (albo od razu kwotę **Zainwestowano** – cenę aplikacja wyliczy) oraz datę zakupu. Każdy zakup możesz dodać jako osobną pozycję albo jedną pozycję ze średnią ceną. Przy instrumencie widać, skąd pochodzi jego cena.
3. **+ Fundusz ING TFI (PPE)**: wybierz fundusz i **kategorię jednostek** (w PPE zwykle E, F, S, T albo W – sprawdzisz ją w serwisie ING TFI24 przy nazwie funduszu albo w umowie PPE pracodawcy; każda kategoria ma inną cenę jednostki). Wpisz **liczbę jednostek** i **sumę wpłat** – obie liczby pokazuje ING TFI24. Aplikacja zapamięta kategorię dla tego konta i przy kolejnym funduszu podpowie ją sama. Wycena jednostek przychodzi z ING TFI w każdy dzień roboczy.
4. **+ Obligacje skarbowe**, **+ Złoto**, **+ Kryptowaluta** – zob. [niżej](#obligacje-skarbowe-złoto-i-kryptowaluty).
5. **+ Inne aktywo (wycena ręczna)**: np. lokata, mieszkanie, kryptowaluta spoza listy. Wpisujesz wartość, a gdy się zmieni – nową wartość (aplikacja zapamięta historię wycen do wykresu). Instrument z XTB bez darmowych notowań (np. akcja z Frankfurtu) aplikacja sama doda w tym trybie, z nazwą i walutą z katalogu.
6. Opcja **Rozlicz zmianę z wolną gotówką na koncie** (domyślnie włączona):
   - nowa pozycja (albo dokupienie – większa ilość) zmniejsza wolną gotówkę o swoją wartość – tak jest, gdy kupujesz ETF za pieniądze z rachunku albo gdy saldo konta (np. z Money Managera) obejmowało już wartość ETF-ów;
   - usunięcie pozycji to sprzedaż: jej wartość wraca do gotówki, a w historii pozycja zostaje do dnia sprzedaży;
   - sama zmiana wyceny (np. wpisanie kursu z XTB) nie rusza gotówki.

   Wyłącz tę opcję, gdy saldo konta to tylko gotówka, a aktywa dopisujesz osobno.
7. **Wolna gotówka na rachunku teraz** (opcjonalnie): wpisz kwotę „Wolne środki” z XTB, a saldo konta ustawi się dokładnie na nią. Przydaje się, gdy saldo zawierało dotąd także wartość ETF-ów – reszta wartości konta to wtedy aktywa i ich zysk, a nie gotówka.

**Pozycje ze średnią ceną (bez całej historii transakcji).** Nie musisz wpisywać każdego zakupu z przeszłości. Wpisz **ilość** i **średnią cenę zakupu** z XTB (albo kwotę „Zainwestowano”), datę możesz zostawić dzisiejszą. Dla ETF-ów z Xetry, Paryża czy Londynu aplikacja nie ma bezpłatnego źródła dokładnego kursu, dlatego przy takiej pozycji jest pole **Kurs teraz z XTB**: przepisz aktualną cenę z XTB (pozycja → aktualna cena). Od razu zobaczysz prawdziwą wartość i zysk, a w kolejne dni kurs będzie zmieniał się razem z indeksem, który ETF śledzi. Kurs możesz poprawić w każdej chwili (np. raz na kilka miesięcy). Dla akcji z GPW, funduszy ING TFI i obserwowanych akcji z USA to pole nie jest potrzebne – kurs przychodzi sam.

Przykład (Twoje konto XTB EUR po imporcie): saldo 30 126 EUR obejmowało gotówkę i ETF-y. Po dodaniu VWCE, EUNL, MEUD i IS3N ze średnimi cenami w „wolnej gotówce” zostało 4 538 EUR, czyli zysk. Otwórz **Aktywa**, przy każdym ETF-ie wpisz **Kurs teraz z XTB**, a w polu **Wolna gotówka na rachunku teraz** – kwotę z XTB (np. 0). Zysk pojawi się przy pozycjach, a gotówka będzie prawdziwa.

Na liście kont pozycje tego samego instrumentu (np. kolejne zakupy w planie) pokazują się razem: łączna ilość, koszt, wartość i zysk.

**PPE w ING – przykład.** Konto „PPE ING” (zaznacz „nie wliczaj do salda łącznego”, jeśli nie chcesz liczyć PPE do majątku) → Aktywa → + Fundusz ING TFI (PPE) → „ING Akcji”, kategoria E → 12,3456 jednostki, suma wpłat 12 100 zł → Zapisz. Przy włączonym rozliczeniu z gotówką wartość funduszu zmniejszy wolną gotówkę konta, więc jeśli saldo PPE było wpisane jako gotówka, po dodaniu funduszy zostanie ono zastąpione wyceną funduszy. Kolejne składki dopisuj przez **plan inwestycyjny** (niżej) – podzielą się na fundusze same.

### Obligacje skarbowe, złoto i kryptowaluty

**Obligacje skarbowe** (EDO, COI, ROS, ROD, TOS, DOR, ROR, OTS): *Aktywa → **+ Obligacje skarbowe***.
1. Wybierz **rodzaj** i **datę zakupu** – aplikacja wyznaczy serię (np. EDO kupione 9.11.2026 to EDO1136). Dla serii z oferty od listopada 2026 sama uzupełni **oprocentowanie w 1. roku**, **marżę** i **opłatę za wcześniejszy wykup**. Dla starszej serii przepisz je raz z serwisu obligacji PKO (Moje obligacje) albo z listu emisyjnego.
2. Wpisz **liczbę obligacji** (po 100 zł) i cenę: 100 zł przy zakupie albo 99,90 zł przy zamianie.
3. Wybierz konto, na które mają się zapisywać **odsetki i kwota z wykupu** (np. konto w PKO), albo „Nie zapisuj w dzienniku”. Zaznacz **IKE/IKZE**, jeśli obligacje są na takim koncie (bez podatku Belki i bez opłaty przy wypłacie z IKE).

Aplikacja liczy wartość według wzorów z list emisyjnych: od 2. roku COI, ROS, EDO i ROD mają inflację z GUS (ogłoszoną w miesiącu przed początkiem okresu, czyli za miesiąc o dwa wcześniejszy) + marżę, a ROR i DOR – stopę referencyjną NBP + marżę. EDO, ROS, ROD i TOS dopisują odsetki co rok, COI wypłaca je co rok, ROR i DOR – co miesiąc. Przy koncie widać: odsetki narosłe, oprocentowanie w bieżącym okresie, wypłacone odsetki, najbliższą wypłatę, datę wykupu i **ile dostaniesz na rękę przy wcześniejszym wykupie** (po opłacie i 19% podatku). Zysk pozycji obejmuje też odsetki już wypłacone.

**Wypłaty zapisują się same:** po terminie (przy otwarciu aplikacji) odsetki z COI, ROR i DOR trafiają na wybrane konto jako przychód w kategorii „Odsetki z obligacji” – po 19% podatku, z kwotą brutto i podatkiem w notatce. Przy wykupie zapisuje się też zwrot wartości nominalnej, a obligacje znikają z aktywów (ich wynik jest w zysku zrealizowanym). Zapisują się wypłaty od dnia dodania obligacji do aplikacji – wcześniejsze masz już na koncie w banku. Usunięta wypłata nie wraca.

Gdy GUS albo NBP nie opublikował jeszcze danych na kolejny okres, wartość jest szacunkiem (ze stałym oprocentowaniem) – aplikacja to zaznacza, a wypłata zapisze się po najbliższej aktualizacji.

**Złoto**: *Aktywa → **+ Złoto*** → wyrób (moneta bulionowa 1 oz, 1/2, 1/4 lub 1/10 oz, sztabka 1 g – 1 kg, złoto w gramach albo inny wyrób z masą i próbą), **liczba sztuk**, **cena zakupu za sztukę** i data. Wycena: gramy czystego złota × cena 1 g z NBP. To cena referencyjna – mennica w skupie zapłaci zwykle kilka procent mniej.

**Kryptowaluty**: *Aktywa → **+ Kryptowaluta*** → wyszukaj (np. „BTC”, „Ethereum”) wśród 100 największych → **ilość** (do 8 miejsc po przecinku) i **średnia cena zakupu** w złotych. Kurs w złotych z CoinGecko, odświeżany codziennie. Kryptowalutę możesz też dodać do **planu inwestycyjnego** (np. co miesiąc 200 zł w BTC).

### Plany inwestycyjne (podział wpłaty na kilka ETF-ów albo funduszy)

Tak działają plany inwestycyjne w XTB i alokacja wpłat w PPE: wpłacasz jedną kwotę, a ona dzieli się procentowo na kilka instrumentów.

1. Przy koncie inwestycyjnym: **+ Plan inwestycyjny**. Aplikacja od razu podpowiada instrumenty, które masz na koncie, z udziałami według ich obecnej wartości – popraw je tak, jak w planie w XTB (np. VWCE 70%, EUNL 15%, IS3N 10%, MEUD 5%). Suma musi dawać 100% („rozłóż po równo” dzieli równo).
2. Instrumenty dodasz też spoza konta: **+ Instrument z XTB** (wyszukiwarka), **+ Fundusz ING TFI** (fundusz i kategoria jednostek – dla PPE) albo **+ Kryptowaluta**.
3. **Wpłata cykliczna** (opcjonalnie): kwota, dzień miesiąca, najbliższy termin i **skąd pieniądze**:
   - **przelew z konta** (np. mBank) – w dzienniku zapisze się przelew na konto inwestycyjne, a gotówka na nim się nie zmieni (pieniądze od razu idą w ETF-y);
   - **z wolnej gotówki na tym koncie**;
   - **spoza aplikacji** – np. składka pracodawcy do PPE (nie zmienia innych kont).
   
   Z zaznaczonym **Kupuj automatycznie** wpłata zapisze się sama w dniu terminu (po otwarciu aplikacji). Bez zaznaczenia w Przeglądzie pojawi się prośba „Wpłata do planu – Zapisz wpłatę / Pomiń” – przydaje się, gdy kwota co miesiąc jest inna (np. składka PPE zależna od pensji).
4. **Wpłać do planu**: kwota i data, a pod spodem podział – ile pójdzie na każdy instrument, po jakiej cenie i ile jednostek kupisz. Ceny funduszy ING TFI i akcji z GPW są z notowań z dnia wpłaty, a ETF-ów z Xetry czy Londynu – szacunek od ostatniego kursu wpisanego z XTB według zmiany indeksu. Możesz je poprawić według potwierdzenia z XTB albo ING.

Każda wpłata zapisuje się jako osobne pozycje z ceną zakupu z tego dnia (dokładny koszt i historia), a na liście kont widać je razem z pozostałymi pozycjami tego instrumentu. Przy planie widać sumę wpłat i liczbę wpłat. Usunięcie planu nie usuwa kupionych aktywów.

**Jak liczona jest cena** (odświeżana w każdy dzień roboczy, ten sam sposób co w portfelu GEM):
- **akcje, ETF-y, ETC i ETN z GPW i NewConnect** – kurs zamknięcia z ostatniej sesji, prosto z giełdy;
- **fundusze ING TFI** (PPE, PPK, IKE) – wycena jednostki z ING TFI dla wybranej kategorii;
- **ETF-y strategii GEM** – notowania z codziennej aktualizacji, a między nimi zmiana indeksu, który ETF śledzi;
- **ETF-y UCITS na popularne indeksy** (np. VWCE, IWDA, SXR8, CNDX) – od ceny zakupu według zmiany amerykańskiego ETF-u na ten sam indeks, przeliczonej na walutę funduszu. To wycena przybliżona, oznaczona „≈” (może się różnić np. o koszty funduszu i dywidendy w funduszach dystrybuujących);
- **akcje i ETF-y z USA** – kurs zamknięcia, gdy symbol jest na liście obserwowanych (*Rynki → Instrumenty → Edytuj listę obserwowanych*); bez tego – cena zakupu;
- **obligacje skarbowe** – nominał z odsetkami według list emisyjnych (inflacja GUS, stopa referencyjna NBP);
- **złoto** – cena 1 g z NBP; **kryptowaluty** – kurs w złotych z CoinGecko;
- dokładną cenę zawsze widzisz w XTB albo w ING TFI24.

Ceny instrumentów spoza strategii strona wczytuje z plików aplikacji (`data/notowania.js`, wyceny funduszy – `data/fundusze.js`, złoto – `data/zloto.js`, kryptowaluty – `data/krypto.js`, dane obligacji – `data/obligacje.js`). To zwykłe pobranie gotowego pliku z tej samej strony – nic nie jest wysyłane, a blokada połączeń sieciowych (`connect-src 'none'`) działa jak dotąd.

## Wykres majątku i dochodów

Na górze zakładki **Konta**:
- **linia** – majątek na koniec każdego miesiąca (ostatni punkt to dziś);
- **słupki** – przychody (zielone) i wydatki (czerwone) w każdym miesiącu;
- zakres: 6 miesięcy, rok, 3 lata albo całość;
- pod wykresem: zmiana majątku, suma przychodów i ile z nich udało się odłożyć (przychody − wydatki).

Majątek rośnie nie tylko z oszczędności, ale też ze wzrostu wartości inwestycji i z korekt salda (np. aktualizacji wyceny PPE). Wykres zaczyna się od pierwszej operacji w dzienniku.

## Korekta salda

Korekta salda zmienia saldo konta, ale **nie jest wydatkiem ani przychodem**. Powstaje:
- gdy w *Konta → Edytuj* wpiszesz inne saldo obecne – różnica zapisze się z dzisiejszą datą (ikona ⚖️);
- przy imporcie z Money Managera – saldo początkowe i późniejsze zmiany salda kont;
- przy rozliczeniu aktywów z gotówką na koncie inwestycyjnym.

Korekty widać w historii konta i w Operacjach (filtr „Korekta salda”). Można je poprawić albo usunąć jak zwykłą operację.

## Usuwanie i cofanie zmian

Wszystko można zmienić albo usunąć, ale nie przez przypadek:
- **Operacja**: dotknij jej, a potem **Usuń…** – pojawi się okno z podsumowaniem i przyciskiem *Usuń operację*. Dołączone dokumenty zostają w zakładce Dokumenty.
- **Konto**: *Konta → Edytuj → Usuń…*. Wybierasz, co zrobić z operacjami:
  - **przenieść je na inne konto** – np. gdy to samo konto jest wpisane dwa razy. Opcja „Zachowaj obecne saldo konta docelowego” zostawia saldo tego konta bez zmian;
  - **usunąć razem z kontem** – przelewy z innymi kontami zostają, więc salda pozostałych kont się nie zmienią.

  Trzeba jeszcze zaznaczyć „Tak, chcę usunąć to konto”.
- **Kategoria**: *Więcej → Kategorie → Usuń…* – operacje przenosisz do innej kategorii albo do „Do przypisania”.
- **Stała pozycja, dokument, dane z importu, cały dziennik** – też zawsze przez okno potwierdzenia.

Po każdym usunięciu przez 10 sekund widać przycisk **Cofnij**, który przywraca wszystko, jak było.

## Dokumenty: paski płacowe, paragony, umowy

- **Przy operacji**: w oknie operacji przycisk **📎 Dodaj dokument** (PDF albo zdjęcie – na iPhonie możesz od razu zrobić zdjęcie). Przy wpisywaniu wypłaty okno samo podpowiada dołączenie paska płacowego.
- **Osobno**: *Więcej → Dokumenty → Dodaj dokument* – np. PIT, umowa, wyciąg.
- Lista w *Więcej → Dokumenty* jest pogrupowana według lat. Przy każdym dokumencie: **Otwórz**, **Udostępnij / zapisz** (np. do Plików) i **Usuń…**.
- Dokumenty są zapisane tylko na tym urządzeniu. Kopia zapasowa (*Więcej → Kopia*) może je zawierać – wtedy plik kopii jest większy.

## Stałe przelewy i dochody

*Stałe → + Dodaj* (albo przy dodawaniu operacji pole **Powtarzaj**):
- typ: dochód (np. pensja), płatność (czynsz, rachunek, subskrypcja) albo przelew między kontami (np. na oszczędności);
- jak często: co tydzień, co 2 tygodnie, co 4 tygodnie, co miesiąc, co 2 miesiące, co kwartał, co rok;
- najbliższy termin i opcjonalnie ostatni termin (np. ostatnia rata).

Dwa tryby:
- **Zapisuj automatycznie** (domyślnie): w dniu terminu operacja zapisze się sama, przy otwarciu aplikacji. Gdy aplikacja była zamknięta dłużej, zaległe terminy też się zapiszą.
- **Z potwierdzeniem** (wyłącz „Zapisuj automatycznie”): dla rachunków, których kwota co miesiąc jest inna, np. prąd. W dniu terminu w Przeglądzie i w zakładce Stałe pojawi się prośba **Zapisz / Pomiń ten termin**. „Zapisz” otwiera okno z wpisaną kwotą, którą możesz poprawić.

Na górze zakładki Stałe widać stałe przychody i wydatki w przeliczeniu na miesiąc oraz ile z tego zostaje. Niżej jest lista terminów z najbliższych 30 dni. Zaplanowane terminy widać też w kalendarzu.

## Import z Money Managera

Przenosi dane z aplikacji *Money Manager: finanse, przychody i wydatki* (Orange Dog), która zapisuje kopię zapasową jako plik **.mmbackup**.

1. W Money Managerze utwórz kopię zapasową i zapisz plik `.mmbackup` w aplikacji *Pliki* na iPhonie (np. *Na moim iPhonie*).
2. W dzienniku: *Finanse → Więcej → Import → Wybierz plik .mmbackup* i wskaż ten plik.
3. Pojawi się **kreator importu** w trzech krokach. Każdą propozycję możesz zmienić:
   - **Konta** – dla każdego konta z Money Managera: *połącz z kontem z dziennika* (aplikacja sama proponuje konto o podobnej nazwie, nawet z literówką, np. „ERTSE DEBIT” → „Erste konto”), *nowe konto* albo *nie importuj*. Operacje, które już są na połączonym koncie (ta sama kwota, data ± 1 dzień), nie zostaną dodane drugi raz. Opcja „Ustaw salda połączonych kont tak jak w Money Managerze” ustawia saldo z kopii.
   - **Kategorie** – dla każdej kategorii z Money Managera: odpowiednik w dzienniku (np. „Jedzenie na mieście” → „Restauracje i kawiarnie”, „Hobby” → „Rozrywka i hobby”), *nowa kategoria* albo *Do przypisania*. Gdy kategoria ma 3 operacje lub więcej, a nie ma odpowiednika, aplikacja proponuje utworzenie nowej. Przy mniejszej liczbie operacji trafiają one do „Do przypisania”, żeby lista kategorii została przejrzysta.
   - **Stałe płatności** – stałe płatności z Money Managera (np. czynsz, Pluxee) trafią do zakładki Stałe z kolejnym terminem.
4. **Importuj.** Przez 10 sekund możesz jeszcze kliknąć *Cofnij*.

**Korekty salda.** Money Manager zapisuje saldo początkowe przy zakładaniu konta i każdą zmianę salda (np. aktualizację wyceny XTB albo PPE) jako operację bez kategorii. Takie operacje są importowane jako [korekty salda](#korekta-salda): zmieniają saldo konta, ale nie są liczone jako przychody ani wydatki – tak samo jak w Money Managerze.

**Dane z pierwszej wersji importu.** Pierwsza wersja importu liczyła korekty salda jako przychody i wydatki (stąd bardzo duże kwoty) i tworzyła nowe konta zamiast łączyć je z istniejącymi. Po aktualizacji aplikacji:
- korekty zostaną poprawione automatycznie (zobaczysz komunikat w Przeglądzie);
- aby połączyć konta ze swoimi: *Więcej → Import → Wybierz plik .mmbackup* → w kreatorze kliknij **usuń poprzedni import** → sprawdź propozycje → **Importuj**.

**Usunięcie danych z importu**: *Więcej → Import → Usuń dane z importu…* usuwa operacje, stałe pozycje oraz konta i kategorie utworzone przy imporcie (o ile nie mają Twoich operacji). Konta połączone z Twoimi wracają do sald sprzed importu.

**Ponowny import** tej samej albo nowszej kopii nic nie zdubluje. Dojdą nowe operacje, a zmiany i usunięcia z Money Managera zostaną uwzględnione. Operacji zmienionych już w dzienniku import nie nadpisze. Aplikacja zapamiętuje, z czym połączono konta i kategorie, więc kolejne importy są szybkie.

> Import sprawdziłem na prawdziwej kopii .mmbackup (z listopada 2026 r.): salda wszystkich kont zgadzają się z Money Managerem, a przychody i wydatki obejmują tylko prawdziwe operacje.

## Apple Pay: okienko z kategoriami przy każdej płatności

iOS nie pozwala stronom ani zwykłym aplikacjom czytać historii płatności z Portfela. Interfejs Apple (FinanceKit) działa tylko w USA i tylko dla Apple Card.

Działa natomiast **automatyzacja w aplikacji Skróty**. Uruchamia się przy każdej płatności Apple Pay dowolną kartą z Portfela i dostaje kwotę, sprzedawcę i nazwę karty. Skrót **najpierw od razu zapisuje płatność** w pliku tekstowym w telefonie, a dopiero potem pokazuje listę Twoich kategorii i dopisuje wybór. Aplikacja wczytuje ten plik jednym przyciskiem i łączy oba wiersze tej samej płatności w jedną operację.

**Czy Apple Pay jest już podłączone?** Nie samo z siebie – dopóki nie ustawisz automatyzacji w Skrótach (kroki niżej), dziennik nie dostaje żadnych płatności. Stan sprawdzisz w *Finanse → Więcej → Apple Pay*: jest tam data ostatniego importu, liczba wierszy w pliku, nowe płatności, uzupełnione kategorie, wiersze z błędem (z opisem przyczyny) i lista kart przypisanych do kont.

**Z jakiej karty była płatność.** Skrót zapisuje nazwę karty z Portfela (np. „Erste Visa”). Gdy pierwszy raz pojawi się płatność kartą, która nie jest przypisana do żadnego konta, w Przeglądzie zobaczysz okienko **Karty bez przypisanego konta**. Wybierz konto i kliknij **Przypisz** – ta i kolejne płatności tą kartą trafią na to konto. Jeśli to karta kredytowa, zakup od razu zwiększy jej zadłużenie.

> Nie mogłem przetestować Skrótu na prawdziwym iPhonie. Opis bazuje na funkcjach iOS 17–26. Nazwy akcji mogą się nieco różnić między wersjami systemu (w nawiasach podaję nazwy angielskie).

### Dlaczego okienko z kategoriami często się nie pokazuje i skąd komunikat „skrót nie zadziałał poprawnie”

Automatyzacja z opcją *Uruchom natychmiast* działa w tle. Akcja **Wybierz z listy** potrzebuje jednak Twojej reakcji na ekranie, a przy płatności telefon zwykle jest zablokowany (płacisz z ekranu blokady). iOS pokazuje wtedy listę jako małe powiadomienie, które łatwo przeoczyć. Jeśli nie wybierzesz kategorii w ciągu kilkudziesięciu sekund albo zamkniesz okno, iOS **przerywa cały skrót** i wyświetla komunikat o błędzie automatyzacji.

W pierwszej wersji instrukcji zapis do pliku był **po** liście, więc przerwany skrót oznaczał płatność, która w ogóle nie trafiła do pliku. Nowa wersja zapisuje płatność **przed** pokazaniem listy:

- płatność jest w pliku zawsze, nawet gdy lista się nie pokaże, wygaśnie albo iOS przerwie skrót,
- wybrana kategoria dopisuje się jako drugi wiersz, a aplikacja łączy oba wiersze przy imporcie,
- płatności bez kategorii trafiają do okna **Do przypisania**, a „Zapamiętaj dla tego sprzedawcy” sprawia, że kolejne zakupy w tym sklepie dostają kategorię same.

Komunikat o błędzie może się nadal czasem pojawić, gdy lista wygaśnie. Nic wtedy nie ginie. Jeśli komunikaty przeszkadzają, wybierz **tryb cichy** (niżej).

Drugą przyczyną braku okienka jest sam wyzwalacz: uruchamia się dopiero wtedy, gdy Portfel dostanie od banku informację o transakcji. Jeśli w *Portfelu → karta → Ostatnie transakcje* nie widać płatności (albo widać ją bez kwoty i sklepu), ten bank nie przekazuje danych do Portfela i automatyzacja nie ma czego zapisać.

### 1. Pliki tylko na iPhonie (bez iCloud)

Aby plik z wydatkami nie trafiał do iCloud: *Ustawienia → [Twoje imię] → iCloud → Drive* → wyłącz synchronizację dla aplikacji **Skróty**. Folder Skrótów będzie wtedy w *Plikach → Na moim iPhonie → Skróty*. Jeśli po tej zmianie akcja zapisu zgłasza błąd, otwórz w niej pole pliku i wskaż folder **Skróty** ręcznie.

### 2. Automatyzacja krok po kroku

Lista kategorii jest wpisana w samym skrócie, więc nie trzeba pobierać żadnego pliku. Akcje dodajesz przyciskiem **Dodaj czynność** / ikoną wyszukiwania na dole ekranu – wpisz fragment nazwy (podany niżej), a potem dotknij akcji. Kolejność akcji zmienisz, przytrzymując akcję i przeciągając ją wyżej lub niżej.

**Masz już automatyzację z poprzedniej instrukcji?** Nie musisz zaczynać od nowa. Otwórz ją (*Skróty → Automatyzacja* → dotknij jej), dodaj na samej górze kroki 4 i 5 z listy poniżej (Tekst z pustą kategorią i Dołącz do pliku tekstowego), a w akcji **Wybierz z listy** popraw pole **Komunikat**. Reszta zostaje bez zmian.

1. Otwórz **Skróty** → zakładka **Automatyzacja** (na dole) → **+** (albo **Nowa automatyzacja**).
2. Przewiń listę wyzwalaczy i wybierz **Portfel** (w niektórych wersjach iOS: **Transakcja**). Wymaga iOS 17 lub nowszego.
3. **Karty:** zaznacz karty z Portfela (albo wszystkie). **Kategorie** zostaw wszystkie. Zaznacz **Uruchom natychmiast** (bez pytania). → **Dalej** → **Nowy pusty skrót**.
4. **Zapis płatności – akcja Tekst** (wyszukaj „tekst”, ang. *Text*). Wpisz pięć pól oddzielonych średnikiem, wstawiając zmienne z paska nad klawiaturą:
   - **Bieżąca data** → dotknij jej i ustaw **Format daty: ISO 8601** (z godziną);
   - `;` → **Dane wejściowe skrótu** → **Kwota**;
   - `;` → **Dane wejściowe skrótu** → **Sprzedawca**;
   - `;;` (dwa średniki – kategoria zostaje pusta);
   - **Dane wejściowe skrótu** → **Karta** (może się nazywać „Karta lub karta Wallet” / „Nazwa”).

   Gotowy tekst wygląda tak: `Bieżąca data;Kwota;Sprzedawca;;Karta`.
5. Akcja **Dołącz do pliku tekstowego** (wyszukaj „dołącz”, ang. *Append to Text File*). Tekst: wynik kroku 4. Plik/ścieżka: `wydatki.txt`. Włącz **Utwórz nowy wiersz**. Od tej chwili płatność jest zapisana, cokolwiek stanie się dalej.
6. Akcja **Lista** (wyszukaj „lista”, ang. *List*). Wpisz po kolei nazwy kategorii, **dokładnie tak jak w aplikacji** (*Finanse → Więcej → Kategorie*), np. „Zakupy spożywcze”, „Restauracje i kawiarnie”, „Transport i paliwo”… Na końcu dodaj dwie pozycje: **Później** i **Pomiń**.
7. Akcja **Wybierz z listy** (wyszukaj „wybierz z”, ang. *Choose from List*). Powinna sama połączyć się z Listą z kroku 6. Rozwiń ją (strzałka) i w polu **Komunikat** (ang. *Prompt*) wpisz `Kategoria:`, a potem wstaw zmienne: **Dane wejściowe skrótu** → **Kwota** i **Dane wejściowe skrótu** → **Sprzedawca**. Przełącznik **Zaznaczanie wielokrotne** zostaw wyłączony.
8. **Zapis kategorii – akcja Tekst**. Tak samo jak w kroku 4, ale w czwartym polu wstaw **Wybrany element** (wynik kroku 7): `Bieżąca data;Kwota;Sprzedawca;Wybrany element;Karta`.
9. Akcja **Dołącz do pliku tekstowego**. Tekst: wynik kroku 8. Ten sam plik `wydatki.txt`, **Utwórz nowy wiersz** włączone.
10. *(opcjonalnie)* Akcja **Pokaż powiadomienie**: `Zapisano: Kwota – Wybrany element`.
11. **Gotowe** (prawy górny róg).

W skrócie kolejność akcji to: **Tekst → Dołącz do pliku → Lista → Wybierz z listy → Tekst → Dołącz do pliku**.

**Tryb cichy** (bez okienek i bez komunikatów o błędach): zostaw tylko kroki 1–5. Każda płatność trafi do pliku bez kategorii. Po imporcie przypiszesz kategorie w oknie **Do przypisania**, zaznaczając „Zapamiętaj dla tego sprzedawcy” – po kilku tygodniach większość płatności będzie dostawać kategorię automatycznie.

**Sprawdzenie:** zapłać telefonem (np. drobny zakup). Potem w *Plikach* otwórz `wydatki.txt` w folderze **Skróty** (w iCloud Drive albo Na moim iPhonie). Po płatności powinien tam być jeden wiersz z pustą kategorią (`…;Biedronka;;mBank Visa`), a po wyborze z listy – drugi z kategorią. Brak pierwszego wiersza oznacza, że automatyzacja się nie uruchomiła (zob. przyczyny wyżej) albo zapis do pliku zgłosił błąd.

Co oznaczają pozycje na liście:
- **Pomiń** – płatność zostanie usunięta przy imporcie (np. zwrot, przelew między kontami).
- **Później** – płatność trafi do aplikacji jako „Do przypisania”; kategorię wybierzesz przy imporcie.
- Zamknięcie listy, jej wygaśnięcie albo błąd skrótu – płatność zostaje zapisana bez kategorii (też trafi do „Do przypisania”).

Gdy dodasz albo zmienisz kategorię w aplikacji, popraw też akcję **Lista** w skrócie (Skróty → Automatyzacja → dotknij automatyzacji). Pomocą jest przycisk *Więcej → Apple Pay → Pobierz kategorie.txt*, który zapisuje aktualne nazwy do skopiowania.

**Jeśli nie ma akcji „Dołącz do pliku tekstowego”** (inna wersja iOS): użyj akcji **Dołącz do notatki** (aplikacja Notatki, ang. *Append to Note*) z notatką „Wydatki” – w obu miejscach (kroki 5 i 9). Raz na jakiś czas skopiuj zawartość notatki i wklej ją w *Więcej → Apple Pay → Wklej wpisy ręcznie*.

Płatność trafi na konto, przy którym w polu **Karty w Apple Pay** wpiszesz nazwę karty z Portfela (np. „mBank Visa”). Jeśli to karta kredytowa, zakup od razu zwiększy jej zadłużenie.

### 3. Import do aplikacji

*Finanse → Więcej → Apple Pay → Importuj wydatki.txt* → wybierz plik z folderu Skróty.
- Oba wiersze tej samej płatności (bez kategorii i z kategorią) łączą się w jedną operację: ta sama kwota, sprzedawca i karta, do 15 minut różnicy. Działa to także wtedy, gdy zaimportujesz plik pomiędzy zapisem płatności a wyborem kategorii – kategoria uzupełni się przy następnym imporcie.
- Wpisy już zaimportowane są pomijane, więc plik może się wydłużać, a Ty importujesz go tyle razy, ile chcesz. Działają też pliki zapisane według poprzedniej instrukcji (jeden wiersz z kategorią).
- Płatności bez kategorii otwierają się od razu w oknie **Do przypisania**: kategoria jednym dotknięciem, z opcją zapamiętania dla tego sprzedawcy.
- Po imporcie w *Więcej → Apple Pay* zobaczysz podsumowanie: ile wierszy przeczytano, ile płatności dodano, ile kategorii uzupełniono i które wiersze mają błąd (np. „brak kwoty” – bank nie przekazał kwoty do Portfela, albo „nie rozpoznano daty” – w akcji Tekst nie ustawiono formatu ISO 8601).

Format wiersza, jeśli chcesz coś wkleić ręcznie (*Wklej wpisy ręcznie*):

```
2026-11-02T14:33:00+01:00;45,20 zł;Biedronka;;mBank Visa
2026-11-02T14:33:20+01:00;45,20 zł;Biedronka;Zakupy spożywcze;mBank Visa
```

### Ograniczenia automatyzacji

- Działa tylko dla **płatności Apple Pay** (telefonem lub zegarkiem). Nie obejmuje płatności fizyczną kartą, BLIK-iem, przelewów ani poleceń zapłaty. Te operacje dodasz z wyciągu CSV, ręcznie albo jako stałe pozycje.
- Niektórzy wydawcy kart nie przekazują kwoty albo nazwy sprzedawcy. Takie wiersze aplikacja pokaże w podsumowaniu importu jako błędne albo bez nazwy sklepu.
- Automatyzacja może się uruchomić także dla płatności odrzuconej. Taki wpis usuniesz w aplikacji.
- Przy zablokowanym telefonie lista pojawia się jako powiadomienie. Dotknij go, aby wybrać kategorię – a jeśli nie zdążysz, płatność i tak jest już zapisana.

## Import wyciągu z banku (CSV)

Automatyczne podłączenie konta bankowego (open banking, PSD2) wymaga licencjonowanego pośrednika i stałego połączenia z internetem. To sprzeczne z zasadą „dane nie wychodzą do sieci”, dlatego dziennik korzysta z eksportu CSV, który każdy polski bank udostępnia w bankowości internetowej.

1. W bankowości internetowej pobierz historię operacji w formacie **CSV**.
2. *Finanse → Więcej → Import → Wybierz plik CSV*.
3. Aplikacja sama rozpozna:
   - kodowanie (UTF-8 albo Windows-1250, typowe dla polskich banków);
   - separator i wiersz nagłówka;
   - kolumny daty, kwoty, opisu i kontrahenta.

   Możesz je poprawić i zobaczyć podgląd przed importem.
4. Wybierz konto. Opcja **Zachowaj obecne saldo konta** (domyślnie włączona) jest dla historii, która jest już ujęta w saldzie wpisanym przy zakładaniu konta: operacje dojdą do raportów, a saldo się nie zmieni.
5. Kliknij **Importuj**. Reguły przypiszą kategorie.

Duplikaty są pomijane. Dotyczy to też płatności zapisanej wcześniej z Apple Pay, która pojawia się w wyciągu: ta sama kwota, data w odstępie do 3 dni i nazwa sprzedawcy w opisie operacji. Taka płatność nie zostanie policzona drugi raz, a dostanie przypisanie do konta z wyciągu.

## Reguły

Gdy w oknie „Do przypisania” zaznaczysz *Zapamiętaj*, kolejne płatności u tego sprzedawcy dostaną kategorię same. Wielkość liter i polskie znaki nie mają znaczenia, więc „ŻABKA” i „ZABKA” to ta sama reguła. Reguły przejrzysz i dodasz ręcznie w *Więcej → Kategorie*.
