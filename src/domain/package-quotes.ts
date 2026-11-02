import { randomBytes } from 'node:crypto';
import { all, get, run, transaction, type DatabaseSync } from '../db/db.js';
import { writeAudit } from './audit.js';
import { indiaToday } from './enquiries.js';
import { DomainError, getLiveVersionBySlug } from './packages.js';
import { getGstRateBp, quote, type Quote } from './pricing.js';

export interface QuoteSnapshot {
  code: string; title: string; slug: string; versionNo: number; days: number; hotels: string;
  startDate: string; adults: number; children: number; pricing: Quote;
}
export interface StoredQuote {
  id: number; token: string; enquiryId: number; status: 'draft' | 'approved' | 'mock_recorded';
  snapshot: QuoteSnapshot; createdAt: string; approvedAt: string | null; recordedAt: string | null;
}
interface Row { id: number; public_token: string; enquiry_id: number; status: StoredQuote['status']; snapshot_json: string; created_at: string; approved_at: string | null; recorded_at: string | null }
const hydrate = (r: Row): StoredQuote => ({ id: r.id, token: r.public_token, enquiryId: r.enquiry_id, status: r.status, snapshot: JSON.parse(r.snapshot_json) as QuoteSnapshot, createdAt: r.created_at, approvedAt: r.approved_at, recordedAt: r.recorded_at });

export function listQuotes(db: DatabaseSync, enquiryId: number): StoredQuote[] {
  return all<Row>(db, 'SELECT * FROM package_quotes WHERE enquiry_id=? ORDER BY id DESC', enquiryId).map(hydrate);
}
export function getQuote(db: DatabaseSync, id: number): StoredQuote | null {
  const row = get<Row>(db, 'SELECT * FROM package_quotes WHERE id=?', id);
  return row ? hydrate(row) : null;
}
export function getPublicQuote(db: DatabaseSync, token: string): StoredQuote | null {
  const row = /^[a-f0-9]{48}$/.test(token) ? get<Row>(db, "SELECT * FROM package_quotes WHERE public_token=? AND status IN ('approved','mock_recorded')", token) : undefined;
  return row ? hydrate(row) : null;
}

export function createPackageQuote(db: DatabaseSync, input: { enquiryId: number; slug: string; startDate: string; adults: number; children: number; actorId: number; now: Date }): number {
  const { enquiryId, slug, startDate, adults, children, actorId, now } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !Number.isFinite(Date.parse(`${startDate}T00:00:00Z`)) || new Date(`${startDate}T00:00:00Z`).toISOString().slice(0, 10) !== startDate || startDate < indiaToday(now)) throw new DomainError('validation', 'Choose a real future start date.');
  if (!Number.isInteger(adults) || adults < 1 || adults > 50 || !Number.isInteger(children) || children < 0 || children > 20) throw new DomainError('validation', 'Choose 1–50 adults and 0–20 children.');
  const enquiry = get<{ id: number }>(db, 'SELECT id FROM enquiries WHERE id=?', enquiryId);
  if (!enquiry) throw new DomainError('not_found', 'Enquiry not found.');
  const version = getLiveVersionBySlug(db, slug);
  if (!version) throw new DomainError('validation', 'Choose a published package.');
  const pricing = quote(version, { when: { startDate }, adults, children: Array.from({ length: children }, () => ({})), gstRateBp: getGstRateBp(db) });
  if (pricing.status === 'unavailable') throw new DomainError('validation', 'This package has no price for that date. Choose a priced date.');
  const snapshot: QuoteSnapshot = { code: version.packageCode, title: version.title, slug: version.packageSlug, versionNo: version.versionNo, days: version.days,
    hotels: version.starRating ? `${version.starRating}-star category` : 'Hotel category to confirm', startDate, adults, children, pricing };
  return transaction(db, () => {
    const id = Number(run(db, 'INSERT INTO package_quotes (public_token,enquiry_id,package_version_id,start_date,adults,children,snapshot_json,created_by) VALUES (?,?,?,?,?,?,?,?)',
      randomBytes(24).toString('hex'), enquiryId, version.id, startDate, adults, children, JSON.stringify(snapshot), actorId).lastInsertRowid);
    writeAudit(db, actorId, 'quote.create', 'package_quote', id);
    return id;
  });
}

export function approvePackageQuote(db: DatabaseSync, id: number, actorId: number): void {
  transaction(db, () => {
    const row = getQuote(db, id);
    if (!row) throw new DomainError('not_found', 'Quote not found.');
    if (row.status !== 'draft') throw new DomainError('invalid_state', 'This quote is already approved.');
    run(db, "UPDATE package_quotes SET status='approved', approved_by=?, approved_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", actorId, id);
    writeAudit(db, actorId, 'quote.approve', 'package_quote', id);
  });
}

export function recordPackageQuote(db: DatabaseSync, id: number, actorId: number): void {
  transaction(db, () => {
    const row = getQuote(db, id);
    if (!row) throw new DomainError('not_found', 'Quote not found.');
    if (row.status !== 'approved') throw new DomainError('invalid_state', 'Approve the quote first.');
    run(db, "UPDATE package_quotes SET status='mock_recorded', recorded_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?", id);
    writeAudit(db, actorId, 'quote.mock_record', 'package_quote', id);
  });
}
