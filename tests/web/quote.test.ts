import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get } from '../../src/db/db.js';
import { ADMIN, csrfOf, harness } from './staff-harness.js';

test('a quote keeps the package price snapshot, needs approval, and yields a PDF', async () => {
  const h = harness();
  const enquiry = h.addEnquiry({ children: 1 });
  const staff = await h.login(ADMIN);
  const builder = await (await h.get(`/staff/quotes/new?enquiry=${enquiry}`, staff)).text();
  const created = await h.post('/staff/quotes/new', { _csrf: csrfOf(builder), enquiryId: String(enquiry), slug: 'munnar-thekkady-and-alleppey-houseboat-6-days', date: '2026-12-12', adults: '2', children: '1' }, staff);
  assert.equal(created.status, 303);
  const id = get<{ id: number }>(h.db, 'SELECT id FROM package_quotes WHERE enquiry_id=?', enquiry)!.id;
  const row = get<{ public_token: string; snapshot_json: string }>(h.db, 'SELECT public_token,snapshot_json FROM package_quotes WHERE id=?', id)!;
  assert.equal((await h.get(`/quote/${row.public_token}`)).status, 404);
  const snapshot = JSON.parse(row.snapshot_json) as { pricing: { status: string; subtotal_inr: number } };
  assert.equal(snapshot.pricing.status, 'partial');
  assert.equal(snapshot.pricing.subtotal_inr, 65_000);
  const detail = await (await h.get(`/staff/quotes/${id}`, staff)).text();
  assert.equal((await h.post(`/staff/quotes/${id}/approve`, { _csrf: csrfOf(detail), review: 'yes' }, staff)).status, 303);
  const publicPage = await (await h.get(`/quote/${row.public_token}`)).text();
  assert.match(publicPage, /Partial fare estimate/);
  assert.match(publicPage, /GST/);
  const pdf = await h.get(`/quote/${row.public_token}/download`);
  assert.equal(pdf.status, 200);
  assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0, 4).toString(), '%PDF');
});
