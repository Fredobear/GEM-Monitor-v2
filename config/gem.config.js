// Konfiguracja GEM Monitor.
// Zmieniaj tylko wartości po dwukropkach. Opis każdej opcji: ANALIZA_GEM.md i README.md.

export default {
  strategy: {
    // 'klasyczny'   – oryginalny GEM Antonacciego: USA vs akcje poza USA, filtr: USA vs bony skarbowe.
    // 'rozszerzony' – USA vs rynki rozwinięte bez USA vs rynki wschodzące (ten sam filtr).
    variant: 'klasyczny',

    // Okno momentum w miesiącach (Antonacci: 12).
    lookbackMonths: 12,

    // Pominięcie ostatnich N miesięcy (wariant „12-1”). Oryginał: 0.
    skipMonths: 0,

    // Bezpieczna przystań przy ujemnym trendzie:
    // 'obligacje'                 – zawsze obligacje zagregowane USA (oryginał).
    // 'lepsze_z_obligacji_i_bonow' – obligacje albo bony skarbowe, zależnie od tego, co ma lepsze 12M momentum.
    safeAssetRule: 'obligacje',

    // Bufor w punktach procentowych, który chroni przed częstymi zmianami między rynkami akcji
    // w tym samym reżimie. Oryginał: 0. Wyjście do bezpiecznej przystani nigdy nie jest buforowane.
    switchBufferPct: 0,

    // Poniżej tej różnicy (pp) sygnał jest oznaczany jako „na granicy”.
    nearTiePct: 1.0,
  },

  variants: {
    klasyczny: {
      equities: ['US', 'EXUS'],
      absoluteRef: 'US', // 'US' (oryginał) albo 'WINNER' – najlepszy rynek akcji porównywany z bonami
      hurdle: 'TBILLS',
      safe: ['BONDS', 'TBILLS'],
    },
    rozszerzony: {
      equities: ['US', 'DEVX', 'EM'],
      absoluteRef: 'US',
      hurdle: 'TBILLS',
      safe: ['BONDS', 'TBILLS'],
    },
  },

  // Każdy rynek ma: ETF-proxy notowany w USA (z niego liczone jest momentum – długa historia,
  // dywidendy uwzględnione) oraz instrument do kupienia w XTB (UCITS, potwierdzony w ofercie XTB).
  assets: {
    US: {
      name: 'Akcje USA',
      index: 'S&P 500',
      proxy: 'SPY',
      xtb: {
        ticker: 'CSPX.UK',
        name: 'iShares Core S&P 500 UCITS ETF (Acc)',
        isin: 'IE00B5BMR087',
        exchange: 'LSE (Londyn)',
        currency: 'USD',
        ter: 0.07,
      },
      // Notowania tego samego funduszu w różnych walutach (w XTB). Waluta notowania nie zmienia ekspozycji walutowej.
      listings: [
        { ticker: 'CSPX.UK', currency: 'USD', exchange: 'LSE' },
        { ticker: 'SXR8.DE', currency: 'EUR', exchange: 'Xetra' },
      ],
      plnAlternative: { ticker: 'ETFBSPXPL.PL', name: 'Beta ETF S&P 500 PLN-Hedged', note: 'inny fundusz: zabezpieczony walutowo do PLN, wyższe koszty – sprawdź KID' },
    },
    EXUS: {
      name: 'Akcje poza USA',
      index: 'MSCI ACWI ex USA',
      proxy: 'ACWX',
      xtb: {
        ticker: 'EXUS.DE',
        name: 'Xtrackers MSCI World ex USA UCITS ETF 1C',
        isin: 'IE0006WW1TQ4',
        exchange: 'Xetra (Frankfurt)',
        currency: 'EUR',
        ter: 0.15,
        note: 'W XTB nie ma ETF-u UCITS na pełny MSCI ACWI ex USA. EXUS.DE obejmuje rynki rozwinięte bez USA (ok. 72% indeksu ACWI ex USA). Opcjonalnie: ok. 72% EXUS.DE + 28% EIMI.UK odtwarza indeks wiernie.',
      },
      listings: [
        { ticker: 'EXUS.DE', currency: 'EUR', exchange: 'Xetra' },
        { ticker: 'XMWX.UK', currency: 'GBP', exchange: 'LSE' },
      ],
    },
    DEVX: {
      name: 'Rynki rozwinięte bez USA',
      index: 'MSCI EAFE (Europa, Japonia, Australia i inne)',
      proxy: 'EFA',
      xtb: {
        ticker: 'EXUS.DE',
        name: 'Xtrackers MSCI World ex USA UCITS ETF 1C',
        isin: 'IE0006WW1TQ4',
        exchange: 'Xetra (Frankfurt)',
        currency: 'EUR',
        ter: 0.15,
      },
      listings: [
        { ticker: 'EXUS.DE', currency: 'EUR', exchange: 'Xetra' },
        { ticker: 'XMWX.UK', currency: 'GBP', exchange: 'LSE' },
      ],
    },
    EM: {
      name: 'Rynki wschodzące',
      index: 'MSCI Emerging Markets IMI',
      proxy: 'IEMG',
      xtb: {
        ticker: 'EIMI.UK',
        name: 'iShares Core MSCI EM IMI UCITS ETF (Acc)',
        isin: 'IE00BKM4GZ66',
        exchange: 'LSE (Londyn)',
        currency: 'USD',
        ter: 0.18,
      },
      listings: [
        { ticker: 'EIMI.UK', currency: 'USD', exchange: 'LSE' },
        { ticker: 'IS3N.DE', currency: 'EUR', exchange: 'Xetra' },
        { ticker: 'EMIM.UK', currency: 'GBP', exchange: 'LSE' },
      ],
    },
    BONDS: {
      name: 'Obligacje USA (zagregowane)',
      index: 'Bloomberg US Aggregate',
      proxy: 'AGG',
      xtb: {
        ticker: 'IUAA.UK',
        name: 'iShares US Aggregate Bond UCITS ETF (Acc)',
        isin: 'IE00BYXYYM63',
        exchange: 'LSE (Londyn)',
        currency: 'USD',
        ter: 0.25,
      },
      listings: [{ ticker: 'IUAA.UK', currency: 'USD', exchange: 'LSE' }],
    },
    TBILLS: {
      name: 'Bony skarbowe USA (odpowiednik gotówki)',
      index: 'US Treasury Bills 1–3M',
      proxy: 'BIL',
      xtb: {
        ticker: 'IB01.UK',
        name: 'iShares $ Treasury Bond 0-1yr UCITS ETF (Acc)',
        isin: 'IE00BGSF1X88',
        exchange: 'LSE (Londyn)',
        currency: 'USD',
        ter: 0.07,
      },
      listings: [{ ticker: 'IB01.UK', currency: 'USD', exchange: 'LSE' }],
    },
  },

  // Waluty dostępne na rachunkach w XTB (doradca waluty zakupu). IKE i IKZE w XTB są prowadzone tylko w PLN.
  // Waluty OKI nie są jeszcze znane – do czasu potwierdzenia przyjmujemy wariant ostrożny (tylko PLN).
  accountCurrencies: {
    IKE: ['PLN'],
    IKZE: ['PLN'],
    OKI: ['PLN'],
    ZWYKLE: ['PLN', 'USD', 'EUR'],
  },

  // Rynki pokazywane w rankingu na panelu (niezależnie od wariantu).
  tracked: ['US', 'EXUS', 'DEVX', 'EM', 'BONDS', 'TBILLS'],

  // Instrumenty do wyceny portfela (zakładka GEM → Mój portfel GEM). Wycena = Twoja cena transakcyjna przesunięta o zmianę
  // indeksu-proxy (ETF z USA z rynku `proxy`, przeliczony na walutę instrumentu kursami NBP).
  // `av` – symbol w Alpha Vantage: jeśli działa, używane są rzeczywiste ceny zamknięcia.
  portfolio: {
    instruments: {
      'CSPX.UK': { name: 'iShares Core S&P 500 UCITS ETF (Acc)', currency: 'USD', proxy: 'US', av: 'CSPX.LON' },
      'EXUS.DE': { name: 'Xtrackers MSCI World ex USA UCITS ETF 1C', currency: 'EUR', proxy: 'DEVX', av: 'EXUS.DEX' },
      'IUAA.UK': { name: 'iShares US Aggregate Bond UCITS ETF (Acc)', currency: 'USD', proxy: 'BONDS', av: 'IUAA.LON' },
      'IB01.UK': { name: 'iShares $ Treasury Bond 0-1yr UCITS ETF (Acc)', currency: 'USD', proxy: 'TBILLS', av: 'IB01.LON' },
      'EIMI.UK': { name: 'iShares Core MSCI EM IMI UCITS ETF (Acc)', currency: 'USD', proxy: 'EM', av: 'EIMI.LON' },
      'SXR8.DE': { name: 'iShares Core S&P 500 UCITS ETF (Acc) – EUR', currency: 'EUR', proxy: 'US', av: 'SXR8.DEX' },
      'IS3N.DE': { name: 'iShares Core MSCI EM IMI UCITS ETF (Acc) – EUR', currency: 'EUR', proxy: 'EM', av: 'IS3N.DEX' },
      'XMWX.UK': { name: 'Xtrackers MSCI World ex USA UCITS ETF 1C – GBP', currency: 'GBP', proxy: 'DEVX' },
    },
    historyStart: '2023-01-01',
  },

  data: {
    // Kolejność dostawców danych. Każdy wymaga darmowego klucza (README → krok 2).
    providers: ['tiingo', 'alphavantage'],
    // Rozbieżność 12M stóp zwrotu między dostawcami (pp), powyżej której pojawia się ostrzeżenie.
    crossCheckTolerancePct: 0.75,
    // Maksymalny wiek danych (dni kalendarzowe), zanim narzędzie uzna je za nieaktualne.
    maxStaleDays: 5,
  },

  notifications: {
    // Powiadomienie o nowym sygnale miesięcznym wysyłane jest zawsze.
    notifyPreviewFlip: true, // ostrzeżenie, gdy w trakcie miesiąca zmienia się wstępny sygnał
    weeklyDigestWeekday: 1, // 1 = poniedziałek, 0 = wyłączone
  },

  ai: {
    // Komentarz AI (Claude) generowany jest tylko, gdy ustawisz ANTHROPIC_API_KEY.
    model: 'claude-opus-5-5',
    effort: 'medium',
    maxWebSearches: 5,
    // 'sygnal_i_tydzien' – przy sygnale miesięcznym i w cotygodniowym podsumowaniu; 'codziennie' – przy każdym uruchomieniu.
    frequency: 'sygnal_i_tydzien',
    // Codzienna notatka rynkowa (zakładka Rynki → Przegląd): streszczenie wydarzeń, wpływ na rynki i scenariusze.
    // Sonnet wystarcza do streszczania wiadomości i kosztuje ok. połowę mniej niż Opus (orientacyjnie 3–4 USD miesięcznie).
    marketNote: { enabled: true, model: 'claude-sonnet-5-5', effort: 'medium', maxWebSearches: 4 },
  },

  // Monitor przepisów podatkowych w Polsce (zakładka Rynki → Podatki).
  taxNews: {
    maxAgeDays: 14,
    feeds: [
      {
        name: 'Google News – podatki inwestora',
        url: 'https://news.google.com/rss/search?q=(IKE+OR+IKZE+OR+%22konto+OKI%22+OR+%22Osobiste+Konto+Inwestycyjne%22+OR+%22podatek+Belki%22+OR+PIT-38+OR+%22limit+IKE%22)+when:14d&hl=pl&gl=PL&ceid=PL:pl',
      },
      {
        name: 'Google News – brokerzy',
        url: 'https://news.google.com/rss/search?q=(XTB+OR+%22mBank+eMakler%22+OR+bossa+OR+%22DM+BO%C5%9A%22)+(IKE+OR+IKZE+OR+OKI+OR+prowizja+OR+op%C5%82aty)+when:14d&hl=pl&gl=PL&ceid=PL:pl',
      },
      { name: 'Bankier.pl Finanse', url: 'https://www.bankier.pl/rss/finanse.xml' },
      { name: 'Money.pl', url: 'https://www.money.pl/rss/rss.xml' },
    ],
  },

  news: {
    maxAgeHours: 72,
    feeds: [
      { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
      { name: 'BBC Business', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
      { name: 'MarketWatch', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
      { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml' },
      { name: 'Fed', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
      { name: 'EBC', url: 'https://www.ecb.europa.eu/rss/press.html' },
      { name: 'Bankier.pl', url: 'https://www.bankier.pl/rss/wiadomosci.xml' },
      { name: 'Bankier.pl Giełda', url: 'https://www.bankier.pl/rss/gielda.xml' },
      { name: 'Parkiet', url: 'https://www.parkiet.com/rss_main' },
      { name: 'Puls Biznesu', url: 'https://www.pb.pl/rss/najnowsze.xml' },
      { name: 'CNBC', url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114' },
      { name: 'MarketWatch Market Pulse', url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse' },
      {
        name: 'Google News',
        url: 'https://news.google.com/rss/search?q=(stocks+OR+markets)+(geopolitics+OR+war+OR+sanctions+OR+tariffs+OR+election)+when:3d&hl=en-US&gl=US&ceid=US:en',
      },
      {
        name: 'Google News PL',
        url: 'https://news.google.com/rss/search?q=(gie%C5%82da+OR+rynki)+(geopolityka+OR+wojna+OR+c%C5%82a+OR+wybory)+when:3d&hl=pl&gl=PL&ceid=PL:pl',
      },
    ],
  },
};
