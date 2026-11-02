import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { all, get, run, transaction, type DatabaseSync } from '../db/db.js';
import { writeAudit } from './audit.js';
import { DomainError } from './packages.js';
import { PHOTOS, type PhotoId } from './photos.js';

export interface BlogContent {
  title: string;
  excerpt: string;
  body: string;
  category: string;
  coverPhotoId: PhotoId | null;
  seoTitle: string;
  seoDescription: string;
  relatedCodes: string[];
}
export interface BlogVersion extends BlogContent {
  id: number; postId: number; slug: string; versionNo: number; status: 'draft' | 'published' | 'superseded';
  lockVersion: number; updatedAt: string; publishedAt: string | null;
}
export interface BlogRow { id: number; slug: string; draft: BlogVersion | null; live: BlogVersion | null }

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = (s: string, max: number, label: string) => {
  const value = s.trim();
  if (!value || value.length > max) throw new DomainError('validation', `${label} must be 1–${max} characters.`);
  return value;
};

function checkContent(db: DatabaseSync, c: BlogContent): BlogContent {
  const related = [...new Set(c.relatedCodes.map((x) => x.trim()).filter(Boolean))];
  if (c.coverPhotoId && !(c.coverPhotoId in PHOTOS)) throw new DomainError('validation', 'Choose a photo from the library.');
  if (related.length > 6) throw new DomainError('validation', 'Choose up to six related packages.');
  for (const code of related) if (!get(db, "SELECT 1 FROM packages p JOIN live_versions v ON v.package_id=p.id WHERE p.code=?", code)) throw new DomainError('validation', `Related package ${code} is not published.`);
  return {
    title: text(c.title, 180, 'Title'), excerpt: text(c.excerpt, 500, 'Excerpt'), body: text(c.body, 20000, 'Article'),
    category: text(c.category, 60, 'Category'), coverPhotoId: c.coverPhotoId,
    seoTitle: text(c.seoTitle, 70, 'SEO title'), seoDescription: text(c.seoDescription, 160, 'SEO description'), relatedCodes: related,
  };
}

interface Row {
  id: number; post_id: number; slug: string; version_no: number; status: BlogVersion['status']; lock_version: number;
  title: string; excerpt: string; body_markdown: string; category: string; cover_photo_id: string | null;
  seo_title: string; seo_description: string; related_codes_json: string; updated_at: string; published_at: string | null;
}
const SELECT = 'SELECT v.*, p.slug FROM blog_versions v JOIN blog_posts p ON p.id=v.post_id';
function hydrate(r: Row): BlogVersion {
  return { id: r.id, postId: r.post_id, slug: r.slug, versionNo: r.version_no, status: r.status, lockVersion: r.lock_version,
    title: r.title, excerpt: r.excerpt, body: r.body_markdown, category: r.category, coverPhotoId: r.cover_photo_id as PhotoId | null,
    seoTitle: r.seo_title, seoDescription: r.seo_description, relatedCodes: JSON.parse(r.related_codes_json) as string[],
    updatedAt: r.updated_at, publishedAt: r.published_at };
}
export function getBlogVersion(db: DatabaseSync, postId: number, status: 'draft' | 'published'): BlogVersion | null {
  const r = get<Row>(db, `${SELECT} WHERE p.id=? AND v.status=?`, postId, status);
  return r ? hydrate(r) : null;
}
export function getLiveBlogBySlug(db: DatabaseSync, slug: string): BlogVersion | null {
  const r = get<Row>(db, `${SELECT} WHERE p.slug=? AND v.status='published'`, slug);
  return r ? hydrate(r) : null;
}
export function listLiveBlogs(db: DatabaseSync): BlogVersion[] {
  return all<Row>(db, `${SELECT} WHERE v.status='published' ORDER BY v.published_at DESC, v.id DESC`).map(hydrate);
}
export function listStaffBlogs(db: DatabaseSync): BlogRow[] {
  return all<{ id: number; slug: string }>(db, 'SELECT id, slug FROM blog_posts ORDER BY id DESC').map((p) => ({ id: p.id, slug: p.slug, draft: getBlogVersion(db, p.id, 'draft'), live: getBlogVersion(db, p.id, 'published') }));
}

function insertVersion(db: DatabaseSync, postId: number, versionNo: number, actorId: number, content: BlogContent): number {
  const c = checkContent(db, content);
  return Number(run(db, `INSERT INTO blog_versions (post_id, version_no, status, title, excerpt, body_markdown, category, cover_photo_id, seo_title, seo_description, related_codes_json, created_by)
    VALUES (?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?)`, postId, versionNo, c.title, c.excerpt, c.body, c.category, c.coverPhotoId, c.seoTitle, c.seoDescription, JSON.stringify(c.relatedCodes), actorId).lastInsertRowid);
}
export function createBlog(db: DatabaseSync, slug: string, actorId: number, content: BlogContent): number {
  if (!SLUG.test(slug) || slug.length > 100) throw new DomainError('validation', 'Use a short lowercase URL with hyphens.');
  return transaction(db, () => {
    if (get(db, 'SELECT 1 FROM blog_posts WHERE slug=?', slug)) throw new DomainError('validation', 'That URL is already in use.');
    const postId = Number(run(db, 'INSERT INTO blog_posts (slug) VALUES (?)', slug).lastInsertRowid);
    const versionId = insertVersion(db, postId, 1, actorId, content);
    writeAudit(db, actorId, 'blog.create', 'blog_version', versionId);
    return postId;
  });
}
export function saveBlogDraft(db: DatabaseSync, postId: number, lock: number, actorId: number, content: BlogContent): void {
  transaction(db, () => {
    const draft = getBlogVersion(db, postId, 'draft');
    if (!draft) throw new DomainError('not_found', 'There is no draft to edit.');
    if (draft.lockVersion !== lock) throw new DomainError('conflict', 'The article changed. Reload before saving.');
    const c = checkContent(db, content);
    run(db, `UPDATE blog_versions SET title=?, excerpt=?, body_markdown=?, category=?, cover_photo_id=?, seo_title=?, seo_description=?, related_codes_json=?,
      lock_version=lock_version+1, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`,
    c.title, c.excerpt, c.body, c.category, c.coverPhotoId, c.seoTitle, c.seoDescription, JSON.stringify(c.relatedCodes), draft.id);
    writeAudit(db, actorId, 'blog.save_draft', 'blog_version', draft.id);
  });
}
export function startBlogRevision(db: DatabaseSync, postId: number, actorId: number): number {
  return transaction(db, () => {
    if (getBlogVersion(db, postId, 'draft')) throw new DomainError('draft_exists', 'This article already has a draft.');
    const live = getBlogVersion(db, postId, 'published');
    if (!live) throw new DomainError('not_found', 'There is no published article to revise.');
    const id = insertVersion(db, postId, live.versionNo + 1, actorId, live);
    writeAudit(db, actorId, 'blog.revise', 'blog_version', id);
    return id;
  });
}
export function publishBlog(db: DatabaseSync, postId: number, lock: number, actorId: number): void {
  transaction(db, () => {
    const draft = getBlogVersion(db, postId, 'draft');
    if (!draft) throw new DomainError('not_found', 'There is no draft to publish.');
    if (draft.lockVersion !== lock) throw new DomainError('conflict', 'The article changed. Reload and review before publishing.');
    checkContent(db, draft);
    run(db, "UPDATE blog_versions SET status='superseded' WHERE post_id=? AND status='published'", postId);
    run(db, "UPDATE blog_versions SET status='published', published_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", draft.id);
    writeAudit(db, actorId, 'blog.publish', 'blog_version', draft.id);
  });
}

/** Markdown is rendered only after sanitization; articles cannot inject scripts or external images. */
export function renderBlogBody(markdown: string): string {
  const html = marked.parse(markdown, { async: false, gfm: true, breaks: false });
  return sanitizeHtml(html, {
    allowedTags: ['p', 'h2', 'h3', 'h4', 'strong', 'em', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'hr', 'br'],
    allowedAttributes: { a: ['href', 'title', 'rel'], img: ['src', 'alt'] },
    allowedSchemes: ['http', 'https'],
    transformTags: {
      a: (_tag, attrs) => ({ tagName: 'a', attribs: { href: attrs.href ?? '#', rel: 'noopener noreferrer' } }),
      img: (_tag, attrs) => {
        if (/^\/assets\/images\/[a-z0-9-]+-(900|2000)\.jpg$/.test(attrs.src ?? '')) {
          return { tagName: 'img', attribs: { src: attrs.src!, alt: attrs.alt ?? '' } };
        }
        return { tagName: 'span', attribs: {} as Record<string, string> };
      },
    },
  });
}
