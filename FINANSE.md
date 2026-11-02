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

- **Dane są tylko na Twoim urządzeniu**, w pamięci przeglądarki (localStorage). Nie trafiają na GitHub, do mnie ani do nikogo innego. Synchronizacja z zakładki Portfel ich nie obejmuje.
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
  - miesiąc: każda kategoria w porównaniu z poprzednim miesiącem i średnią z 3 miesięcy;
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

## Waluty

- Przy zakładaniu konta (albo w *Edytuj*) wybierasz **walutę**: PLN, EUR, USD, GBP albo CHF. Walutę można zmienić, dopóki konto nie ma operacji.
- Kwoty na koncie w euro wpisujesz w euro. Okno operacji pokazuje od razu przeliczenie, np. „≈ 44,19 zł · kurs średni NBP 4,4185 z 2 lis 2026”.
- **W raportach** (wydatki, przychody, kategorie) operacja liczy się w złotych po kursie NBP z jej dnia. **W majątku** saldo konta walutowego liczy się po bieżącym kursie NBP.
- **Przelew między walutami**, np. z konta w złotych na konto maklerskie w euro: wpisujesz kwotę w złotych, a pole **Na konto wpłynie (EUR)** wypełnia się po kursie NBP. Wpisz tam kwotę, która faktycznie wpłynęła (np. po kursie z XTB) – tę zapiszę.
- Kursy pochodzą z tabeli A NBP i są odświeżane w dni robocze razem z aplikacją (data kursu jest widoczna w zakładce Konta).

## Konto inwestycyjne

Rodzaj konta **Konto inwestycyjne** (np. XTB, IKE, IKZE). Jego wartość to **wolna gotówka** (saldo konta) **+ aktywa** wyceniane po bieżących cenach.

1. *Konta → przy koncie inwestycyjnym → **Aktywa***.
2. **+ ETF z listy**: wybierz ETF (te same, które śledzi zakładka Portfel, np. SXR8.DE, CSPX.UK, EXUS.DE, IB01.UK), wpisz ilość, cenę zakupu za sztukę i datę zakupu. Każdy zakup dodawaj jako osobną pozycję.
3. **+ Inne aktywo (wycena ręczna)**: np. obligacje skarbowe, lokata, złoto. Wpisujesz wartość, a gdy się zmieni – nową wartość (aplikacja zapamięta historię wycen do wykresu).
4. Opcja **Rozlicz zmianę z wolną gotówką na koncie** (domyślnie włączona):
   - nowa pozycja zmniejsza wolną gotówkę o swoją wartość – tak jest, gdy kupujesz ETF za pieniądze z rachunku albo gdy saldo konta (np. z Money Managera) obejmowało już wartość ETF-ów;
   - usunięcie pozycji to sprzedaż: jej wartość wraca do gotówki, a w historii pozycja zostaje do dnia sprzedaży.

   Wyłącz tę opcję, gdy saldo konta to tylko gotówka, a aktywa dopisujesz osobno.

**Jak liczona jest cena ETF-u:** od ceny zakupu, którą wpisujesz, według zmiany indeksu, który ten ETF śledzi, przeliczonej na walutę ETF-u. To ten sam sposób co w zakładce Portfel. Ceny odświeżają się w każdy dzień roboczy. Wycena jest bardzo bliska notowaniu, ale może się nieznacznie różnić (np. o koszty funduszu) – dokładną cenę zawsze widzisz w XTB.

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

Działa natomiast **automatyzacja w aplikacji Skróty**. Uruchamia się przy każdej płatności Apple Pay dowolną kartą z Portfela i dostaje kwotę, sprzedawcę i nazwę karty. Skrót pokazuje listę Twoich kategorii, a wybór dopisuje do pliku tekstowego w telefonie. Aplikacja wczytuje ten plik jednym przyciskiem.

**Czy Apple Pay jest już podłączone?** Nie samo z siebie – dopóki nie ustawisz automatyzacji w Skrótach (kroki niżej), dziennik nie dostaje żadnych płatności. Stan sprawdzisz w *Finanse → Więcej → Apple Pay*: jest tam data ostatniego importu płatności i lista kart przypisanych do kont. Napis „Nie było jeszcze żadnego importu z Apple Pay” oznacza, że automatyzacja nie jest ustawiona albo plik nie był jeszcze wczytany.

**Z jakiej karty była płatność.** Skrót zapisuje nazwę karty z Portfela (np. „Erste Visa”). Gdy pierwszy raz pojawi się płatność kartą, która nie jest przypisana do żadnego konta, w Przeglądzie zobaczysz okienko **Karty bez przypisanego konta**. Wybierz konto i kliknij **Przypisz** – ta i kolejne płatności tą kartą trafią na to konto. Jeśli to karta kredytowa, zakup od razu zwiększy jej zadłużenie.

> Nie mogłem przetestować Skrótu na prawdziwym iPhonie. Opis bazuje na funkcjach iOS 17–26. Nazwy akcji mogą się nieco różnić między wersjami systemu (w nawiasach podaję nazwy angielskie).

### 1. Pliki tylko na iPhonie (bez iCloud)

Aby plik z wydatkami nie trafiał do iCloud: *Ustawienia → [Twoje imię] → iCloud → Drive* → wyłącz synchronizację dla aplikacji **Skróty**. Folder Skrótów będzie wtedy w *Plikach → Na moim iPhonie → Skróty*.

### 2. Lista kategorii

W aplikacji: *Finanse → Więcej → Apple Pay → Pobierz kategorie.txt*. Zapisz plik w *Na moim iPhonie → Skróty*. Gdy zmienisz kategorie w aplikacji, pobierz plik ponownie.

### 3. Automatyzacja

Skróty → zakładka **Automatyzacja** → **+** → **Portfel** (w iOS 17–18: **Transakcja**, ang. *Transaction*):
- **Karty:** wybierz swoje karty albo wszystkie.
- **Uruchom natychmiast** (*Run Immediately*): włączone.
- Dalej → **Nowy pusty skrót** i dodaj kolejno akcje:

| # | Akcja (PL / EN) | Ustawienia |
|---|---|---|
| 1 | **Pobierz plik** (*Get File*) | Plik: `kategorie.txt` w folderze Skróty; „Pokaż wybór dokumentu” wyłączone |
| 2 | **Podziel tekst** (*Split Text*) | Tekst: wynik kroku 1; separator: **Nowe wiersze** |
| 3 | **Wybierz z listy** (*Choose from List*) | Lista: wynik kroku 2; monit: `Kategoria: ` + zmienne **Sprzedawca** i **Kwota** z *Danych wejściowych skrótu* |
| 4 | **Formatuj datę** (*Format Date*) | Data: **Bieżąca data**; format: **ISO 8601**, z godziną |
| 5 | **Tekst** (*Text*) | `[Sformatowana data];[Kwota];[Sprzedawca];[Wybrany element];[Karta]`. Zmienne Kwota, Sprzedawca i Karta (nazwa karty lub karty pokładowej) wybierz z *Danych wejściowych skrótu* |
| 6 | **Dołącz do pliku tekstowego** (*Append to Text File*) | Tekst: wynik kroku 5; ścieżka: `wydatki.txt`; **Utwórz nowy wiersz** włączone |
| 7 | *(opcjonalnie)* **Pokaż powiadomienie** | `Zapisano: [Kwota] – [Wybrany element]` |

Po płatności zobaczysz listę kategorii.
- Jeśli wybierzesz **Pomiń**, płatność nie zostanie zapisana (np. zwrot, przelew między kontami).
- Jeśli zamkniesz listę, płatność trafi do aplikacji jako „Do przypisania”. Kategorię wybierzesz przy imporcie.

Płatność trafi na konto, przy którym w polu **Karty w Apple Pay** wpiszesz nazwę karty z Portfela (np. „mBank Visa”). Jeśli to karta kredytowa, zakup od razu zwiększy jej zadłużenie.

### 4. Import do aplikacji

*Finanse → Więcej → Apple Pay → Importuj wydatki.txt* → wybierz plik z folderu Skróty.
- Wpisy już zaimportowane są pomijane, więc plik może się wydłużać, a Ty importujesz go tyle razy, ile chcesz.
- Płatności bez kategorii otwierają się od razu w oknie **Do przypisania**: kategoria jednym dotknięciem, z opcją zapamiętania dla tego sprzedawcy.

Format wiersza, jeśli chcesz coś wkleić ręcznie (*Wklej wpisy ręcznie*):

```
2026-11-02T14:33:00+01:00;45,20 zł;Biedronka;Zakupy spożywcze;mBank Visa
```

### Ograniczenia automatyzacji

- Działa tylko dla **płatności Apple Pay** (telefonem lub zegarkiem). Nie obejmuje płatności fizyczną kartą, BLIK-iem, przelewów ani poleceń zapłaty. Te operacje dodasz z wyciągu CSV, ręcznie albo jako stałe pozycje.
- Niektórzy wydawcy kart nie przekazują kwoty albo nazwy sprzedawcy. Takie wiersze aplikacja pokaże jako błędne albo bez nazwy.
- Automatyzacja może się uruchomić także dla płatności odrzuconej. Taki wpis usuniesz w aplikacji.
- Przy zablokowanym telefonie lista może pojawić się jako powiadomienie. Dotknij go, aby wybrać kategorię.

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
