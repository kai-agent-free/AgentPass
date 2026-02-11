export interface IncomingEmail {
  id: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  html?: string;
  received_at: string;
}

export interface EmailFilter {
  from?: string;
  subject?: string;
  after?: string;
}
