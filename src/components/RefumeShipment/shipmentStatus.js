// Refume: shipment statuses (server: server/api-util/refumeShipments.js)

export const SHIPMENT_STATUS = {
  nowa: { label: 'Przygotowanie etykiety', tone: 'muted' },
  'brak-danych-nadawcy': { label: 'Czeka na dane nadawcy', tone: 'todo' },
  blad: { label: 'Przygotowanie etykiety', tone: 'todo' },
  etykieta: { label: 'Etykieta gotowa', tone: 'info' },
  nadana: { label: 'Paczka nadana', tone: 'info' },
  'w-drodze': { label: 'W drodze', tone: 'info' },
  'w-doreczeniu': { label: 'W doręczeniu', tone: 'info' },
  'czeka-na-odbior': { label: 'Czeka na odbiór', tone: 'todo' },
  doreczona: { label: 'Doręczona', tone: 'done' },
  problem: { label: 'Problem z doręczeniem', tone: 'problem' },
  zwrot: { label: 'Zwrot do nadawcy', tone: 'problem' },
  anulowana: { label: 'Anulowana', tone: 'muted' },
};

export const CARRIER_NAMES = {
  inpost: 'InPost Paczkomat',
  orlen: 'Orlen Paczka',
  'dpd-pickup': 'DPD Pickup',
  pocztex: 'Pocztex',
};

// Text in the chat for each event
export const SHIPMENT_EVENT_TEXT = {
  etykieta: 'Etykieta gotowa – sprzedawca może nadać paczkę',
  nadana: 'Paczka nadana',
  'w-drodze': 'Paczka w drodze',
  'w-doreczeniu': 'Paczka w doręczeniu',
  'czeka-na-odbior': 'Paczka czeka w punkcie odbioru',
  doreczona: 'Paczka doręczona',
  problem: 'Przewoźnik zgłosił problem z przesyłką',
  zwrot: 'Paczka wraca do nadawcy',
  anulowana: 'Przesyłka anulowana',
};

const STEPS = [
  ['etykieta', 'Etykieta'],
  ['nadana', 'Nadana'],
  ['w-drodze', 'W drodze'],
  ['doreczona', 'Doręczona'],
];
const RANK = { etykieta: 0, nadana: 1, 'w-drodze': 2, 'w-doreczeniu': 2, 'czeka-na-odbior': 2, problem: 2, doreczona: 3 };

/** Progress steps, or null when the status isn't on the normal path. */
export const shipmentSteps = status => {
  if (RANK[status] == null) return null;
  const at = RANK[status];
  return STEPS.map(([key, label], i) => ({
    key,
    label: i === 2 && status === 'czeka-na-odbior' ? 'W punkcie' : i === 2 && status === 'w-doreczeniu' ? 'W doręczeniu' : label,
    done: i < at || (i === at && status === 'doreczona'),
    now: i === at && status !== 'doreczona',
  }));
};
