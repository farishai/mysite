export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string; // Message-ID header of the email being answered
}
export type Mailer = (mail: OutgoingMail) => Promise<void>;

/** Sends through Postmark's outbound API. Needs POSTMARK_SERVER_TOKEN and MAIL_FROM. */
export const postmarkMailer: Mailer = async (mail) => {
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      "x-postmark-server-token": process.env.POSTMARK_SERVER_TOKEN!,
    },
    body: JSON.stringify({
      From: process.env.MAIL_FROM,
      To: mail.to,
      Subject: mail.subject,
      TextBody: mail.text,
      MessageStream: "outbound",
      // Marks it as an automatic reply so other auto-responders don't answer it.
      Headers: [
        { Name: "Auto-Submitted", Value: "auto-replied" },
        ...(mail.inReplyTo ? [{ Name: "In-Reply-To", Value: mail.inReplyTo }] : []),
      ],
    }),
  });
  if (!res.ok) throw new Error(`Postmark send failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
};

export const mailConfigured = () => !!(process.env.POSTMARK_SERVER_TOKEN && process.env.MAIL_FROM);

/** The mailer used in production; null when email isn't configured (replies are then skipped). */
export const defaultMailer = (): Mailer | null => (mailConfigured() ? postmarkMailer : null);
