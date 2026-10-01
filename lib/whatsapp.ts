// WhatsApp chat links (growth idea #4). Only ever built from a phone number
// the viewer is allowed to see, i.e. one returned by reveal_teacher_contact()
// after Connect — teacher phone numbers are never public (AGENTS.md).

// Normalizes an Indian phone number to the international digits wa.me wants
// (91XXXXXXXXXX). Accepts "+91 98765 43210", "098765 43210", "9876543210".
// Returns null for anything that is not clearly an Indian mobile number,
// so no button is shown rather than a broken one.
export function toWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) return digits;
  return null;
}

export function whatsAppChatLink(phone: string | null | undefined, message: string): string | null {
  const number = toWhatsAppNumber(phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

// The opening message a parent sends. Short and specific, so the teacher can
// answer straight away, and it names TeacherCircle so they know the source.
export function inquiryMessage(teacherName: string, subjects: string[] | null | undefined): string {
  const firstName = teacherName.trim().split(/\s+/)[0] || teacherName;
  const subject = subjects && subjects.length > 0 ? subjects[0] : null;
  return `Hi ${firstName}, I found you on TeacherCircle. I'm looking for ${subject ? `${subject} ` : ""}tuition. Class: __ , Board: __ . Are you available?`;
}
