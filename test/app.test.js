// End to end: the handlers of src/app.js, driven by the SDK's fake Gladys,
// with a fake clock, a fake Overpass and an in-memory cache of the hours.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createApp } from '../src/app.js';
import { overpassChUrl } from '../src/shops/finder.js';
import { storeIds } from '../src/devices/index.js';
import { fakeClock, fakeOverpass, HOUSES, memoryCache, OSM_SHOPS } from './helpers/fixtures.js';

const KEY = 'Ab12cd34';
const STORES = 'Leclerc = Mo-Sa 08:30-20:00; PH off | Pharmacie = Mo-Fr 09:00-19:00';

// No discovery unless a test asks for it: the lists stay the typed ones.
async function setup({ config = { stores: STORES } } = {}) {
  const gladys = createFakeGladys({
    config: { discover_kinds: [], overpass_ch_key: KEY, ...config },
    houses: HOUSES,
  });
  const clock = fakeClock('2026-10-30T18:00:00Z'); // Friday 19:00 in Paris
  const fetch = fakeOverpass(OSM_SHOPS);
  const hoursCache = memoryCache();
  const app = createApp(gladys, { timers: false, now: clock, fetch, hoursCache });
  await gladys.connect();
  return { gladys, app, clock, fetch, hoursCache };
}

test('on connection: one device per store, with its states', async () => {
  const { gladys } = await setup();
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['Leclerc', 'Pharmacie'],
  );
  assert.equal(gladys.fake.lastState(storeIds(gladys, 'leclerc').feature('open')), 1);
  assert.equal(gladys.fake.lastState(storeIds(gladys, 'pharmacie').feature('open')), 0);
  assert.equal(gladys.fake.connectionStatus.connected, true);
});

test('the overpass.ch key of the configuration is the server asked', async () => {
  const { fetch } = await setup({ config: { stores: 'Leclerc' } });
  assert.deepEqual(fetch.urls, [overpassChUrl(KEY)]);
});

test('no overpass.ch key: no call, the store and the test say why', async () => {
  const { gladys, fetch } = await setup({ config: { stores: 'Leclerc', overpass_ch_key: '' } });
  assert.equal(fetch.queries.length, 0);
  const message = (await gladys.fake.action('test_configuration', {})).data.message.fr;
  assert.match(message, /clé gratuite overpass\.ch/);
});

test('scan request publishes the devices again', async () => {
  const { gladys } = await setup();
  const before = gladys.fake.requests.length;
  await gladys.fake.scanRequest();
  assert.ok(gladys.fake.requests.length > before);
  assert.equal(gladys.fake.discoveredDevices.length, 2);
});

test('a new configuration re-reads the stores', async () => {
  const { gladys, app } = await setup();
  await gladys.fake.configUpdated({ stores: 'Marché = Mo-Su off', discover_kinds: [] });
  assert.deepEqual(
    gladys.fake.discoveredDevices.map((device) => device.name),
    ['Marché'],
  );
  assert.equal(app.watcher.status(app.watcher.find('marche')).open, false);
  assert.ok(gladys.fake.widgetRefreshes.length > 0);
});

test('action test_configuration reports every store', async () => {
  const { gladys } = await setup({ config: { stores: `${STORES} | Bio = Lu 9h | auto` } });
  const ack = await gladys.fake.action('test_configuration', {});
  assert.equal(ack.success, true);
  const lines = ack.data.message.fr.split('\n');
  assert.equal(lines[0], 'Leclerc : Ouvert, ferme à 20:00.');
  assert.equal(lines[1], 'Pharmacie : Fermé, ouvre lundi à 09:00.');
  assert.match(lines[2], /^Bio : Les horaires ne sont pas compris/);
  assert.equal(
    lines[3],
    'Non compris, il manque le nom du commerce (ex. Leclerc, ou Leclerc = Mo-Sa 08:30-20:00) : auto.',
  );
  assert.equal(lines[4], "Onglet Découverte : aucun type de commerce coché, rien n'est proposé.");
  assert.equal(lines.length, 5);
  assert.ok(ack.data.message.de && ack.data.message.es);
});

test('stores written auto get their hours from OpenStreetMap, near the houses', async () => {
  const { gladys, fetch } = await setup({
    config: {
      stores: 'Leclerc | Boulangerie = auto: Boulangerie Dupont | Bio = 24/7 | Lidl =',
    },
  });
  assert.equal(fetch.queries.length, 1);
  assert.equal(gladys.fake.lastState(storeIds(gladys, 'leclerc').feature('open')), 1);
  assert.equal(gladys.fake.lastState(storeIds(gladys, 'bio').feature('open')), 1);

  const lines = (await gladys.fake.action('test_configuration', {})).data.message.fr.split('\n');
  assert.equal(
    lines[0],
    'Leclerc : Ouvert, ferme à 20:00. (OpenStreetMap : E.Leclerc, Bourges · 1,3 km, Mo-Sa 08:30-20:00; PH off)',
  );
  assert.match(
    lines[1],
    /^Boulangerie : Les horaires trouvés sur OpenStreetMap ne sont pas compris/,
  );
  assert.match(lines[3], /^Lidl : Aucun commerce de ce nom .* 10 km de vos maisons/);

  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const id of [undefined, 'leclerc', 'boulangerie', 'lidl']) {
      const store = id && storeIds(gladys, id).device;
      const ack = await gladys.fake.widgetGet('store_hours', { settings: { store }, language });
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `${id} ${language}`);
    }
  }
  const all = await gladys.fake.widgetGet('store_hours', { settings: {}, language: 'fr' });
  assert.deepEqual(
    all.data.content.components[0].items.map((item) => item.value.fr ?? item.value),
    ['Ouvert · ferme à 20:00', 'Horaires non compris', 'Ouvert', 'Horaires introuvables'],
  );
  const one = await gladys.fake.widgetGet('store_hours', {
    settings: { store: storeIds(gladys, 'leclerc').device },
    language: 'fr',
  });
  const items = one.data.content.components.find((component) => component.type === 'status').items;
  assert.deepEqual(items.at(-1).value, 'E.Leclerc, Bourges · 1,3 km');

  const ask = await gladys.fake.sceneAction('is_store_open', {
    device: storeIds(gladys, 'lidl').device,
  });
  assert.equal(ask.success, false);

  // Saving the form again does not ask OpenStreetMap again.
  await gladys.fake.configUpdated({ stores: 'Leclerc = auto | Bio = 24/7', discover_kinds: [] });
  assert.equal(fetch.queries.length, 1);
  assert.equal(gladys.fake.lastState(storeIds(gladys, 'leclerc').feature('open')), 1);
});

test('no store written auto: the houses and OpenStreetMap are left alone', async () => {
  const { fetch } = await setup();
  assert.equal(fetch.queries.length, 0);
});

test('Discovery tab: shops near each house, the ones created become stores', async () => {
  const { gladys, fetch, hoursCache } = await setup({
    config: {
      stores: 'Bio = 24/7',
      discover_kinds: ['supermarket', 'pharmacy', 'recycling_centre'],
    },
  });
  assert.equal(fetch.queries.length, 1);
  // `out tags` would drop the coordinates of the nodes (most pharmacies).
  assert.match(fetch.queries[0], /\nout center;$/);
  const names = gladys.fake.discoveredDevices.map((device) => device.name);
  assert.deepEqual(names.slice(0, 1), ['Bio']);
  assert.deepEqual(
    new Set(names.slice(1)),
    new Set([
      'E.Leclerc (Maison, 1.3 km)',
      'Pharmacie Centrale (Maison, 58 m)',
      'Pharmacie du Marché (Campagne, 180 m)',
      'Déchetterie de Vierzon (Campagne, 1.6 km)',
    ]),
  );
  const leclerc = gladys.fake.discoveredDevices.find((device) =>
    device.name.startsWith('E.Leclerc'),
  );
  assert.equal(leclerc.external_id, storeIds(gladys, 'osm-w101').device);
  assert.deepEqual(leclerc.params, [
    { name: 'OSM_OPENING_HOURS', value: 'Mo-Sa 08:30-20:00; PH off' },
    { name: 'OSM_URL', value: 'https://www.openstreetmap.org/way/101' },
  ]);

  // The user creates it, under a name of their own.
  await gladys.fake.deviceCreated({ ...leclerc, name: 'Leclerc' });
  assert.equal(gladys.fake.lastState(storeIds(gladys, 'osm-w101').feature('open')), 1);
  const lines = (await gladys.fake.action('test_configuration', {})).data.message.fr.split('\n');
  assert.match(lines[2], /^Onglet Découverte : 4 commerce\(s\) trouvé\(s\) autour de /);
  assert.equal(
    lines[1],
    'Leclerc : Ouvert, ferme à 20:00. (OpenStreetMap : E.Leclerc, Bourges · 1,3 km, Mo-Sa 08:30-20:00; PH off)',
  );
  const ask = await gladys.fake.sceneAction('is_store_open', { device: leclerc.external_id });
  assert.equal(ask.data.outputs.open, true);
  const widget = await gladys.fake.widgetGet('store_hours', { settings: {}, language: 'fr' });
  assert.deepEqual(validateWidgetContent(widget.data.content), []);
  assert.equal(widget.data.content.components[0].items[1].label, 'Leclerc');

  // A restart without network: the cache, then the params Gladys keeps.
  const again = createFakeGladys({
    config: { stores: 'Bio = 24/7', discover_kinds: ['supermarket'], overpass_ch_key: KEY },
    houses: HOUSES,
    devices: [{ ...leclerc, name: 'Leclerc' }],
  });
  const down = fakeOverpass([]);
  down.down = true;
  createApp(again, {
    timers: false,
    now: fakeClock('2026-10-31T09:00:00Z'),
    fetch: down,
    hoursCache,
  });
  await again.connect();
  assert.equal(again.fake.lastState(storeIds(again, 'osm-w101').feature('open')), 1);
  const bare = createFakeGladys({
    config: { stores: '', discover_kinds: [], overpass_ch_key: KEY },
    houses: HOUSES,
    devices: [{ ...leclerc, name: 'Leclerc' }],
  });
  const offline = fakeOverpass([]);
  offline.down = true;
  createApp(bare, {
    timers: false,
    now: fakeClock('2026-10-31T09:00:00Z'),
    fetch: offline,
    hoursCache: memoryCache(),
  });
  await bare.connect();
  assert.equal(bare.fake.lastState(storeIds(bare, 'osm-w101').feature('open')), 1);

  // Deleted: no longer a store.
  await gladys.fake.deviceDeleted({ ...leclerc, name: 'Leclerc' });
  const after = (await gladys.fake.action('test_configuration', {})).data.message.fr;
  assert.ok(!after.includes('Leclerc :'), after);
});

test('test_configuration says why the Discovery tab is empty, and tries again', async () => {
  const gladys = createFakeGladys({
    config: {
      stores: '',
      discover_kinds: ['pharmacy'],
      search_houses: ['campagne'],
      overpass_ch_key: KEY,
    },
    houses: [{ ...HOUSES[1], latitude: null, longitude: null }],
  });
  const fetch = fakeOverpass(OSM_SHOPS);
  fetch.down = true;
  createApp(gladys, {
    timers: false,
    now: fakeClock('2026-10-30T18:00:00Z'),
    fetch,
    hoursCache: memoryCache(),
  });
  await gladys.connect();
  const test = async () =>
    (await gladys.fake.action('test_configuration', {})).data.message.fr.split('\n');
  assert.deepEqual((await test()).slice(0, 2), [
    'Aucun commerce créé ou écrit pour le moment.',
    "Onglet Découverte : aucune maison cherchée n'a d'emplacement : renseignez-le dans Paramètres → Maisons.",
  ]);
  // The house gets its location, OpenStreetMap is down, then back.
  gladys.fake.houses = HOUSES;
  assert.match(
    (await test())[1],
    /^Onglet Découverte : OpenStreetMap n'a pas pu être joint \(network down\)/,
  );
  fetch.down = false;
  assert.equal(
    (await test())[1],
    'Onglet Découverte : 1 commerce(s) trouvé(s) autour de Campagne : créez ceux où vous allez.',
  );
  assert.equal(fetch.queries.length, 2);
  assert.ok(
    gladys.fake.discoveredDevices.some((device) => device.name.startsWith('Pharmacie du Marché')),
  );
});

test('scene action is_store_open, per store', async () => {
  const { gladys } = await setup();
  const ask = (device) => gladys.fake.sceneAction('is_store_open', { device });
  const open = await ask(storeIds(gladys, 'leclerc').device);
  assert.deepEqual(open.data.outputs, { open: true, next_change: '20:00', minutes_to_change: 60 });
  const closed = await ask(storeIds(gladys, 'pharmacie').device);
  assert.equal(closed.data.outputs.open, false);
  assert.equal((await ask('ext:test-integration:store:gone')).success, false);

  const broken = await setup({ config: { stores: 'Bio = n/a' } });
  const ack = await broken.gladys.fake.sceneAction('is_store_open', {
    device: storeIds(broken.gladys, 'bio').device,
  });
  assert.equal(ack.success, false);
});

test('the store widget renders exactly as sent, in every language', async () => {
  const { gladys } = await setup();
  for (const language of ['en', 'fr', 'de', 'es']) {
    for (const store of [undefined, storeIds(gladys, 'leclerc').device]) {
      const ack = await gladys.fake.widgetGet('store_hours', { settings: { store }, language });
      assert.deepEqual(validateWidgetContent(ack.data.content), [], `store ${language}`);
    }
  }
});

test('the store widget: every store at a glance, one in detail', async () => {
  const { gladys } = await setup();
  const all = await gladys.fake.widgetGet('store_hours', { settings: {}, language: 'fr' });
  const [list] = all.data.content.components;
  assert.deepEqual(
    list.items.map((item) => [item.label, item.value, item.color]),
    [
      ['Leclerc', 'Ouvert · ferme à 20:00', 'success'],
      ['Pharmacie', 'Fermé · ouvre lundi à 09:00', 'danger'],
    ],
  );
  const one = await gladys.fake.widgetGet('store_hours', {
    settings: { store: storeIds(gladys, 'leclerc').device },
    language: 'fr',
  });
  assert.equal(one.data.content.components[0].text, 'Leclerc');
  assert.equal(one.data.content.components[1].value, 60);
});

test('the store widget: the hours of the next days, holidays marked', async () => {
  const { gladys } = await setup();
  const store = storeIds(gladys, 'leclerc').device;
  const rows = async (days, language = 'fr') => {
    const ack = await gladys.fake.widgetGet('store_hours', { settings: { store, days }, language });
    assert.deepEqual(validateWidgetContent(ack.data.content), [], `${days} ${language}`);
    return ack.data.content.components.find((c) => c.type === 'status').items;
  };
  // No setting (the widgets made before it): today only, as before.
  assert.equal((await rows(undefined)).length, 3);
  assert.equal((await rows(0)).length, 3);
  // Friday 30 October: Saturday, then All Saints' Day (a Sunday, PH off).
  const week = await rows(6);
  assert.equal(week.length, 9);
  assert.deepEqual(
    week.slice(3).map((item) => [item.label, item.value.fr ?? item.value, item.color]),
    [
      ['Demain', '08:30-20:00', 'neutral'],
      ['Dimanche 1 · férié', 'Fermé', 'warning'],
      ['Lundi 2', '08:30-20:00', 'neutral'],
      ['Mardi 3', '08:30-20:00', 'neutral'],
      ['Mercredi 4', '08:30-20:00', 'neutral'],
      ['Jeudi 5', '08:30-20:00', 'neutral'],
    ],
  );
  assert.equal((await rows(6, 'en'))[4].label, 'Sunday 1 · holiday');
  // Out of range or typed as text: kept within 0..6.
  assert.equal((await rows('2')).length, 5);
  assert.equal((await rows(99)).length, 9);
  assert.equal((await rows(-1)).length, 3);
  assert.equal((await rows('x')).length, 3);
  for (const language of ['en', 'fr', 'de', 'es']) {
    await rows(6, language);
  }
  // Every store at a glance: one row per store, the setting does not apply.
  const all = await gladys.fake.widgetGet('store_hours', { settings: { days: 6 }, language: 'fr' });
  assert.equal(all.data.content.components[0].items.length, 2);
});

test('the widget stays valid with no store and unreadable hours', async () => {
  const empty = await setup({ config: {} });
  const ack = await empty.gladys.fake.widgetGet('store_hours', { settings: {} });
  assert.deepEqual(validateWidgetContent(ack.data.content), []);
  const { gladys } = await setup({ config: { stores: 'Bio = oops' } });
  const all = await gladys.fake.widgetGet('store_hours', { settings: {}, language: 'fr' });
  assert.deepEqual(validateWidgetContent(all.data.content), []);
  assert.equal(all.data.content.components[0].items[0].value.fr, 'Horaires non compris');
  const one = await gladys.fake.widgetGet('store_hours', {
    settings: { store: storeIds(gladys, 'bio').device },
    language: 'fr',
  });
  assert.deepEqual(validateWidgetContent(one.data.content), []);
  assert.match(one.data.content.components[1].text.fr, /Les horaires ne sont pas compris/);
});
