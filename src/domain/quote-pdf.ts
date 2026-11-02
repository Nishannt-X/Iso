import PDFDocument from 'pdfkit';
import type { StoredQuote } from './package-quotes.js';

const money = (n: number) => `INR ${n.toLocaleString('en-IN')}`;

/** Branded, deterministic PDF from the stored quote snapshot; later price edits cannot alter it. */
export async function renderQuotePdf(row: StoredQuote): Promise<Buffer> {
  const chunks: Buffer[] = [];
  const pdf = new PDFDocument({ size: 'A4', margin: 48, info: { Title: `Kochi Tours quote ${row.id}`, Author: 'Kochi Tours demo' } });
  const result = new Promise<Buffer>((resolve, reject) => {
    pdf.on('data', (chunk: Buffer) => chunks.push(chunk));
    pdf.on('end', () => resolve(Buffer.concat(chunks)));
    pdf.on('error', reject);
  });
  const { snapshot: s } = row;
  pdf.rect(0, 0, 595, 12).fill('#176b70');
  pdf.fillColor('#176b70').font('Helvetica-Bold').fontSize(22).text('KOCHI TOURS');
  pdf.fillColor('#49555b').font('Helvetica').fontSize(10).text('A considered journey through South India');
  pdf.moveDown(2);
  pdf.fillColor('#17272b').font('Helvetica-Bold').fontSize(20).text(s.title);
  pdf.font('Helvetica').fontSize(10).text(`Quote #${row.id}   |   Package ${s.code}, version ${s.versionNo}   |   ${s.days} days`);
  pdf.moveDown(1);
  pdf.text(`Start date: ${s.startDate}    Travellers: ${s.adults} adult${s.adults === 1 ? '' : 's'}, ${s.children} child${s.children === 1 ? '' : 'ren'}`);
  pdf.text(`Hotels: ${s.hotels}`);
  pdf.moveDown(1.5);
  pdf.font('Helvetica-Bold').fontSize(12).text('Fare estimate');
  pdf.moveDown(.5);
  for (const line of s.pricing.lines) {
    pdf.font('Helvetica').fontSize(10).text(`${line.label}  x ${line.quantity}`, { continued: true });
    pdf.text(money(line.amount_inr), { align: 'right' });
  }
  pdf.moveDown(.5);
  pdf.moveTo(48, pdf.y).lineTo(547, pdf.y).strokeColor('#d5ddde').stroke();
  pdf.moveDown(.5);
  pdf.font('Helvetica-Bold').text(`Subtotal: ${money(s.pricing.subtotal_inr ?? 0)}`);
  if (s.pricing.gst) pdf.font('Helvetica').text(`GST (${s.pricing.gst.rate_bp / 100}%): ${money(s.pricing.gst.amount_inr)}`);
  else pdf.font('Helvetica').text('GST: to be confirmed by Company A; not included in subtotal.');
  if (s.pricing.total_inr !== undefined) pdf.font('Helvetica-Bold').fontSize(13).text(`Total: ${money(s.pricing.total_inr)}`);
  pdf.moveDown(1.5);
  pdf.fillColor('#176b70').font('Helvetica-Bold').fontSize(11).text(s.pricing.status === 'partial' ? 'PARTIAL ESTIMATE - NOT A FINAL FARE' : 'FARE BASIS');
  pdf.fillColor('#17272b').font('Helvetica').fontSize(9).text('Prices are per person, twin sharing. Availability and final booking terms require confirmation.');
  for (const issue of s.pricing.unpriced) pdf.text(`- ${issue.message}`);
  pdf.moveDown(.8);
  for (const assumption of s.pricing.assumptions) pdf.text(`- ${assumption}`);
  pdf.moveDown(1.5);
  pdf.fillColor('#69777c').fontSize(9).text('Demo quote. Delivery is mocked; this PDF is generated for review and does not confirm a booking.');
  pdf.end();
  return result;
}
