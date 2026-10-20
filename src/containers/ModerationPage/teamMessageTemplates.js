/**
 * Refume: ready-made messages from "Zespół Refume". {oferta} is replaced with the title
 * of the chosen listing (or "Twojej oferty" when none is chosen).
 */
export const TEAM_MESSAGE_TEMPLATES = [
  {
    key: 'batch',
    label: 'Zdjęcie kodu batch',
    needsListing: true,
    title: 'Prosimy o zdjęcie kodu batch',
    body:
      'Cześć! Aby potwierdzić oryginalność perfum w ofercie „{oferta}”, prosimy dodać zdjęcie kodu batch ' +
      '(nadruk lub wytłoczenie na spodzie flakonu i na kartoniku). Zdjęcie możesz dodać w edycji oferty. ' +
      'Dziękujemy!',
  },
  {
    key: 'wlasne-zdjecia',
    label: 'Własne zdjęcia',
    needsListing: true,
    title: 'Prosimy dodać własne zdjęcia',
    body:
      'Cześć! Zdjęcia w ofercie „{oferta}” wyglądają na pobrane z internetu. Prosimy dodać zdjęcia ' +
      'sprzedawanego flakonu, zrobione samodzielnie (najlepiej z widocznym poziomem płynu). ' +
      'Bez tego oferta może zostać ukryta.',
  },
  {
    key: 'opis',
    label: 'Uzupełnij opis / stan',
    needsListing: true,
    title: 'Uzupełnij informacje w ofercie',
    body:
      'Cześć! Prosimy uzupełnić opis oferty „{oferta}”: stan flakonu, ile zostało perfum, czy jest ' +
      'pudełko i skąd pochodzą perfumy. Dzięki temu kupujący szybciej się zdecydują.',
  },
  {
    key: 'wysylka',
    label: 'Przypomnienie o wysyłce',
    needsListing: false,
    title: 'Przypomnienie o wysyłce',
    body:
      'Cześć! Masz opłacone zamówienie, które czeka na wysyłkę. Prosimy nadać paczkę jak najszybciej ' +
      'i dodać numer przesyłki w rozmowie z kupującym.',
  },
  {
    key: 'kontakt',
    label: 'Kontakt poza Refume',
    needsListing: false,
    title: 'Kontakt i płatności tylko przez Refume',
    body:
      'Cześć! Przypominamy, że podawanie numeru telefonu, e-maila lub numeru konta oraz płatności poza ' +
      'Refume są niezgodne z Regulaminem. Poza Refume nie działa Ochrona Kupującego. Kolejne naruszenia ' +
      'mogą skończyć się blokadą konta.',
  },
  {
    key: 'wlasna',
    label: 'Własna wiadomość',
    needsListing: false,
    title: '',
    body: '',
  },
];

export const fillTemplate = (text, listingTitle) =>
  String(text || '').replace(/\{oferta\}/g, listingTitle || 'Twojej oferty');
