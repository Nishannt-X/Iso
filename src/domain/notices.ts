// Wording shown on the enquiry form. The version string is stored with every enquiry, and the
// exact WhatsApp consent text is stored with every consent, so the record shows what was agreed to.
//
// DRAFT: the brief says traveller data is personal data under the DPDP Act 2023 and that WhatsApp
// follow-ups need consent. It gives no notice wording, retention period or grievance contact, so
// none is invented here. Company A and its legal adviser must approve this text before launch.

export const PRIVACY_NOTICE_VERSION = 'draft-2';

export const PRIVACY_NOTICE: readonly string[] = [
  'We use the details you enter here only to reply to this enquiry, including to prepare a quote. They are saved in Company A’s enquiry system and can be seen by the staff who handle enquiries.',
  'When AI analysis is enabled, your enquiry message may be processed by Google Gemini API to help staff extract trip details and draft a reply. A consultant reviews the result before any reply is recorded.',
  'Sending the form is not consent to WhatsApp messages. That is a separate, optional choice above.',
];

/** Visible, honest label for what this build does and does not do. */
export const DEMO_NOTICE = 'Demo build: please use made-up details. Your enquiry is saved in this demo’s database, and no email, SMS or WhatsApp message is actually sent.';

/** Draft status of the notice itself, shown beneath it. */
export const PRIVACY_DRAFT_NOTE = 'Draft notice: retention period, contact for questions and DPDP Act 2023 wording are still to be confirmed by Company A.';

export const WHATSAPP_CONSENT_TEXT =
  'Company A may contact me on WhatsApp, on the phone number above, about this enquiry. This is optional, and I can withdraw it at any time.';
