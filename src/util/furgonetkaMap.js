/**
 * Refume: Furgonetka's map of pickup points (parcel lockers, Orlen, DPD Pickup…).
 * https://furgonetka.pl/files/docs/furgonetka-mapa-2.0.1.pdf
 *
 *   openPointMap({ service: 'inpost', city, onSelect: ({ code, name, type }) => …, onClose })
 */
const SRC = 'https://furgonetka.pl/js/dist/map/map.js';
let loading = null;

export const loadFurgonetkaMap = () => {
  if (typeof window === 'undefined') return Promise.reject(new Error('No window'));
  if (window.Furgonetka?.Map) return Promise.resolve(window.Furgonetka);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = SRC;
      script.async = true;
      script.onload = () =>
        window.Furgonetka?.Map ? resolve(window.Furgonetka) : reject(new Error('Map not available'));
      script.onerror = () => {
        loading = null;
        script.remove();
        reject(new Error('Map script failed to load'));
      };
      document.body.appendChild(script);
    });
  }
  return loading;
};

export const openPointMap = ({ service, city, street, onSelect, onClose }) =>
  loadFurgonetkaMap().then(F => {
    new F.Map({
      courierServices: [service],
      ...(city ? { city } : {}),
      ...(street ? { street } : {}),
      callback: result => {
        const point = result?.point || result;
        if (point?.code) {
          onSelect({ code: String(point.code), name: String(point.name || ''), type: point.type || service });
        }
      },
      closeModalCallback: () => onClose && onClose(),
    }).show();
  });
