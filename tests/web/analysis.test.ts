import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAnalysis, suggestedReply } from '../../src/domain/analysis.js';
import { ADMIN, csrfOf, harness } from './staff-harness.js';

test('local fallback proposes details, staff accepts corrections, and prices come from stored packages', async () => {
  const h = harness();
  const id = h.addEnquiry({ message: 'Hi, 2 adults and 1 kid, Kerala in December, budget around 1.2 lakh total, houseboat a must' });
  const cookie = await h.login(ADMIN);
  const token = csrfOf(await (await h.get(`/staff/enquiries/${id}`, cookie)).text());
  const analysed = await h.post(`/staff/enquiries/${id}/analyse`, { _csrf: token }, cookie);
  assert.equal(analysed.status, 303);
  const proposal = getAnalysis(h.db, id)!;
  assert.equal(proposal.source, 'local_fallback');
  assert.equal(proposal.fields.month, 12);
  assert.equal(proposal.fields.budgetInr, 120000);
  assert.equal(proposal.suggestions.length, 3);
  assert.ok(proposal.suggestions.some((s) => s.title.includes('houseboat')));
  const accepted = await h.post(`/staff/enquiries/${id}/analysis/accept`, {
    _csrf: token, month: '12', adults: '2', children: '1', destination: 'Kerala', budgetInr: '120000', budgetBasis: 'total', mustHave: 'houseboat',
  }, cookie);
  assert.equal(accepted.status, 303);
  const result = getAnalysis(h.db, id)!;
  assert.equal(result.status, 'accepted');
  assert.match(suggestedReply(result), /per person, twin sharing, before GST/);
});
