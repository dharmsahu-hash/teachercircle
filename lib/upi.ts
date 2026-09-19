import QRCode from "qrcode";

export function buildUpiDeepLink(amount: number, note: string): string {
  const params = new URLSearchParams({
    pa: process.env.UPI_PAYEE_VPA || "yourname@upi",
    pn: process.env.UPI_PAYEE_NAME || "TeacherCircle",
    am: amount.toFixed(2),
    cu: "INR",
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}

// Donations: no `am` param at all, not just an editable one — omitting it
// (rather than defaulting to e.g. 0.00 or a preset) is what makes a UPI app
// prompt the payer for their own amount instead of pre-filling something
// that looks like a suggested price.
export function buildUpiDonationLink(note = "Support TeacherCircle"): string {
  const params = new URLSearchParams({
    pa: process.env.UPI_PAYEE_VPA || "yourname@upi",
    pn: process.env.UPI_PAYEE_NAME || "TeacherCircle",
    cu: "INR",
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}

export async function buildUpiQrDataUrl(deepLink: string): Promise<string> {
  return QRCode.toDataURL(deepLink, { margin: 1, width: 320 });
}
