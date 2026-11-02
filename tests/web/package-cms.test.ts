import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get } from '../../src/db/db.js';
import { ADMIN, C1, csrfOf, harness, lockOf } from './staff-harness.js';

test('admin can create, preview and publish; consultant cannot edit; public sees only published content', async () => {
  const h = harness();
  const admin = await h.login(ADMIN);
  const consultant = await h.login(C1);
  assert.equal((await h.get('/staff/packages', consultant)).status, 403);
  const token = csrfOf(await (await h.get('/staff/packages/new', admin)).text());
  const created = await h.post('/staff/packages/new', {
    _csrf: token, code: 'PKG-KL-88', slug: 'new-kerala-trip', title: 'New Kerala trip', summary: 'A private draft.', region: 'Kerala', days: '1', nights: '0',
    itinerary: 'Arrival | Meet your guide.', seasons: 'All year | 01-01 | 12-31 | 12000 | confirmed', changeNote: 'Initial draft',
  }, admin);
  assert.equal(created.status, 303);
  const id = get<{ id: number }>(h.db, "SELECT id FROM packages WHERE code = 'PKG-KL-88'")!.id;
  assert.equal((await h.get('/packages/new-kerala-trip')).status, 404);
  const preview = await h.get(`/staff/packages/${id}/preview`, admin);
  assert.equal(preview.status, 200);
  assert.match(await preview.text(), /New Kerala trip/);
  const historyHtml = await (await h.get(`/staff/packages/${id}`, admin)).text();
  const published = await h.post(`/staff/packages/${id}/publish`, { _csrf: csrfOf(historyHtml), lock: lockOf(historyHtml), note: 'Ready for travellers' }, admin);
  assert.equal(published.status, 303);
  assert.equal((await h.get('/packages/new-kerala-trip')).status, 200);
});
