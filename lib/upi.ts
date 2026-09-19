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

export async function buildUpiQrDataUrl(deepLink: string): Promise<string> {
  return QRCode.toDataURL(deepLink, { margin: 1, width: 320 });
}
