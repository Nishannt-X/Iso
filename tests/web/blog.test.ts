import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get } from '../../src/db/db.js';
import { ADMIN, csrfOf, harness, lockOf } from './staff-harness.js';

test('editor drafts a safe article; admin publishes it; public sees only the reviewed version', async () => {
  const h = harness();
  const editor = await h.login('editor@staff.example.invalid');
  assert.equal((await h.get('/staff/inbox', editor)).status, 403);
  const token = csrfOf(await (await h.get('/staff/blogs/new', editor)).text());
  const created = await h.post('/staff/blogs/new', {
    _csrf: token, slug: 'new-demo-story', title: 'A new demo story', excerpt: 'A short planning note.', body: '## Plan well\n\n**Hello** <script>alert(1)</script>',
    category: 'Planning', coverPhotoId: 'munnar-tea', seoTitle: 'New demo story | Kochi Tours', seoDescription: 'A short planning note for a demo trip.', relatedCodes: 'PKG-KL-07',
  }, editor);
  assert.equal(created.status, 303);
  assert.equal((await h.get('/journal/new-demo-story')).status, 404);
  const id = get<{ id: number }>(h.db, "SELECT id FROM blog_posts WHERE slug='new-demo-story'")!.id;
  const admin = await h.login(ADMIN);
  const detail = await (await h.get(`/staff/blogs/${id}`, admin)).text();
  assert.equal((await h.post(`/staff/blogs/${id}/publish`, { _csrf: csrfOf(detail), lock: lockOf(detail) }, admin)).status, 303);
  const page = await (await h.get('/journal/new-demo-story')).text();
  assert.match(page, /A new demo story/);
  assert.doesNotMatch(page, /<script>/);
});
