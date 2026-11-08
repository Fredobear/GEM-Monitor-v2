// Kalendarz wydarzeń do zakładki Rynki → Przegląd (sekcja „Najbliższe dni”).
// Daty decyzji banków centralnych (dzień ogłoszenia, RRRR-MM-DD). Terminy publikują:
//  • Fed:  https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm (drugi dzień posiedzenia),
//  • EBC:  https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html (posiedzenie w sprawie polityki pieniężnej, dzień 2),
//  • RPP:  https://nbp.pl/polityka-pieniezna/decyzje-rpp/terminarz-posiedzen-rpp/ (drugi dzień posiedzenia decyzyjnego).
// Uzupełnij kolejny rok, gdy banki opublikują terminy (zwykle latem lub jesienią roku poprzedniego).
// Aplikacja ostrzeże, gdy zabraknie przyszłych terminów Fed.
// Dane cykliczne (raport z rynku pracy w USA, szybki szacunek inflacji w Polsce) i dzień nowego sygnału GEM
// aplikacja wylicza sama – jako terminy orientacyjne.

export default {
  fed: ['2026-12-09', '2027-01-27', '2027-03-17', '2027-04-28', '2027-06-09', '2027-07-28', '2027-09-15', '2027-10-27', '2027-12-08'],
  ebc: ['2026-12-17', '2027-02-04', '2027-03-18', '2027-04-29', '2027-06-10', '2027-07-22', '2027-09-09', '2027-10-28', '2027-12-16'],
  // Terminarz RPP na 2027 r. NBP publikuje zwykle pod koniec roku – dopisz go wtedy.
  rpp: ['2026-12-02'],
  // Własne wydarzenia, np. { date: '2027-01-15', title: 'Wypłata premii – dopłata do IKE', note: '' }.
  inne: [],
};
