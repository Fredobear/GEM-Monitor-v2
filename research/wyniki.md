# Wyniki backtestu GEM (dane: 1990-07 – 2026-09)

Źródła: Ken French Data Library (akcje, bony skarbowe), FRED (rentowności 5L/10L → obligacje). Wygenerowano automatycznie poleceniem `npm run research`.

## Cały okres (1991-08 – 2026-09)

| Strategia | CAGR | Zmienność | Sharpe | Maks. obsunięcie | Najgorsze 12 mies. | Zmiany/rok |
|---|---:|---:|---:|---:|---:|---:|
| GEM klasyczny (oryginał) | 11.7% | 13.0% | 0.73 | -24.4% | -18.5% | 1.4 |
| GEM + wybór obligacje/bony | 11.7% | 12.9% | 0.73 | -24.6% | -15.9% | 1.5 |
| GEM rozszerzony (USA / rozwinięte / wschodzące) | 13.6% | 14.9% | 0.77 | -25.6% | -19.1% | 2.0 |
| Tylko filtr trendu (USA albo obligacje) | 11.1% | 12.3% | 0.71 | -24.3% | -18.5% | 0.7 |
| GEM z buforem 2 pp | 11.6% | 13.0% | 0.73 | -24.3% | -20.5% | 1.1 |
| GEM 12-1 (bez ostatniego miesiąca) | 12.0% | 13.3% | 0.74 | -24.0% | -20.5% | 1.7 |
| Kup i trzymaj: akcje USA | 11.1% | 15.1% | 0.61 | -50.3% | -42.6% | 0.0 |
| Kup i trzymaj: akcje poza USA | 7.1% | 16.0% | 0.36 | -57.0% | -51.2% | 0.0 |
| 60/40: akcje USA / obligacje | 8.7% | 9.1% | 0.69 | -29.2% | -25.6% | 0.0 |

## Przed publikacją książki (1991-08 – 2013-12)

| Strategia | CAGR | Zmienność | Sharpe | Maks. obsunięcie | Najgorsze 12 mies. | Zmiany/rok |
|---|---:|---:|---:|---:|---:|---:|
| GEM klasyczny (oryginał) | 14.4% | 12.8% | 0.90 | -18.7% | -15.9% | 1.0 |
| GEM + wybór obligacje/bony | 14.2% | 12.7% | 0.88 | -18.7% | -15.9% | 1.1 |
| GEM rozszerzony (USA / rozwinięte / wschodzące) | 17.5% | 15.2% | 0.95 | -23.4% | -19.1% | 1.7 |
| Tylko filtr trendu (USA albo obligacje) | 12.7% | 11.9% | 0.83 | -17.7% | -11.7% | 0.6 |
| GEM z buforem 2 pp | 13.9% | 12.8% | 0.86 | -23.2% | -20.5% | 0.9 |
| GEM 12-1 (bez ostatniego miesiąca) | 13.4% | 12.8% | 0.83 | -23.2% | -20.5% | 1.4 |
| Kup i trzymaj: akcje USA | 9.8% | 15.1% | 0.51 | -50.3% | -42.6% | 0.0 |
| Kup i trzymaj: akcje poza USA | 7.1% | 16.9% | 0.32 | -57.0% | -51.2% | 0.0 |
| 60/40: akcje USA / obligacje | 8.7% | 9.0% | 0.66 | -29.2% | -25.6% | 0.0 |

## Po publikacji (2014-01 – 2026-09)

| Strategia | CAGR | Zmienność | Sharpe | Maks. obsunięcie | Najgorsze 12 mies. | Zmiany/rok |
|---|---:|---:|---:|---:|---:|---:|
| GEM klasyczny (oryginał) | 7.1% | 13.4% | 0.44 | -24.4% | -18.5% | 2.1 |
| GEM + wybór obligacje/bony | 7.6% | 13.1% | 0.48 | -24.6% | -15.9% | 2.2 |
| GEM rozszerzony (USA / rozwinięte / wschodzące) | 7.1% | 14.1% | 0.43 | -25.6% | -18.5% | 2.6 |
| Tylko filtr trendu (USA albo obligacje) | 8.2% | 13.0% | 0.53 | -24.3% | -18.5% | 0.9 |
| GEM z buforem 2 pp | 7.8% | 13.3% | 0.50 | -24.3% | -18.5% | 1.3 |
| GEM 12-1 (bez ostatniego miesiąca) | 9.7% | 14.1% | 0.60 | -24.0% | -19.3% | 2.4 |
| Kup i trzymaj: akcje USA | 13.4% | 15.0% | 0.79 | -24.8% | -19.9% | 0.0 |
| Kup i trzymaj: akcje poza USA | 7.2% | 14.3% | 0.43 | -27.8% | -25.5% | 0.0 |
| 60/40: akcje USA / obligacje | 8.6% | 9.4% | 0.73 | -20.3% | -16.8% | 0.0 |

## Zachowanie w kryzysach (skumulowana stopa zwrotu w oknie)

| Okno | GEM klasyczny (oryginał) | GEM + wybór obligacje/bony | GEM rozszerzony (USA / rozwinięte / wschodzące) | Tylko filtr trendu (USA albo obligacje) | GEM z buforem 2 pp | GEM 12-1 (bez ostatniego miesiąca) | Kup i trzymaj: akcje USA | Kup i trzymaj: akcje poza USA | 60/40: akcje USA / obligacje |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Bańka internetowa (09.2000–09.2002) | 3.9% | 1.5% | 3.9% | 3.9% | 3.9% | 3.9% | -45.0% | -40.5% | -21.3% |
| Kryzys finansowy (11.2007–02.2009) | -7.7% | -7.7% | -10.3% | -3.6% | -7.7% | -7.7% | -50.3% | -57.0% | -29.2% |
| Krach COVID (02–03.2020) | -20.2% | -20.2% | -20.2% | -20.2% | -20.2% | -20.2% | -20.2% | -21.4% | -10.0% |
| Bessa 2022 (akcje i obligacje) | -18.1% | -13.2% | -18.1% | -18.1% | -18.1% | -18.9% | -19.9% | -15.7% | -16.8% |
| Odbicie po kryzysie (03.2009–12.2009) | 4.2% | 4.2% | 8.4% | 8.0% | 4.2% | 4.2% | 55.7% | 71.9% | 29.5% |

## Koszty i podatki inwestora z Polski w XTB (cały okres)

| Scenariusz | Strategia | CAGR | CAGR po likwidacji (po podatku) | Maks. obsunięcie |
|---|---|---:|---:|---:|
| Bez kosztów i podatków | GEM klasyczny (oryginał) | 11.7% | 11.7% | -24.4% |
| Bez kosztów i podatków | GEM + wybór obligacje/bony | 11.7% | 11.7% | -24.6% |
| Bez kosztów i podatków | GEM z buforem 2 pp | 11.6% | 11.6% | -24.3% |
| Bez kosztów i podatków | GEM rozszerzony (USA / rozwinięte / wschodzące) | 13.6% | 13.6% | -25.6% |
| Bez kosztów i podatków | Kup i trzymaj: akcje USA | 11.1% | 11.1% | -50.3% |
| IKE/IKZE w XTB (tylko PLN: 2 × 0,5% FX) | GEM klasyczny (oryginał) | 10.1% | 10.1% | -28.1% |
| IKE/IKZE w XTB (tylko PLN: 2 × 0,5% FX) | GEM + wybór obligacje/bony | 10.0% | 10.0% | -28.8% |
| IKE/IKZE w XTB (tylko PLN: 2 × 0,5% FX) | GEM z buforem 2 pp | 10.4% | 10.4% | -27.7% |
| IKE/IKZE w XTB (tylko PLN: 2 × 0,5% FX) | GEM rozszerzony (USA / rozwinięte / wschodzące) | 11.4% | 11.4% | -29.7% |
| IKE/IKZE w XTB (tylko PLN: 2 × 0,5% FX) | Kup i trzymaj: akcje USA | 11.1% | 11.1% | -50.3% |
| IKE/IKZE z tańszym FX (2 × 0,15%, np. mBank – do weryfikacji) | GEM klasyczny (oryginał) | 11.2% | 11.2% | -25.5% |
| IKE/IKZE z tańszym FX (2 × 0,15%, np. mBank – do weryfikacji) | GEM + wybór obligacje/bony | 11.2% | 11.2% | -25.7% |
| IKE/IKZE z tańszym FX (2 × 0,15%, np. mBank – do weryfikacji) | GEM z buforem 2 pp | 11.3% | 11.3% | -25.2% |
| IKE/IKZE z tańszym FX (2 × 0,15%, np. mBank – do weryfikacji) | GEM rozszerzony (USA / rozwinięte / wschodzące) | 13.0% | 13.0% | -26.7% |
| IKE/IKZE z tańszym FX (2 × 0,15%, np. mBank – do weryfikacji) | Kup i trzymaj: akcje USA | 11.1% | 11.1% | -50.3% |
| IKE/IKZE z subkontem USD (prowizja 2 × 0,29%, FX 0,1% przy ETF w EUR) | GEM klasyczny (oryginał) | 10.7% | 10.7% | -26.8% |
| IKE/IKZE z subkontem USD (prowizja 2 × 0,29%, FX 0,1% przy ETF w EUR) | GEM + wybór obligacje/bony | 10.6% | 10.6% | -26.9% |
| IKE/IKZE z subkontem USD (prowizja 2 × 0,29%, FX 0,1% przy ETF w EUR) | GEM z buforem 2 pp | 10.9% | 10.9% | -26.2% |
| IKE/IKZE z subkontem USD (prowizja 2 × 0,29%, FX 0,1% przy ETF w EUR) | GEM rozszerzony (USA / rozwinięte / wschodzące) | 12.3% | 12.3% | -27.9% |
| IKE/IKZE z subkontem USD (prowizja 2 × 0,29%, FX 0,1% przy ETF w EUR) | Kup i trzymaj: akcje USA | 11.1% | 11.1% | -50.3% |
| OKI od 2027 (0,85% wartości rocznie, subkonto USD) | GEM klasyczny (oryginał) | 10.3% | 10.3% | -26.7% |
| OKI od 2027 (0,85% wartości rocznie, subkonto USD) | GEM + wybór obligacje/bony | 10.3% | 10.3% | -25.6% |
| OKI od 2027 (0,85% wartości rocznie, subkonto USD) | GEM z buforem 2 pp | 10.4% | 10.4% | -25.2% |
| OKI od 2027 (0,85% wartości rocznie, subkonto USD) | GEM rozszerzony (USA / rozwinięte / wschodzące) | 12.3% | 12.3% | -26.9% |
| OKI od 2027 (0,85% wartości rocznie, subkonto USD) | Kup i trzymaj: akcje USA | 10.1% | 10.1% | -50.9% |
| Konto zwykłe PLN (2 × 0,5% FX + 19% Belka) | GEM klasyczny (oryginał) | 8.4% | 8.3% | -28.9% |
| Konto zwykłe PLN (2 × 0,5% FX + 19% Belka) | GEM + wybór obligacje/bony | 8.3% | 8.2% | -29.0% |
| Konto zwykłe PLN (2 × 0,5% FX + 19% Belka) | GEM z buforem 2 pp | 8.7% | 8.6% | -29.2% |
| Konto zwykłe PLN (2 × 0,5% FX + 19% Belka) | GEM rozszerzony (USA / rozwinięte / wschodzące) | 9.4% | 9.3% | -29.9% |
| Konto zwykłe PLN (2 × 0,5% FX + 19% Belka) | Kup i trzymaj: akcje USA | 11.1% | 10.4% | -50.3% |
| Konto zwykłe USD (FX tylko przy ETF w EUR + 19% Belka) | GEM klasyczny (oryginał) | 9.5% | 9.4% | -27.0% |
| Konto zwykłe USD (FX tylko przy ETF w EUR + 19% Belka) | GEM + wybór obligacje/bony | 9.5% | 9.4% | -27.0% |
| Konto zwykłe USD (FX tylko przy ETF w EUR + 19% Belka) | GEM z buforem 2 pp | 9.7% | 9.5% | -26.8% |
| Konto zwykłe USD (FX tylko przy ETF w EUR + 19% Belka) | GEM rozszerzony (USA / rozwinięte / wschodzące) | 11.3% | 11.2% | -25.8% |
| Konto zwykłe USD (FX tylko przy ETF w EUR + 19% Belka) | Kup i trzymaj: akcje USA | 11.1% | 10.4% | -50.3% |

## Wrażliwość na długość okna momentum (GEM klasyczny)

| Okno | CAGR całość | Maks. obs. całość | CAGR przed 2014 | CAGR po 2014 | Zmiany/rok |
|---|---:|---:|---:|---:|---:|
| 3 mies. | 12.9% | -21.5% | 15.7% | 8.0% | 4.0 |
| 6 mies. | 10.7% | -27.6% | 14.1% | 5.0% | 2.6 |
| 9 mies. | 11.3% | -23.9% | 13.6% | 7.5% | 1.9 |
| 12 mies. | 11.7% | -24.4% | 14.4% | 7.1% | 1.4 |

## Stopy zwrotu w latach kalendarzowych

| Rok | GEM | GEM + bony | Akcje USA | 60/40 |
|---|---:|---:|---:|---:|
| 1992 | 9.8% | 9.8% | 9.8% | 8.5% |
| 1993 | 9.3% | 9.3% | 11.2% | 11.1% |
| 1994 | 7.6% | 8.9% | -0.1% | -2.4% |
| 1995 | 35.2% | 29.8% | 36.9% | 30.6% |
| 1996 | 21.2% | 21.2% | 21.2% | 13.0% |
| 1997 | 31.2% | 31.2% | 31.2% | 22.6% |
| 1998 | 12.8% | 12.8% | 24.3% | 20.4% |
| 1999 | 23.6% | 23.6% | 25.2% | 12.4% |
| 2000 | -15.9% | -15.9% | -11.6% | -1.5% |
| 2001 | 6.4% | 6.4% | -11.2% | -3.8% |
| 2002 | 13.4% | 10.9% | -21.1% | -7.9% |
| 2003 | 30.5% | 30.5% | 31.7% | 18.6% |
| 2004 | 23.6% | 23.6% | 11.9% | 8.4% |
| 2005 | 19.6% | 19.6% | 6.1% | 4.5% |
| 2006 | 27.0% | 27.0% | 15.4% | 10.2% |
| 2007 | 18.0% | 18.0% | 5.7% | 7.8% |
| 2008 | 2.1% | 2.1% | -36.7% | -18.3% |
| 2009 | 0.1% | 0.1% | 28.6% | 13.8% |
| 2010 | 7.9% | 7.9% | 17.4% | 13.7% |
| 2011 | -0.6% | -0.6% | 0.5% | 5.3% |
| 2012 | 11.6% | 11.6% | 16.3% | 10.6% |
| 2013 | 33.7% | 33.7% | 35.2% | 17.1% |
| 2014 | 7.5% | 7.5% | 11.7% | 9.6% |
| 2015 | -7.6% | -7.6% | 0.2% | 0.8% |
| 2016 | 7.0% | 7.0% | 13.6% | 8.4% |
| 2017 | 24.5% | 24.5% | 22.3% | 13.7% |
| 2018 | -8.5% | -8.5% | -5.0% | -2.4% |
| 2019 | 11.0% | 10.5% | 30.6% | 21.3% |
| 2020 | 4.0% | 4.0% | 24.1% | 19.0% |
| 2021 | 19.8% | 19.8% | 23.9% | 12.2% |
| 2022 | -18.1% | -13.2% | -19.9% | -16.8% |
| 2023 | 5.4% | 5.9% | 26.7% | 17.4% |
| 2024 | 25.0% | 25.0% | 25.0% | 14.5% |
| 2025 | 17.3% | 17.3% | 17.5% | 13.6% |
