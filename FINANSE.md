# Dziennik finansowy – instrukcja

Zakładka **Finanse** to osobna strona aplikacji (`finanse.html`) do śledzenia wydatków i przychodów. Układ jest wzorowany na aplikacji *Money Manager: finanse, przychody i wydatki* (Orange Dog). Na górze jest sześć zakładek:

| Zakładka | Co tam jest |
|---|---|
| **Przegląd** | saldo wszystkich kont, wydatki i przychody za dzień, tydzień, miesiąc, rok albo dowolny okres, wykres kategorii, duże przyciski **− Wydatek** i **+ Przychód**, raporty |
| **Kalendarz** | miesiąc dzień po dniu: ile wydano każdego dnia; dotknięcie dnia pokazuje jego operacje |
| **Operacje** | lista wszystkich operacji, wyszukiwanie i filtry, eksport do CSV |
| **Konta** | konta, karty kredytowe z zadłużeniem i limitem, spłata karty, przelewy między kontami |
| **Stałe** | stałe dochody, płatności i przelewy (pensja, czynsz, rachunki, subskrypcje) |
| **Więcej** | kategorie i reguły, import (Money Manager, wyciąg CSV), Apple Pay, kopia zapasowa |

## Prywatność: dlaczego dane nie wychodzą do sieci

- **Dane są tylko na Twoim urządzeniu**, w pamięci przeglądarki (localStorage). Nie trafiają na GitHub, do mnie ani do nikogo innego. Synchronizacja z zakładki Portfel ich nie obejmuje.
- **Strona ma zablokowaną sieć.** W nagłówku ma politykę bezpieczeństwa `Content-Security-Policy: connect-src 'none'`. Przeglądarka odrzuci każdą próbę połączenia z tej strony, także wysłanie danych w tle. Sprawdziłem to: wszystkie próby połączeń zostały zablokowane.
- **Import też działa bez sieci.** Pliki .mmbackup i CSV są odczytywane w telefonie, w przeglądarce.
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

Saldo konta zmienia każda zapisana operacja, także dopisana z datą wsteczną. Jeśli saldo się rozjedzie z bankiem, wejdź w **Konta → Edytuj** i wpisz prawidłowe saldo obecne.

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
- **Saldo łączne** sumuje wszystkie aktywne konta w złotych (zadłużenie kart odejmuje się samo). Konta w innych walutach i oznaczone „nie wliczaj do salda łącznego” są pomijane.
- **Historia** przy koncie pokazuje wszystkie jego operacje i saldo.
- **Ukryj** chowa konto, którego już nie używasz, ale zostawia jego historię. Konto bez operacji można usunąć.

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
3. Zobaczysz podsumowanie: zakres dat, liczbę kont, kategorii, wydatków, przychodów i przelewów oraz salda kont. Sprawdź je.
4. **Importuj.**

Co się przenosi:
- **konta z saldami** – takimi samymi jak w Money Managerze; karta kredytowa z ujemnym saldem trafi do kart kredytowych;
- **kategorie** z kolorami i budżetami; ikony są dobierane po nazwie; domyślne kategorie dziennika, których nie używasz, zostaną ukryte (przywrócisz je w *Więcej → Kategorie*);
- **wszystkie wydatki, przychody i przelewy**, z komentarzami jako opisem;
- konta w obcych walutach: saldo w walucie konta, a w raportach kwoty w złotych (tak jak w Money Managerze).

Nie przenoszą się przypomnienia z Money Managera. Stałe płatności ustaw w zakładce Stałe.

**Ponowny import** tej samej albo nowszej kopii nic nie zdubluje. Dojdą nowe operacje, a zmiany i usunięcia z Money Managera zostaną uwzględnione. Operacji zmienionych już w dzienniku import nie nadpisze. Dzięki temu możesz przez jakiś czas używać obu aplikacji i co jakiś czas wczytywać świeżą kopię.

> Plik .mmbackup to archiwum ZIP z bazą danych SQLite. Dziennik odczytuje je samodzielnie w przeglądarce. Sprawdziłem to na kopii zbudowanej według struktury bazy Money Managera, ale nie na pliku z Twojego telefonu. Jeśli import zgłosi błąd albo coś się nie zgodzi, napisz mi, co pokazało podsumowanie.

## Apple Pay: okienko z kategoriami przy każdej płatności

iOS nie pozwala stronom ani zwykłym aplikacjom czytać historii płatności z Portfela. Interfejs Apple (FinanceKit) działa tylko w USA i tylko dla Apple Card.

Działa natomiast **automatyzacja w aplikacji Skróty**. Uruchamia się przy każdej płatności Apple Pay dowolną kartą z Portfela i dostaje kwotę, sprzedawcę i nazwę karty. Skrót pokazuje listę Twoich kategorii, a wybór dopisuje do pliku tekstowego w telefonie. Aplikacja wczytuje ten plik jednym przyciskiem.

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
