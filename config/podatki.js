// Parametry podatkowe dla polskiego rezydenta i porównanie brokerów.
// Każda wartość ma źródło i status: 'oficjalne' (potwierdzone u źródła), 'prognoza' albo 'do weryfikacji'.
// Monitor podatkowy (src/taxmonitor.js) co miesiąc sprawdza zmiany i ostrzega, gdy coś się nie zgadza.
// Zmiany wprowadzasz ręcznie w tym pliku – narzędzie nigdy nie zmienia go samo.

export default {
  verifiedAt: '2026-11-02',
  belka: 0.19,

  limits: {
    2026: {
      ike: 28260,
      ikze: 11304,
      ikzeFirma: 16956,
      status: 'oficjalne',
      source: 'https://www.xtb.com/pl/ike',
    },
    2027: {
      ike: 30099,
      ikze: 12039.6,
      ikzeFirma: 18059.4,
      status: 'prognoza',
      note: 'Wyliczone z prognozy przeciętnego wynagrodzenia 10 033 zł (projekt budżetu na 2027 r.). Oficjalne obwieszczenie zwykle w grudniu.',
      source: 'https://kfas.pl/poradniki/ike-ikze-oki/',
    },
  },

  ike: { exitAge: 60, earlyExitTax: 0.19 },
  ikze: { exitAge: 65, exitTax: 0.1 },

  oki: {
    start: '2027-01-01',
    law: 'Ustawa z 3 lipca 2026 r. o osobistych kontach inwestycyjnych (Dz.U. 2026 poz. 1098)',
    exemption: 100000,
    savingsSubLimit: 25000,
    rates: { 2027: 0.0085 },
    rateRule: 'Od 2028 r.: 19% stopy referencyjnej NBP z 31 października roku poprzedniego, nie mniej niż 0,1%. Stawkę ogłasza Minister Finansów do 30 listopada.',
    foreignEtfExempt: false,
    status: 'oficjalne (ustawa), szczegóły u brokerów do weryfikacji',
    sources: ['https://finwire.pl/konta/oki', 'https://inwestomat.eu/jak-ma-dzialac-osobiste-konto-inwestycyjne-oki/'],
  },

  // Krańcowa stawka podatku dochodowego – decyduje o wartości odliczenia wpłat na IKZE.
  taxForms: {
    skala12: { label: 'Skala podatkowa – próg 12%', rate: 0.12 },
    skala32: { label: 'Skala podatkowa – próg 32%', rate: 0.32 },
    liniowy: { label: 'Podatek liniowy 19%', rate: 0.19 },
    ryczalt: { label: 'Ryczałt (wpisz swoją stawkę)', rate: null },
  },

  // Koszty jednej zmiany pozycji w GEM: sprzedaż starego ETF-u i zakup nowego.
  // fx – opłata za jedno przewalutowanie, commission – prowizja od jednej transakcji.
  brokers: [
    {
      id: 'xtb',
      name: 'XTB',
      accounts: { zwykle: 'tak', ike: 'tak', ikze: 'tak', oki: 'zapowiedź na 2027 r.' },
      ikeCurrencies: 'tylko PLN',
      ikeUsd: false,
      regularUsd: true,
      fx: 0.005,
      commission: 0,
      commissionNote: '0% do 100 000 EUR obrotu miesięcznie, potem 0,2% (min. 10 EUR)',
      status: { fx: 'oficjalne', commission: 'oficjalne', ikeUsd: 'oficjalne' },
      pros: ['0% prowizji', 'ułamkowe ETF-y', 'bardzo duża oferta ETF-ów', 'subkonta USD/EUR na koncie zwykłym', 'PIT-8C'],
      cons: ['IKE/IKZE tylko w PLN, więc każda zmiana pozycji to dwa przewalutowania po 0,5%'],
      sources: ['https://www.xtb.com/pl/ike', 'https://www.xtb.com/pl/konto-i-oplaty'],
    },
    {
      id: 'mbank',
      name: 'mBank eMakler',
      accounts: { zwykle: 'tak', ike: 'tak', ikze: 'tak', oki: 'brak informacji' },
      ikeCurrencies: 'tylko PLN',
      ikeUsd: false,
      regularUsd: true,
      fx: 0.0015,
      commission: 0,
      commissionNote: '0 zł za ponad 550 ETF-ów na IKE/IKZE (lista ISIN na mdm.pl); poza listą 0,29% (min. 14–19 zł)',
      status: { fx: 'do weryfikacji', commission: 'oficjalne', ikeUsd: 'do weryfikacji' },
      pros: ['0 zł prowizji za ETF-y z listy na IKE/IKZE', 'niższa marża walutowa niż w XTB (do weryfikacji)'],
      cons: ['brak ułamkowych ETF-ów', 'mniejsza oferta ETF-ów'],
      sources: ['https://www.mbank.pl/indywidualny/inwestycje-i-oszczednosci/emerytura/ike-emakler', 'https://etfkalkulator.pl/blog/gdzie-otworzyc-ike-2026-porownanie-brokerow.html'],
    },
    {
      id: 'bossa',
      name: 'DM BOŚ (bossa)',
      accounts: { zwykle: 'tak', ike: 'tak', ikze: 'tak', oki: 'brak informacji' },
      ikeCurrencies: 'PLN, USD, EUR (do weryfikacji)',
      ikeUsd: true,
      regularUsd: true,
      fx: 0.001,
      commission: 0,
      commissionAfterPromo: 0.0029,
      commissionNote: '0% na ETF-y na IKE/IKZE do 28.02.2027 (od października 2026 z miesięcznymi limitami), potem 0,29%',
      status: { fx: 'do weryfikacji', commission: 'do weryfikacji', ikeUsd: 'do weryfikacji' },
      pros: ['subkonta walutowe także na IKE/IKZE (wg porównań, do potwierdzenia)', 'niska marża walutowa (do weryfikacji)'],
      cons: ['promocja na ETF-y kończy się w lutym 2027', '150 zł za zerwanie umowy IKE/IKZE w ciągu 12 miesięcy'],
      sources: ['https://etfkalkulator.pl/blog/gdzie-otworzyc-ike-2026-porownanie-brokerow.html', 'https://www.analizy.pl/puls-rynku/39381/dm-bos-przedluza-zerowe-prowizje-na-etf-y-ike-ikze'],
    },
    {
      id: 'ibkr',
      name: 'Interactive Brokers',
      accounts: { zwykle: 'tak', ike: 'nie', ikze: 'nie', oki: 'nie' },
      ikeCurrencies: '–',
      ikeUsd: null,
      regularUsd: true,
      fx: 0.0001,
      commission: 0.0005,
      commissionNote: 'ok. 0,05% z minimum na giełdach europejskich (taryfa zależna od rynku)',
      status: { fx: 'do weryfikacji', commission: 'do weryfikacji', ikeUsd: '–' },
      pros: ['bardzo tanie przewalutowanie', 'dostęp do niemal wszystkich giełd'],
      cons: ['brak IKE, IKZE i OKI', 'brak PIT-8C – zysk rozliczasz sam (Portfel liczy go wg kursów NBP z dnia poprzedniego)'],
      sources: ['https://www.interactivebrokers.com/pl/pricing/commissions-home.php'],
    },
  ],

  // Zmiany w przygotowaniu – obserwowane, ale jeszcze nieobowiązujące.
  watch: [
    {
      title: 'IKE+ zamiast IKE i IKZE (propozycja)',
      status: 'propozycja grupy roboczej przy Radzie Dialogu Społecznego (październik 2026); Ministerstwo Finansów sceptyczne; brak projektu ustawy',
      text: 'Jedno konto IKE+ z limitem równym sumie limitów IKE i IKZE, wypłata od 60. roku życia, premie za długie oszczędzanie. Do czasu zmiany ustawy obowiązują obecne IKE i IKZE. Środki już zgromadzone powinny zostać objęte przepisami przejściowymi – narzędzie śledzi postęp prac.',
      source: 'https://www.bankier.pl/wiadomosc/Rewolucja-w-oszczedzaniu-Jedno-konto-IKE-i-wyplata-pieniedzy-w-wieku-60-lat-9218328.html',
    },
    {
      title: 'Oficjalne limity IKE/IKZE na 2027 r.',
      status: 'oczekiwane obwieszczenie (zwykle w grudniu)',
      text: 'Media podają limit IKZE 12 039,60 zł, zgodny z prognozą przeciętnego wynagrodzenia (10 033 zł). Po publikacji obwieszczenia zmień status w tym pliku na „oficjalne”.',
      source: 'https://kfas.pl/poradniki/ike-ikze-oki/',
    },
  ],

  // Kalendarz inwestora. Przypomnienia trafiają do powiadomień raz w roku.
  calendar: [
    { date: '01-02', title: 'Nowe limity IKE/IKZE', text: 'Ruszył nowy rok wpłat na IKE i IKZE. Wpłata na początku roku wydłuża czas pracy kapitału bez podatku.', notify: true },
    { date: '02-28', title: 'PIT-8C i zestawienia', text: 'Do końca lutego brokerzy przesyłają PIT-8C (konto zwykłe) i informacje o wpłatach na IKZE.', notify: false },
    { date: '04-20', title: 'Termin PIT-38 i odliczenia IKZE', text: 'Do 30 kwietnia złóż PIT-38 (zyski z konta zwykłego) i odlicz wpłaty na IKZE w rocznym PIT.', notify: true },
    { date: '05-20', title: 'Podatek od OKI', text: 'Do 31 maja rozlicz w e-Urzędzie Skarbowym podatek od wartości aktywów na OKI (pierwszy raz w 2028 r. za 2027 r.).', notify: true, fromYear: 2028 },
    { date: '11-30', title: 'Stawka podatku OKI', text: 'Do 30 listopada Minister Finansów ogłasza stawkę podatku od wartości aktywów OKI na kolejny rok.', notify: false, fromYear: 2027 },
    { date: '12-01', title: 'Miesiąc na wpłaty IKE/IKZE', text: 'Zostaje miesiąc na wykorzystanie tegorocznych limitów IKE i IKZE. Niewykorzystany limit przepada. Przelew zrób z zapasem, najpóźniej ok. 20 grudnia.', notify: true },
    { date: '12-15', title: 'Realizacja strat na koncie zwykłym', text: 'Jeśli na koncie zwykłym masz w tym roku zysk, a któraś pozycja jest na minusie, sprzedaż (i ewentualny ponowny zakup) przed końcem roku obniży podatek. Rozliczenie trwa 2 sesje, więc nie zostawiaj tego na ostatni dzień.', notify: true },
  ],
};
