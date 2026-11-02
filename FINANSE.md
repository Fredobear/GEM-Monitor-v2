# Dziennik finansowy – instrukcja

Zakładka **Finanse** to osobna strona aplikacji (`finanse.html`) do śledzenia wydatków i przychodów:
- konta z saldami;
- własne kategorie i miesięczne budżety;
- reguły automatycznego przypisywania kategorii;
- raporty miesięczne, roczne i za dowolny okres;
- import płatności z Apple Pay i wyciągów CSV z banku.

## Prywatność: dlaczego dane nie wychodzą do sieci

- **Dane są tylko na Twoim urządzeniu**, w pamięci przeglądarki (localStorage). Nie trafiają na GitHub, do mnie ani do nikogo innego. Synchronizacja z zakładki Portfel ich nie obejmuje.
- **Strona ma zablokowaną sieć.** W nagłówku ma politykę bezpieczeństwa `Content-Security-Policy: connect-src 'none'`. Przeglądarka odrzuci każdą próbę połączenia z tej strony, także wysłanie danych w tle. Sprawdziłem to: wszystkie próby połączeń zostały zablokowane.
- **Działa bez internetu.** Service worker zapisuje aplikację w pamięci telefonu, więc dziennik otworzysz w trybie samolotowym.
- **Kopia zapasowa jest ręczna**: *Finanse → Ustawienia → Kopia zapasowa → Eksportuj*. Plik zapisz w *Plikach* na iPhonie.

Ważne na iPhonie:
- Używaj aplikacji **dodanej do ekranu początkowego**. Safari i aplikacja z ekranu początkowego mają osobne pamięci, więc dane wpisane w jednym miejscu nie będą widoczne w drugim.
- Usunięcie danych witryny w ustawieniach Safari usuwa też dziennik, dlatego rób kopie.

## Pierwsze kroki

1. **Konta** → dodaj konto (np. „mBank – konto osobiste”) z saldem początkowym i datą. W polu *Karty Apple Pay* wpisz nazwę karty tak, jak widać ją w aplikacji Portfel (np. „mBank Visa”). Płatności z tej karty trafią na to konto.
2. **Ustawienia → Kategorie**: zmień nazwy, emoji i kolory. Dodaj własne kategorie i ustaw miesięczne budżety.
3. Dodawaj operacje przyciskiem **+**: kwota, kategoria jednym dotknięciem, sprzedawca. Przelew między własnymi kontami nie jest wydatkiem.
4. **Reguły:** gdy w oknie „Do przypisania” zaznaczysz *Zapamiętaj*, kolejne płatności u tego sprzedawcy dostaną kategorię same. Wielkość liter i polskie znaki nie mają znaczenia, więc „ŻABKA” i „ZABKA” to ta sama reguła.

## Apple Pay: okienko z kategoriami przy każdej płatności

iOS nie pozwala stronom ani zwykłym aplikacjom czytać historii płatności z Portfela. Interfejs Apple (FinanceKit) działa tylko w USA i tylko dla Apple Card.

Działa natomiast **automatyzacja w aplikacji Skróty**. Uruchamia się przy każdej płatności Apple Pay dowolną kartą z Portfela i dostaje kwotę, sprzedawcę i nazwę karty. Skrót pokazuje listę Twoich kategorii, a wybór dopisuje do pliku tekstowego w telefonie. Aplikacja wczytuje ten plik jednym przyciskiem.

> Nie mogłem przetestować Skrótu na prawdziwym iPhonie. Opis bazuje na funkcjach iOS 17–26. Nazwy akcji mogą się nieco różnić między wersjami systemu (w nawiasach podaję nazwy angielskie).

### 1. Pliki tylko na iPhonie (bez iCloud)

Aby plik z wydatkami nie trafiał do iCloud: *Ustawienia → [Twoje imię] → iCloud → Drive* → wyłącz synchronizację dla aplikacji **Skróty**. Folder Skrótów będzie wtedy w *Plikach → Na moim iPhonie → Skróty*.

### 2. Lista kategorii

W aplikacji: *Finanse → Ustawienia → Apple Pay → Pobierz kategorie.txt*. Zapisz plik w *Na moim iPhonie → Skróty*. Gdy zmienisz kategorie w aplikacji, pobierz plik ponownie.

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

### 4. Import do aplikacji

*Finanse → Ustawienia → Apple Pay → Importuj wydatki.txt* → wybierz plik z folderu Skróty.
- Wpisy już zaimportowane są pomijane, więc plik może się wydłużać, a Ty importujesz go tyle razy, ile chcesz.
- Płatności bez kategorii otwierają się od razu w oknie **Do przypisania**: kategoria jednym dotknięciem, z opcją zapamiętania dla tego sprzedawcy.

Format wiersza, jeśli chcesz coś wkleić ręcznie (*Wklej wpisy ręcznie*):

```
2026-11-02T14:33:00+01:00;45,20 zł;Biedronka;Zakupy spożywcze;mBank Visa
```

### Ograniczenia automatyzacji

- Działa tylko dla **płatności Apple Pay** (telefonem lub zegarkiem). Nie obejmuje płatności fizyczną kartą, BLIK-iem, przelewów ani poleceń zapłaty. Te operacje dodasz z wyciągu CSV albo ręcznie.
- Niektórzy wydawcy kart nie przekazują kwoty albo nazwy sprzedawcy. Takie wiersze aplikacja pokaże jako błędne albo bez nazwy.
- Automatyzacja może się uruchomić także dla płatności odrzuconej. Taki wpis usuniesz w aplikacji.
- Przy zablokowanym telefonie lista może pojawić się jako powiadomienie. Dotknij go, aby wybrać kategorię.

## Import wyciągu z banku (CSV)

Automatyczne podłączenie konta bankowego (open banking, PSD2) wymaga licencjonowanego pośrednika i stałego połączenia z internetem. To sprzeczne z zasadą „dane nie wychodzą do sieci”, dlatego dziennik korzysta z eksportu CSV, który każdy polski bank udostępnia w bankowości internetowej.

1. W bankowości internetowej pobierz historię operacji w formacie **CSV**.
2. *Finanse → Ustawienia → Import wyciągu → Wybierz plik CSV*.
3. Aplikacja sama rozpozna:
   - kodowanie (UTF-8 albo Windows-1250, typowe dla polskich banków);
   - separator i wiersz nagłówka;
   - kolumny daty, kwoty, opisu i kontrahenta.

   Możesz je poprawić i zobaczyć podgląd przed importem.
4. Wybierz konto i kliknij **Importuj**. Reguły przypiszą kategorie.

Duplikaty są pomijane. Dotyczy to też płatności zapisanej wcześniej z Apple Pay, która pojawia się w wyciągu: ta sama kwota, data w odstępie do 3 dni i nazwa sprzedawcy w opisie operacji. Taka płatność nie zostanie policzona drugi raz, a dostanie przypisanie do konta z wyciągu.

## Raporty

- **Przegląd:**
  - wydatki, przychody, bilans i procent oszczędzanych przychodów w miesiącu;
  - wykres kategorii z budżetami;
  - wydatki dzień po dniu;
  - salda kont.
- **Raporty → Miesiąc:** porównanie każdej kategorii z poprzednim miesiącem i średnią z 3 miesięcy; sprzedawcy, u których wydajesz najwięcej.
- **Raporty → Rok:** przychody i wydatki miesiąc po miesiącu, kategorie w roku, średnie miesięczne.
- **Raporty → Własny okres:** dowolny zakres dat.
- **Transakcje:** wyszukiwanie i filtry (konto, kategoria, typ), eksport widocznych operacji do CSV (np. do Excela).
