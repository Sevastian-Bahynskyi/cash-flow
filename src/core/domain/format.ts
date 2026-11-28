const parseIsoDate = (iso: string): Date => {
  const [year = 1970, month = 1, day = 1] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const formatMonthYearLabel = (iso: string): string =>
  new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(parseIsoDate(iso));
