// -----------------------------------------------------------------------------
// The stores and their opening hours.
//
// The user lists the shops they go to — supermarket, pharmacy, bakery, waste
// collection centre — with their hours in the OpenStreetMap syntax:
//
//   Supermarket = Mo-Sa 08:30-20:00; PH off | Pharmacy = Mo-Fr 09:00-19:00
//
// Stores are separated by `|` (or a line break), the name comes before `=`.
// `|` and `=` never appear in the opening_hours subset read by hours.js.
// A name alone (or `Name = auto`, `Name = auto: words`) leaves the hours to
// OpenStreetMap, around the houses of Gladys: see finder.js, the only
// network call.
//
// Once a minute the watcher publishes, for each store, whether it is open and
// the minutes until that changes, and fires the "opens soon" / "closes soon"
// scene triggers once per change.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { TIME_ZONE } from '../config.js';
import { FEATURES, OSM_PREFIX, PARAMS, storeIds } from '../devices/index.js';
import { localize, pick } from '../i18n.js';
import { autoSearch } from './finder.js';
import { formatRanges, parseOpeningHours, storeStatus, upcomingDays } from './hours.js';

const logger = createLogger({ name: 'stores' });

const TICK_MS = 60_000;

const NO_FINDER = { get: () => undefined, shop: () => undefined };

/** At most this many stores: the ones a household goes to. */
export const MAX_STORES = 10;

/** Scene trigger keys, as declared in the manifest: never renamed. */
export const STORE_TRIGGERS = {
  OPENING_SOON: 'store_opening_soon',
  CLOSING_SOON: 'store_closing_soon',
};

/**
 * The id of a store, part of its external id: its name in lower case, without
 * accents, words joined by dashes. Renaming a store makes it a new device.
 */
export function storeSlug(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

/**
 * Why a store looked up on OpenStreetMap has no hours: `reason` is `pending`,
 * `not_found`, `unreachable`, `no_key`, `no_house`, `no_access` or `not_understood`
 * (with `hours` and `cause`). See describeHoursError.
 */
export class LookupError extends Error {
  constructor(reason, details = {}) {
    super(`hours lookup: ${reason}`);
    this.name = 'LookupError';
    this.reason = reason;
    Object.assign(this, details);
  }
}

/**
 * Read the stores of the configuration.
 * @param {string} text
 * @returns {{
 *   stores: Array<{
 *     id: string, name: string, hours: string, search: string|null,
 *     schedule: object|null, error: Error|null, place: object|null
 *   }>,
 *   errors: string[]
 * }} a store whose hours cannot be read is kept, with its error: the screens
 *   say what is wrong with it. A store to look up (`search`) waits for its
 *   hours (StoreWatcher.resolve).
 */
export function parseStores(text) {
  const stores = [];
  const errors = [];
  for (const entry of String(text ?? '')
    .split(/[|\n]/)
    .map((part) => part.trim())
    .filter(Boolean)) {
    const separator = entry.indexOf('=');
    let name = (separator === -1 ? entry : entry.slice(0, separator)).trim();
    // No hours: looked up on OpenStreetMap, the default.
    const hours = (separator === -1 ? '' : entry.slice(separator + 1).trim()) || 'auto';
    // `auto: words` alone: the words name the store. `auto` alone names no
    // store (not a shop called "auto"): an error that says so.
    const bare = separator === -1 ? /^auto\s*(?::\s*(.*))?$/i.exec(name) : null;
    if (bare) {
      name = bare[1]?.trim() ?? '';
    }
    const id = storeSlug(name);
    if (!id) {
      errors.push(entry);
      continue;
    }
    if (stores.some((store) => store.id === id)) {
      continue;
    }
    const search = autoSearch(hours, name);
    if (search !== null) {
      stores.push({
        id,
        name,
        hours: '',
        search,
        schedule: null,
        error: new LookupError('pending'),
        place: null,
      });
      continue;
    }
    let schedule = null;
    let error = null;
    try {
      schedule = parseOpeningHours(hours);
    } catch (err) {
      error = err;
    }
    stores.push({ id, name, hours, search: null, schedule, error, place: null });
  }
  if (stores.length > MAX_STORES) {
    errors.push(...stores.splice(MAX_STORES).map((store) => store.name));
  }
  return { stores, errors };
}

export class StoreWatcher {
  /**
   * @param {object} options
   * @param {object} options.gladys the SDK instance
   * @param {() => Date} [options.now] clock, for the tests
   * @param {{ get: Function, shop: Function }} [options.finder] what
   *   OpenStreetMap gave, per search and per shop key (HoursFinder)
   */
  constructor({ gladys, now = () => new Date(), finder = NO_FINDER }) {
    this.gladys = gladys;
    this.now = now;
    this.finder = finder;
    this.config = null;
    // The stores typed in the configuration, those created from the
    // Discovery tab, and both: the ones published every minute.
    this.typed = [];
    this.created = [];
    this.stores = [];
    this.errors = [];
    this.timer = null;
    // Per store id, what the last ticks saw: survives a new configuration, so
    // saving the form does not announce again a change already announced.
    this.memory = new Map();
  }

  /** Read the stores of a (new) configuration. */
  configure(config) {
    this.config = config;
    ({ stores: this.typed, errors: this.errors } = parseStores(config.stores));
    this.merge();
    for (const store of this.typed.filter((s) => s.error && !s.search)) {
      logger.warn(`Opening hours of "${store.name}" not understood: ${store.error.message}`);
    }
    for (const entry of this.errors) {
      logger.warn(`Store not understood: "${entry}" (expected: Name, or Name = hours)`);
    }
  }

  /**
   * Read the stores created from the Discovery tab, among the devices of the
   * integration: their id is `osm-<key>`, their name the one in Gladys.
   */
  setDevices(devices = []) {
    const prefix = storeIds(this.gladys, OSM_PREFIX).device;
    this.created = devices
      .filter((device) => device.external_id?.startsWith(prefix))
      .map((device) => {
        const id = device.external_id.slice(prefix.length - OSM_PREFIX.length);
        const param = (name) => device.params?.find((p) => p.name === name)?.value;
        return {
          id,
          key: id.slice(OSM_PREFIX.length),
          name: device.name || id,
          search: null,
          // The hours Gladys keeps, for a start without the cache.
          saved: param(PARAMS.HOURS)
            ? { hours: param(PARAMS.HOURS), osm: param(PARAMS.URL) }
            : null,
        };
      })
      .filter((store) => !this.typed.some((typed) => typed.id === store.id));
    this.merge();
  }

  merge() {
    this.stores = [...this.typed, ...this.created];
    this.resolve();
  }

  /** The searches of the stores to look up on OpenStreetMap. */
  get searches() {
    return this.typed.filter((store) => store.search).map((store) => store.search);
  }

  /** The keys of the shops created from the Discovery tab. */
  get known() {
    return this.created.map((store) => store.key);
  }

  /** Give the stores found on OpenStreetMap the hours known for them now. */
  resolve() {
    for (const store of this.stores.filter((s) => s.search || s.key)) {
      const result = store.key
        ? (this.finder.shop(store.key) ?? store.saved)
        : this.finder.get(store.search);
      Object.assign(store, { hours: '', schedule: null, place: null, shop: null });
      if (!result) {
        store.error = new LookupError('pending');
      } else if (!result.hours) {
        store.error = new LookupError(result.error, { radiusKm: result.radiusKm });
      } else {
        const { hours, ...place } = result;
        store.place = place.name ? place : null;
        if (store.key) {
          store.shop = result;
        }
        try {
          Object.assign(store, { hours, schedule: parseOpeningHours(hours), error: null });
        } catch (cause) {
          store.error = new LookupError('not_understood', { hours, cause });
          logger.warn(`Opening hours of "${store.name}" not understood: ${hours}`);
        }
      }
    }
  }

  /** The store of an id or of a device external id. */
  find(idOrExternalId) {
    return this.stores.find(
      (store) =>
        store.id === idOrExternalId || storeIds(this.gladys, store.id).device === idOrExternalId,
    );
  }

  /** A store's status now, `null` while its hours cannot be read. */
  status(store) {
    return store?.schedule ? storeStatus(store.schedule, this.now(), TIME_ZONE) : null;
  }

  /** The hours of a store's next `count` days, `[]` while its hours cannot be read. */
  upcoming(store, count) {
    return store?.schedule && count > 0
      ? upcomingDays(store.schedule, this.now(), TIME_ZONE, count)
      : [];
  }

  /** Publish the features of every store and fire the due triggers. */
  async tick() {
    for (const store of this.stores) {
      await this.tickStore(store);
    }
  }

  async tickStore(store) {
    const status = this.status(store);
    if (!status) {
      return;
    }
    const ids = storeIds(this.gladys, store.id);
    const memory = this.memory.get(store.id) ?? { announced: null, primed: false, lastOpen: null };
    this.memory.set(store.id, memory);
    await this.gladys.publishChangedStates(
      [
        { device_feature_external_id: ids.feature(FEATURES.OPEN), state: status.open ? 1 : 0 },
        {
          device_feature_external_id: ids.feature(FEATURES.NEXT_CHANGE),
          state: status.next ? status.next.inMinutes : 0,
        },
      ],
      { heartbeat: 30 * 60_000 },
    );
    if (memory.lastOpen !== null && memory.lastOpen !== status.open) {
      this.gladys.requestWidgetRefresh('store_hours');
    }
    memory.lastOpen = status.open;

    const { next } = status;
    const due = next && next.inMinutes > 0 && next.inMinutes <= this.config.notice_minutes;
    // The first tick of a store only takes note: a restart inside the notice
    // window must not announce the same closing twice.
    if (due) {
      const key = `${next.open}@${Math.round(next.at.getTime() / 60_000)}`;
      if (memory.primed && key !== memory.announced) {
        const trigger = next.open ? STORE_TRIGGERS.OPENING_SOON : STORE_TRIGGERS.CLOSING_SOON;
        logger.info(`${trigger} ${store.name}: ${next.time}, in ${next.inMinutes} min`);
        await this.gladys
          .publishSceneEvent(trigger, {
            device: ids.device,
            store_name: store.name,
            time: next.time,
            minutes_left: next.inMinutes,
          })
          .catch((err) => logger.error(`Could not fire ${trigger}`, err));
      }
      memory.announced = key;
    }
    memory.primed = true;
  }

  start() {
    this.stop();
    this.timer = setInterval(() => {
      this.tick().catch((err) => logger.error('Store tick failed', err));
    }, TICK_MS);
    this.timer.unref?.();
    return this.tick().catch((err) => logger.error('Store tick failed', err));
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}

/**
 * The state of the store in one sentence per language: "Open, closes at
 * 20:00." / "Closed, opens tomorrow at 08:30."
 */
export function describeStatus(status, timeZone = TIME_ZONE) {
  return localize((language) => {
    if (!status.next) {
      return pick(language, {
        en: status.open ? 'Open, around the clock.' : 'Closed, no opening this week.',
        fr: status.open ? 'Ouvert, en continu.' : 'Fermé, aucune ouverture cette semaine.',
        de: status.open ? 'Geöffnet, rund um die Uhr.' : 'Geschlossen, diese Woche keine Öffnung.',
        es: status.open ? 'Abierto, sin interrupción.' : 'Cerrado, sin apertura esta semana.',
      });
    }
    const when = describeWhen(status.next, language, timeZone);
    return status.open
      ? pick(language, {
          en: `Open, closes ${when}.`,
          fr: `Ouvert, ferme ${when}.`,
          de: `Geöffnet, schließt ${when}.`,
          es: `Abierto, cierra ${when}.`,
        })
      : pick(language, {
          en: `Closed, opens ${when}.`,
          fr: `Fermé, ouvre ${when}.`,
          de: `Geschlossen, öffnet ${when}.`,
          es: `Cerrado, abre ${when}.`,
        });
  });
}

/** "at 20:00", "tomorrow at 08:30", "on Monday at 08:30", in a language. */
export function describeWhen(next, language, timeZone = TIME_ZONE) {
  if (next.dayOffset === 0) {
    return pick(language, {
      en: `at ${next.time}`,
      fr: `à ${next.time}`,
      de: `um ${next.time}`,
      es: `a las ${next.time}`,
    });
  }
  if (next.dayOffset === 1) {
    return pick(language, {
      en: `tomorrow at ${next.time}`,
      fr: `demain à ${next.time}`,
      de: `morgen um ${next.time}`,
      es: `mañana a las ${next.time}`,
    });
  }
  const day = new Intl.DateTimeFormat(language, { weekday: 'long', timeZone }).format(next.at);
  return pick(language, {
    en: `on ${day} at ${next.time}`,
    fr: `${day} à ${next.time}`,
    de: `am ${day} um ${next.time}`,
    es: `el ${day} a las ${next.time}`,
  });
}

/** Today's hours, or "closed today". */
export function describeToday(status) {
  return status.today.length > 0
    ? formatRanges(status.today)
    : { en: 'Closed today', fr: "Fermé aujourd'hui", de: 'Heute geschlossen', es: 'Cerrado hoy' };
}

/** Why the hours could not be read, for the action and the widget. */
export function describeHoursError(error) {
  if (error instanceof LookupError) {
    return describeLookupError(error);
  }
  return localize((language) =>
    pick(language, {
      en: `The opening hours are not understood (${error.message}). Example: Mo-Sa 08:30-20:00; PH off`,
      fr: `Les horaires ne sont pas compris (${error.message}). Exemple : Mo-Sa 08:30-20:00; PH off`,
      de: `Die Öffnungszeiten werden nicht verstanden (${error.message}). Beispiel: Mo-Sa 08:30-20:00; PH off`,
      es: `No se entiende el horario (${error.message}). Ejemplo: Mo-Sa 08:30-20:00; PH off`,
    }),
  );
}

function describeLookupError(error) {
  switch (error.reason) {
    case 'pending':
      return {
        en: 'Looking for the opening hours on OpenStreetMap…',
        fr: 'Recherche des horaires sur OpenStreetMap…',
        de: 'Die Öffnungszeiten werden auf OpenStreetMap gesucht…',
        es: 'Buscando el horario en OpenStreetMap…',
      };
    case 'not_found':
      return {
        en: `No shop of this name with opening hours on OpenStreetMap within ${error.radiusKm} km of your houses. Type its hours instead of auto, e.g. Mo-Sa 08:30-20:00.`,
        fr: `Aucun commerce de ce nom avec des horaires sur OpenStreetMap à moins de ${error.radiusKm} km de vos maisons. Écrivez ses horaires à la place de auto, ex. Mo-Sa 08:30-20:00.`,
        de: `Kein Geschäft dieses Namens mit Öffnungszeiten auf OpenStreetMap im Umkreis von ${error.radiusKm} km Ihrer Häuser. Geben Sie seine Zeiten statt auto ein, z. B. Mo-Sa 08:30-20:00.`,
        es: `Ningún comercio con este nombre y horario en OpenStreetMap a menos de ${error.radiusKm} km de sus casas. Escriba su horario en lugar de auto, p. ej. Mo-Sa 08:30-20:00.`,
      };
    case 'no_key':
      return {
        en: 'To look for the opening hours on OpenStreetMap, paste your free overpass.ch key in the configuration (steps in the documentation), or type the hours instead of auto, e.g. Mo-Sa 08:30-20:00.',
        fr: 'Pour chercher les horaires sur OpenStreetMap, collez votre clé gratuite overpass.ch dans la configuration (étapes dans la documentation), ou écrivez les horaires à la place de auto, ex. Mo-Sa 08:30-20:00.',
        de: 'Um die Öffnungszeiten auf OpenStreetMap zu suchen, fügen Sie Ihren kostenlosen overpass.ch-Schlüssel in die Konfiguration ein (Schritte in der Dokumentation), oder geben Sie die Zeiten statt auto ein, z. B. Mo-Sa 08:30-20:00.',
        es: 'Para buscar el horario en OpenStreetMap, pegue su clave gratuita de overpass.ch en la configuración (pasos en la documentación), o escriba el horario en lugar de auto, p. ej. Mo-Sa 08:30-20:00.',
      };
    case 'no_house':
      return {
        en: 'No house of Gladys has a location: set it in Settings → Houses, the hours are looked up around it.',
        fr: "Aucune maison de Gladys n'a d'emplacement : renseignez-le dans Paramètres → Maisons, les horaires sont cherchés autour.",
        de: 'Kein Haus von Gladys hat einen Standort: Legen Sie ihn unter Einstellungen → Häuser fest, die Zeiten werden in der Umgebung gesucht.',
        es: 'Ninguna casa de Gladys tiene ubicación: indíquela en Ajustes → Casas, el horario se busca alrededor.',
      };
    case 'no_access':
      return {
        en: 'The integration cannot read the location of the houses: reinstall it to grant that access.',
        fr: "L'intégration ne peut pas lire l'emplacement des maisons : réinstallez-la pour lui donner cet accès.",
        de: 'Die Integration kann den Standort der Häuser nicht lesen: Installieren Sie sie neu, um diesen Zugriff zu gewähren.',
        es: 'La integración no puede leer la ubicación de las casas: reinstálela para concederle ese acceso.',
      };
    case 'unreachable':
      return {
        en: 'OpenStreetMap could not be reached: new try within the hour.',
        fr: "OpenStreetMap n'a pas pu être joint : nouvel essai dans l'heure.",
        de: 'OpenStreetMap war nicht erreichbar: neuer Versuch innerhalb einer Stunde.',
        es: 'No se pudo contactar con OpenStreetMap: nuevo intento en la próxima hora.',
      };
    default:
      return localize((language) =>
        pick(language, {
          en: `The opening hours found on OpenStreetMap are not understood: ${error.hours}. Type them instead of auto, e.g. Mo-Sa 08:30-20:00.`,
          fr: `Les horaires trouvés sur OpenStreetMap ne sont pas compris : ${error.hours}. Écrivez-les à la place de auto, ex. Mo-Sa 08:30-20:00.`,
          de: `Die auf OpenStreetMap gefundenen Öffnungszeiten werden nicht verstanden: ${error.hours}. Geben Sie sie statt auto ein, z. B. Mo-Sa 08:30-20:00.`,
          es: `No se entiende el horario encontrado en OpenStreetMap: ${error.hours}. Escríbalo en lugar de auto, p. ej. Mo-Sa 08:30-20:00.`,
        }),
      );
  }
}

/** Why the hours could not be read, in a few words for a status row. */
export function describeHoursShort(error) {
  if (error?.reason === 'pending') {
    return { en: 'Searching…', fr: 'Recherche…', de: 'Suche…', es: 'Buscando…' };
  }
  if (error?.reason === 'no_key') {
    return {
      en: 'overpass.ch key missing',
      fr: 'Clé overpass.ch manquante',
      de: 'overpass.ch-Schlüssel fehlt',
      es: 'Falta la clave de overpass.ch',
    };
  }
  if (error instanceof LookupError && error.reason !== 'not_understood') {
    return {
      en: 'Hours not found',
      fr: 'Horaires introuvables',
      de: 'Zeiten nicht gefunden',
      es: 'Horario no encontrado',
    };
  }
  return {
    en: 'Hours not understood',
    fr: 'Horaires non compris',
    de: 'Zeiten nicht verstanden',
    es: 'Horario no entendido',
  };
}

/** Where the hours come from: "E.Leclerc, Bourges · 2.3 km", `null` when typed by hand. */
export function describePlace(place, language) {
  if (!place) {
    return null;
  }
  const where = [place.name, place.city].filter(Boolean).join(', ');
  if (place.distance === undefined) {
    return where;
  }
  const distance =
    place.distance < 1000
      ? `${place.distance} m`
      : `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(place.distance / 1000)} km`;
  return `${where} · ${distance}`;
}
