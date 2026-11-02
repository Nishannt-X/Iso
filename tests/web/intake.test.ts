import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get } from '../../src/db/db.js';
import { ADMIN, csrfOf, harness } from './staff-harness.js';

test('staff logs a mocked email enquiry into the shared inbox', async () => {
  const h = harness();
  const cookie = await h.login(ADMIN);
  const form = await (await h.get('/staff/intake/new', cookie)).text();
  const response = await h.post('/staff/intake/new', { _csrf: csrfOf(form), channel: 'email', package: 'munnar-thekkady-and-alleppey-houseboat-6-days', name: 'Demo Visitor', email: 'demo@example.invalid', phone: '', travelStart: '', adults: '2', children: '0', childAges: '', destination: 'Kerala', budget: '', budgetBasis: 'total', message: 'Houseboat in December, please.', whatsappConsent: '' }, cookie);
  assert.equal(response.status, 303);
  const row = get<{ id: number; intake_channel: string }>(h.db, "SELECT id,intake_channel FROM enquiries WHERE name='Demo Visitor'");
  assert.equal(row?.intake_channel, 'email');
  const inbox = await (await h.get('/staff/inbox', cookie)).text();
  assert.match(inbox, /Demo Visitor/);
  assert.match(inbox, /email/);
});
