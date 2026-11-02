import type { BlogContent, BlogRow, BlogVersion } from '../domain/blog.js';
import { renderBlogBody } from '../domain/blog.js';
import { PHOTOS, type PhotoId } from '../domain/photos.js';
import type { PackageVersion } from '../domain/packages.js';
import { Credit, Layout, Picture, type PageMeta } from './layout.js';
import { packagePath, type PageContext } from './pages.js';
import { CsrfField, StaffShell, type Viewer } from './staff-pages.js';
import { STAFF_CSS } from './staff-styles.js';

export function BlogIndexPage({ posts, ctx }: { posts: BlogVersion[]; ctx: PageContext }) {
  const meta: PageMeta = { title: 'Journal | Kochi Tours', description: 'Ideas and planning notes for Kerala and South India journeys.', path: '/journal', siteUrl: ctx.siteUrl };
  return <Layout meta={meta}><section class="section"><div class="wrap journal"><p class="eyebrow">Journal</p><h1>Ideas for the journey</h1><p class="lede">Small notes to help you choose a trip that feels right.</p>
    {posts.length ? <ul class="journal-list">{posts.map((p) => <li><a href={`/journal/${p.slug}`}><span>{p.category}</span><strong>{p.title}</strong><p>{p.excerpt}</p><small>Read article →</small></a></li>)}</ul> : <p class="empty">No articles have been published yet.</p>}
  </div></section></Layout>;
}

export function BlogArticlePage({ post, related, ctx, previewId }: { post: BlogVersion; related: PackageVersion[]; ctx: PageContext; previewId?: number }) {
  const photo = post.coverPhotoId ? PHOTOS[post.coverPhotoId] : null;
  const meta: PageMeta = { title: post.seoTitle, description: post.seoDescription, path: previewId ? `/staff/blogs/${previewId}/preview` : `/journal/${post.slug}`, siteUrl: ctx.siteUrl, image: photo, noindex: previewId !== undefined };
  return <Layout meta={meta} extraCss={previewId ? STAFF_CSS : undefined}>
    {previewId ? <div class="preview-banner" role="status"><strong>Private article preview</strong><span>This draft is not public.</span><a href={`/staff/blogs/${previewId}/edit`}>Back to editor</a></div> : null}
    <article class="wrap article"><p class="eyebrow">{post.category}</p><h1>{post.title}</h1><p class="article-deck">{post.excerpt}</p>
      {photo ? <figure><Picture photo={photo} sizes="(min-width: 50rem) 48rem, 100vw" eager /><figcaption class="credit-below"><Credit photo={photo} /></figcaption></figure> : null}
      <div class="article-body" dangerouslySetInnerHTML={{ __html: renderBlogBody(post.body) }} />
      {related.length ? <aside class="related" aria-labelledby="related-title"><h2 id="related-title">Trips mentioned here</h2><ul>{related.map((p) => <li><a href={packagePath(p.packageSlug)}>{p.title}<span>Explore package →</span></a></li>)}</ul></aside> : null}
      <p class="hint">Demo editorial content. Company A must review before using this as its own travel advice.</p>
    </article>
  </Layout>;
}

export function BlogStaffListPage({ rows, ctx, viewer }: { rows: BlogRow[]; ctx: PageContext; viewer: Viewer }) {
  return <StaffShell ctx={ctx} viewer={viewer} title="Journal" path="/staff/blogs" section="blogs"><div class="wrap staff-page cms"><div class="cms-head"><div><h1>Journal</h1><p class="lede">Create an article, preview it, and ask an admin to publish it.</p></div><a class="btn" href="/staff/blogs/new">New article</a></div>
    {rows.length ? <ul class="cms-list">{rows.map((r) => <li><a href={`/staff/blogs/${r.id}`}><strong>{r.draft?.title ?? r.live?.title ?? r.slug}</strong><span>/journal/{r.slug}</span></a><span class="chip">{r.draft ? 'Draft waiting' : 'Published'}</span></li>)}</ul> : <p class="empty-state">No articles yet. Start with one useful question travellers ask.</p>}
  </div></StaffShell>;
}

export type BlogForm = { slug: string; title: string; excerpt: string; body: string; category: string; coverPhotoId: string; seoTitle: string; seoDescription: string; relatedCodes: string };
export const emptyBlogForm = (): BlogForm => ({ slug: '', title: '', excerpt: '', body: '', category: '', coverPhotoId: '', seoTitle: '', seoDescription: '', relatedCodes: '' });
export const blogFormFromVersion = (v: BlogVersion): BlogForm => ({ slug: v.slug, title: v.title, excerpt: v.excerpt, body: v.body, category: v.category, coverPhotoId: v.coverPhotoId ?? '', seoTitle: v.seoTitle, seoDescription: v.seoDescription, relatedCodes: v.relatedCodes.join(', ') });
export function BlogEditorPage({ ctx, viewer, form, postId, lock, error }: { ctx: PageContext; viewer: Viewer; form: BlogForm; postId?: number; lock?: number; error?: string }) {
  const isNew = postId === undefined;
  const action = isNew ? '/staff/blogs/new' : `/staff/blogs/${postId}/edit`;
  return <StaffShell ctx={ctx} viewer={viewer} title={isNew ? 'New article' : 'Edit article'} path={action} section="blogs"><div class="wrap staff-page cms"><a class="link back" href={isNew ? '/staff/blogs' : `/staff/blogs/${postId}`}>Back to journal</a><h1>{isNew ? 'Write an article' : 'Edit the draft'}</h1><p class="lede">Use headings, bold text, links and image syntax in the editor. Save to see the real page before publishing.</p>
    {error ? <p class="error-summary" role="alert">{error}</p> : null}
    <form method="post" action={action} class="form cms-form"><CsrfField token={viewer.csrfToken} />{lock !== undefined ? <input type="hidden" name="lock" value={lock} /> : null}
      <section class="panel"><h2>Story</h2><div class="cms-fields">
        {isNew ? <div class="field"><label for="blog-slug">URL slug</label><input id="blog-slug" name="slug" value={form.slug} maxlength={100} required placeholder="a-week-in-kerala" /></div> : <p class="hint">/journal/{form.slug}</p>}
        <div class="field"><label for="blog-category">Category</label><input id="blog-category" name="category" value={form.category} maxlength={60} required placeholder="Planning" /></div>
        <div class="field full"><label for="blog-title">Title</label><input id="blog-title" name="title" value={form.title} maxlength={180} required /></div>
        <div class="field full"><label for="blog-excerpt">Short introduction</label><textarea id="blog-excerpt" name="excerpt" maxlength={500} rows={3} required>{form.excerpt}</textarea></div>
        <div class="field full"><label for="blog-body">Article</label><p class="hint">Formatting: ## Heading · **bold** · - list item · [link](https://example.com). Add a library image with ![description](/assets/images/alleppey-houseboat-900.jpg).</p><textarea id="blog-body" name="body" maxlength={20000} rows={18} required>{form.body}</textarea></div>
      </div></section>
      <section class="panel"><h2>Images and discovery</h2><div class="cms-fields">
        <div class="field"><label for="blog-photo">Cover photo</label><select id="blog-photo" name="coverPhotoId"><option value="">None</option>{Object.entries(PHOTOS).map(([key, photo]) => <option value={key} selected={form.coverPhotoId === key}>{photo.place}</option>)}</select></div>
        <div class="field"><label for="blog-related">Related package codes</label><input id="blog-related" name="relatedCodes" value={form.relatedCodes} placeholder="PKG-KL-07, SYN-KL-02" /></div>
        <div class="field"><label for="blog-seo-title">Search title</label><input id="blog-seo-title" name="seoTitle" value={form.seoTitle} maxlength={70} required /></div>
        <div class="field full"><label for="blog-seo-desc">Search description</label><textarea id="blog-seo-desc" name="seoDescription" maxlength={160} rows={2} required>{form.seoDescription}</textarea></div>
      </div></section><button class="btn" type="submit">Save private draft</button>
    </form>
  </div></StaffShell>;
}

export function BlogStaffDetailPage({ ctx, viewer, row, error, done }: { ctx: PageContext; viewer: Viewer; row: BlogRow; error?: string; done?: string }) {
  return <StaffShell ctx={ctx} viewer={viewer} title={row.draft?.title ?? row.live?.title ?? row.slug} path={`/staff/blogs/${row.id}`} section="blogs"><div class="wrap staff-page cms"><a class="link back" href="/staff/blogs">All articles</a><h1>{row.draft?.title ?? row.live?.title ?? row.slug}</h1><p class="lede">/journal/{row.slug}</p>
    {error ? <p class="error-summary" role="alert">{error}</p> : null}{done ? <p class="banner" role="status">{done}</p> : null}
    <section class="panel"><h2>Working draft</h2>{row.draft ? <><p>Version {row.draft.versionNo} is private until an admin publishes it.</p><div class="actions"><a class="btn" href={`/staff/blogs/${row.id}/edit`}>Edit draft</a><a class="btn secondary" href={`/staff/blogs/${row.id}/preview`}>Preview article</a></div>
      {viewer.role === 'admin' ? <form method="post" action={`/staff/blogs/${row.id}/publish`}><CsrfField token={viewer.csrfToken} /><input type="hidden" name="lock" value={row.draft.lockVersion} /><button class="btn" type="submit">Publish this version</button></form> : <p class="hint">Ask an admin to publish after review.</p>}</> : row.live ? <><p>Version {row.live.versionNo} is published.</p><form method="post" action={`/staff/blogs/${row.id}/revise`}><CsrfField token={viewer.csrfToken} /><button class="btn" type="submit">Start a revision</button></form></> : <p>No content yet.</p>}</section>
    {row.live ? <p><a class="link" href={`/journal/${row.slug}`}>View published article</a></p> : null}
  </div></StaffShell>;
}

export function blogContentFromForm(f: BlogForm): BlogContent {
  return { title: f.title, excerpt: f.excerpt, body: f.body, category: f.category, coverPhotoId: (f.coverPhotoId || null) as PhotoId | null,
    seoTitle: f.seoTitle, seoDescription: f.seoDescription, relatedCodes: f.relatedCodes.split(',').map((x) => x.trim()).filter(Boolean) };
}
