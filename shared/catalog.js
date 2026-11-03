// Indicator catalog. Shared by the build snapshot, the /api/data function and the UI.
// transform: 'level' = use the series as published; 'yoy' = 12-month % change.
// goodUp: true when a higher reading is healthier for the economy.

export const CATEGORIES = ['Labor', 'Prices', 'Growth', 'Consumer', 'Housing', 'Markets'];

export const CATALOG = [
  { id: 'UNRATE', name: 'Unemployment rate', short: 'Unemployment', cat: 'Labor', transform: 'level', goodUp: false, suffix: '%', decimals: 1,
    blurb: 'Share of the labor force without a job but looking for one. It rises late in slowdowns and is a core recession signal.' },
  { id: 'PAYEMS', name: 'Payroll growth (YoY)', short: 'Payrolls', cat: 'Labor', transform: 'yoy', goodUp: true, suffix: '%', decimals: 1,
    blurb: 'Year-over-year growth in nonfarm employment. Slowing job growth is usually the first crack in a healthy labor market.' },
  { id: 'ICSA', name: 'Initial jobless claims', short: 'Jobless claims', cat: 'Labor', transform: 'level', goodUp: false, scale: 0.001, suffix: 'k', decimals: 0,
    blurb: 'New unemployment insurance filings, a weekly proxy for layoffs. Monthly average shown.' },
  { id: 'JTSJOL', name: 'Job openings', short: 'Job openings', cat: 'Labor', transform: 'level', goodUp: true, scale: 0.001, suffix: 'M', decimals: 1,
    blurb: 'Unfilled positions from the JOLTS survey. A gauge of how hungry employers are to hire.' },
  { id: 'CPIAUCSL', name: 'CPI inflation (YoY)', short: 'CPI', cat: 'Prices', transform: 'yoy', goodUp: false, suffix: '%', decimals: 1,
    blurb: 'Year-over-year change in consumer prices. Treated as "lower is better" because high inflation erodes purchasing power and forces tighter policy.' },
  { id: 'PCEPILFE', name: 'Core PCE inflation (YoY)', short: 'Core PCE', cat: 'Prices', transform: 'yoy', goodUp: false, suffix: '%', decimals: 1,
    blurb: 'The Fed\'s preferred inflation gauge, excluding food and energy.' },
  { id: 'INDPRO', name: 'Industrial production (YoY)', short: 'Industrial output', cat: 'Growth', transform: 'yoy', goodUp: true, suffix: '%', decimals: 1,
    blurb: 'Output of factories, mines and utilities. Cyclical and fast-moving, so it turns early.' },
  { id: 'TCU', name: 'Capacity utilization', short: 'Capacity use', cat: 'Growth', transform: 'level', goodUp: true, suffix: '%', decimals: 1,
    blurb: 'How much of industry\'s productive capacity is in use. Low readings signal slack.' },
  { id: 'RSAFS', name: 'Retail sales (YoY)', short: 'Retail sales', cat: 'Consumer', transform: 'yoy', goodUp: true, suffix: '%', decimals: 1,
    blurb: 'Nominal spending at retailers. Consumers drive about two-thirds of the economy.' },
  { id: 'UMCSENT', name: 'Consumer sentiment', short: 'Sentiment', cat: 'Consumer', transform: 'level', goodUp: true, suffix: '', decimals: 1,
    blurb: 'University of Michigan survey of household optimism about finances and the economy.' },
  { id: 'HOUST', name: 'Housing starts', short: 'Housing starts', cat: 'Housing', transform: 'level', goodUp: true, suffix: 'k', decimals: 0,
    blurb: 'New residential construction, annualized. Very rate-sensitive, so it often leads the cycle.' },
  { id: 'MORTGAGE30US', name: '30-year mortgage rate', short: 'Mortgage rate', cat: 'Housing', transform: 'level', goodUp: false, suffix: '%', decimals: 2,
    blurb: 'Average 30-year fixed rate from Freddie Mac. Higher rates cool housing and household budgets.' },
  { id: 'T10Y2Y', name: 'Yield curve (10y minus 2y)', short: 'Yield curve', cat: 'Markets', transform: 'level', goodUp: true, suffix: ' pp', decimals: 2,
    blurb: 'Gap between 10- and 2-year Treasury yields. Inversions (below zero) have preceded most recessions.' },
  { id: 'BAA10Y', name: 'Corporate credit spread (Baa minus 10y)', short: 'Credit spread', cat: 'Markets', transform: 'level', goodUp: false, suffix: '%', decimals: 2,
    blurb: 'Yield gap between Baa-rated corporate bonds and 10-year Treasuries. It widens when investors fear defaults. Used instead of the high-yield index spread because FRED now carries only about three years of that series.' },
  { id: 'VIXCLS', name: 'VIX volatility index', short: 'VIX', cat: 'Markets', transform: 'level', goodUp: false, suffix: '', decimals: 1,
    blurb: 'Market-implied expected stock volatility, the "fear gauge". Monthly average shown.' },
  { id: 'NASDAQCOM', name: 'Nasdaq Composite (YoY)', short: 'Nasdaq', cat: 'Markets', transform: 'yoy', goodUp: true, suffix: '%', decimals: 1,
    blurb: 'One-year return on the Nasdaq Composite. Used instead of the S&P 500 because FRED carries only about ten years of S&P history, too short for a 30-year calibration.' },
  { id: 'NFCI', name: 'Financial conditions (NFCI)', short: 'Fin. conditions', cat: 'Markets', transform: 'level', goodUp: false, suffix: '', decimals: 2,
    blurb: 'Chicago Fed index of money, debt and equity markets. Above zero means tighter-than-average conditions.' },
];

export const RECESSION_ID = 'USREC';
// Data is fetched from START so that year-over-year series are valid from WINDOW_START,
// the first month of the 30-year calibration window used for standardizing and fitting.
export const START = '1995-11';
export const WINDOW_START = '1996-11';
