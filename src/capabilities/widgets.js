// -----------------------------------------------------------------------------
// Dashboard widgets (Gladys 5.1+).
//
//   - `store_hours`: which stores are open, until when — or one store in
//     detail, with today's hours and, with the `days` setting, those of the
//     next days (at most 6: the status list holds 10 rows).
//
// The content is declarative (the core renders it, no HTML): see the
// "Dashboard widgets" section of the SDK README for the vocabulary and the
// budget — at most 8 components, 1 focal, 6 tiles, 1 status list, 4 buttons.
// The tests run every content through the SDK's `validateWidgetContent`.
//
// Widget and action keys are stored by the users' dashboards: never renamed.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { pick } from '../i18n.js';
import {
  describeHoursError,
  describeHoursShort,
  describePlace,
  describeToday,
  describeWhen,
} from '../shops/stores.js';
import { formatRanges } from '../shops/hours.js';

export const WIDGET_KEYS = { STORE_HOURS: 'store_hours' };

const clip = (text, length) => (text.length > length ? `${text.slice(0, length - 1)}…` : text);

/** The next days a store in detail may show: the rest of the week. */
export const MAX_NEXT_DAYS = 6;

/** The `days` setting, whatever its type: an integer within 0..MAX_NEXT_DAYS. */
function nextDaysSetting(value) {
  const days = Math.trunc(Number(value));
  return Number.isFinite(days) ? Math.min(Math.max(days, 0), MAX_NEXT_DAYS) : 0;
}

/** "Tomorrow", "Sunday 8", "Wednesday 11 · holiday", in a language. */
function dayLabel(day, language) {
  // The weekday from Intl, the day number added here: the order Intl picks
  // for both together changes with the ICU version of the runtime.
  const weekday = new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' }).format(
    day.date,
  );
  const number = day.date.getUTCDate();
  let label =
    day.dayOffset === 1
      ? pick(language, { en: 'Tomorrow', fr: 'Demain', de: 'Morgen', es: 'Mañana' })
      : pick(language, {
          en: `${weekday} ${number}`,
          fr: `${weekday} ${number}`,
          de: `${weekday}, ${number}.`,
          es: `${weekday} ${number}`,
        });
  label = label.charAt(0).toUpperCase() + label.slice(1);
  if (day.holiday) {
    const holiday = pick(language, { en: 'holiday', fr: 'férié', de: 'Feiertag', es: 'festivo' });
    label = `${label} · ${holiday}`;
  }
  return clip(label, 40);
}

/** "Open · closes at 20:00", short enough for a status row (40). */
function statusLine(status, language) {
  const state = pick(
    language,
    status.open
      ? { en: 'Open', fr: 'Ouvert', de: 'Geöffnet', es: 'Abierto' }
      : { en: 'Closed', fr: 'Fermé', de: 'Geschlossen', es: 'Cerrado' },
  );
  if (!status.next) {
    return state;
  }
  const verb = pick(
    language,
    status.open
      ? { en: 'closes', fr: 'ferme', de: 'schließt', es: 'cierra' }
      : { en: 'opens', fr: 'ouvre', de: 'öffnet', es: 'abre' },
  );
  return clip(`${state} · ${verb} ${describeWhen(status.next, language)}`, 40);
}

/** Every store on one status list. */
function buildStoresOverview(watcher, language) {
  return {
    ttl_seconds: 60,
    components: [
      {
        type: 'status',
        items: watcher.stores.map((store) => {
          const status = watcher.status(store);
          return {
            label: clip(store.name, 40),
            value: status ? statusLine(status, language) : describeHoursShort(store.error),
            icon: 'shopping-bag',
            color: !status
              ? WIDGET_COLORS.WARNING
              : status.open
                ? WIDGET_COLORS.SUCCESS
                : WIDGET_COLORS.DANGER,
          };
        }),
      },
    ],
  };
}

/**
 * One store in detail: a countdown tile and its state, next change, today's
 * hours and those of the `days` next days.
 */
function buildStoreDetail(watcher, store, language, days) {
  const status = watcher.status(store);
  if (!status) {
    return {
      ttl_seconds: 300,
      components: [
        { type: 'text', variant: 'heading', text: clip(store.name, 40) },
        { type: 'text', variant: 'body', text: describeHoursError(store.error) },
      ],
    };
  }
  const components = [{ type: 'text', variant: 'heading', text: clip(store.name, 40) }];
  if (status.next) {
    components.push({
      type: 'value',
      value: status.next.inMinutes,
      unit: 'min',
      label: status.open
        ? { en: 'Closes in', fr: 'Ferme dans', de: 'Schließt in', es: 'Cierra en' }
        : { en: 'Opens in', fr: 'Ouvre dans', de: 'Öffnet in', es: 'Abre en' },
      icon: 'clock',
      color: status.open ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL,
    });
  }
  const items = [
    {
      label: { en: 'Now', fr: 'Maintenant', de: 'Jetzt', es: 'Ahora' },
      value: status.open
        ? { en: 'Open', fr: 'Ouvert', de: 'Geöffnet', es: 'Abierto' }
        : { en: 'Closed', fr: 'Fermé', de: 'Geschlossen', es: 'Cerrado' },
      icon: 'shopping-bag',
      color: status.open ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.DANGER,
    },
  ];
  if (status.next) {
    items.push({
      label: status.open
        ? { en: 'Closes', fr: 'Ferme', de: 'Schließt', es: 'Cierra' }
        : { en: 'Opens', fr: 'Ouvre', de: 'Öffnet', es: 'Abre' },
      value: clip(describeWhen(status.next, language), 40),
      icon: 'clock',
      color: WIDGET_COLORS.INFO,
    });
  }
  items.push({
    label: { en: 'Today', fr: "Aujourd'hui", de: 'Heute', es: 'Hoy' },
    value: describeToday(status),
    icon: 'calendar',
    color: WIDGET_COLORS.NEUTRAL,
  });
  for (const day of watcher.upcoming(store, days)) {
    items.push({
      label: dayLabel(day, language),
      value:
        day.ranges.length > 0
          ? clip(formatRanges(day.ranges), 40)
          : { en: 'Closed', fr: 'Fermé', de: 'Geschlossen', es: 'Cerrado' },
      icon: 'calendar',
      color: day.ranges.length > 0 ? WIDGET_COLORS.NEUTRAL : WIDGET_COLORS.WARNING,
    });
  }
  const place = describePlace(store.place, language);
  if (place) {
    items.push({
      label: 'OpenStreetMap',
      value: clip(place, 40),
      icon: 'map-pin',
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  components.push({ type: 'status', items });
  // The minute count moves every minute; the core re-pulls at the TTL.
  return { ttl_seconds: 60, components };
}

/**
 * The content of the `store_hours` widget: the store chosen in the instance
 * settings in detail, or every store at a glance.
 */
export function buildStoreWidget({ watcher, settings = {}, language = 'en' }) {
  if (watcher.stores.length === 0) {
    return {
      ttl_seconds: 3600,
      components: [
        {
          type: 'text',
          variant: 'body',
          text: {
            en: 'No store yet: create the shops found around your houses from the Discovery tab of the integration, or type them in its Configuration screen.',
            fr: "Aucun commerce : créez ceux trouvés autour de vos maisons depuis l'onglet Découverte de l'intégration, ou écrivez-les dans son écran Configuration.",
            de: 'Noch kein Geschäft: Legen Sie die rund um Ihre Häuser gefundenen im Reiter Erkennung der Integration an, oder tragen Sie sie im Bildschirm Konfiguration ein.',
            es: 'Aún no hay comercios: cree los encontrados alrededor de sus casas desde la pestaña Descubrimiento de la integración, o escríbalos en su pantalla Configuración.',
          },
        },
      ],
    };
  }
  const store = settings?.store ? watcher.find(settings.store) : null;
  return store
    ? buildStoreDetail(watcher, store, language, nextDaysSetting(settings.days))
    : buildStoresOverview(watcher, language);
}

/**
 * The widget handlers, keyed by widget key: `get` for onWidgetGet.
 */
export function widgetHandlers({ watcher }) {
  return {
    [WIDGET_KEYS.STORE_HOURS]: {
      get: ({ settings, language }) => buildStoreWidget({ watcher, settings, language }),
    },
  };
}
