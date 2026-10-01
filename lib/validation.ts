// Request validation for API routes (docs/05 finding #5).
//
// Every route that reads a JSON body calls parseJsonBody(req, schema); every
// route with an id in its URL checks it with isId(). Two reasons beyond tidy
// 400s:
//  - ids are interpolated into PostgREST filters (`user_id=eq.${id}`), so an
//    unchecked value containing `&` or `,` could add filters of its own;
//  - a malformed JSON body used to throw inside the route and surface as a 500.
//
// Schemas describe shape, type and size only. Business rules (password
// strength, profanity, phone format, "can't block yourself") stay in the
// routes and lib/ helpers that already own them.

// Plain Response, not NextResponse: route handlers accept either, and this
// keeps the module importable from the unit tests (plain Node, no Next).
import { z } from "zod";

// z.guid(), not z.uuid(): any 8-4-4-4-12 hex id is accepted. Postgres and
// GoTrue generate v4 UUIDs, but db/seed.sql uses readable ids such as
// a0000000-0000-0000-0000-000000000001 that a strict RFC check rejects.
export const id = z.guid({ message: "Invalid id" });

export function isId(value: unknown): value is string {
  return id.safeParse(value).success;
}

// Optional text from a form: missing, null, or a string up to `max` chars.
// Empty strings are kept as they are; routes decide what "" means.
const optionalText = (max: number, label: string) =>
  z.string({ message: `${label} must be text` }).max(max, `${label} is too long (max ${max} characters)`).nullish();

// A number that may arrive as a number, a numeric string from an <input>, or
// "" / null meaning "not set".
const optionalNumber = (label: string, min: number, max: number, integer = false) =>
  z
    .union([z.number(), z.string(), z.null()])
    .optional()
    .refine(
      (v) => {
        if (v === undefined || v === null || v === "") return true;
        const n = Number(v);
        return Number.isFinite(n) && n >= min && n <= max && (!integer || Number.isInteger(n));
      },
      { message: `${label} must be ${integer ? "a whole number" : "a number"} between ${min} and ${max}` }
    );

// "Maths, Physics" from a text box, or ["Maths", "Physics"].
const subjects = z
  .union([
    z.string().max(500, "Subjects list is too long"),
    z.array(z.string().max(50, "A subject name is too long")).max(20, "Too many subjects (max 20)"),
  ])
  .nullish();

const email = z.email({ message: "Please enter a valid email address" }).max(254);
const optionalEmail = z.union([z.literal(""), email]).nullish();

// ---- auth ----
export const signupSchema = z.object({
  email: z.string({ message: "Email and password are required" }).trim().min(1, "Email and password are required").pipe(email),
  password: z.string({ message: "Email and password are required" }).min(1, "Email and password are required").max(128, "Password is too long"),
});
export const loginSchema = signupSchema;

export const roleSchema = z.object({
  role: z.enum(["student", "parent", "teacher"], { message: "Invalid role" }),
  // Referral id from an invite link. Best effort: a bad value is ignored by
  // the route, never a reason to fail onboarding.
  ref: z.string().max(100).nullish(),
});

export const setSessionSchema = z.object({
  access_token: z.string({ message: "missing token" }).min(1, "missing token").max(8192),
  refresh_token: z.string().max(8192).nullish(),
  expires_in: z.union([z.number(), z.string()]).nullish(),
});

// ---- account ----
export const avatarSchema = z.object({ seed: z.string({ message: "Invalid avatar selection" }).max(64, "Invalid avatar selection") });

export const contactSchema = z.object({
  fullName: z.string({ message: "Please enter your name" }).max(200, "Name is too long"),
  phone: optionalText(30, "Phone number"),
});

// ---- teacher profile (partial updates: every field optional) ----
export const teacherProfileSchema = z.object({
  name: optionalText(120, "Name"),
  bio: optionalText(2000, "Bio"),
  city: optionalText(80, "City"),
  pincode: z.union([z.literal(""), z.string().regex(/^\d{6}$/, "Pincode must be 6 digits")]).nullish(),
  subjects,
  rate_per_hour: optionalNumber("Hourly rate", 0, 100000),
  experience_years: optionalNumber("Years of experience", 0, 80, true),
  contact_email: optionalEmail,
  contact_phone: optionalText(30, "Contact phone"),
  is_listed: z.boolean({ message: "is_listed must be true or false" }).nullish(),
  self_attested: z.boolean({ message: "self_attested must be true or false" }).nullish(),
});

// ---- connections, feedback, messages ----
export const reviewSchema = z.object({
  teacherId: id,
  rating: z.coerce.number({ message: "Rating must be 1 to 5" }).int("Rating must be 1 to 5").min(1, "Rating must be 1 to 5").max(5, "Rating must be 1 to 5"),
  comment: optionalText(1000, "Feedback"),
});

export const teacherIdSchema = z.object({ teacherId: id });
export const userIdSchema = z.object({ userId: id });

export const messageSchema = z.object({
  body: z.string({ message: "Message can't be empty" }).max(2000, "Message is too long (max 2000 characters)"),
});

export const reportSchema = z.object({
  reason: z.string({ message: "Please describe the issue" }).max(1000, "Please keep the description under 1000 characters"),
});

// ---- billing ----
export const submitReferenceSchema = z.object({
  transactionId: id,
  utr: z
    .string({ message: "transactionId and utr are required" })
    .trim()
    .regex(/^[A-Za-z0-9-]{6,40}$/, "Please enter the UPI reference (UTR) exactly as shown in your payment app"),
});

// ---- admin ----
export const adminAddTeacherSchema = z.object({
  email: z.string({ message: "email and name are required" }).trim().min(1, "email and name are required").pipe(email),
  name: z.string({ message: "email and name are required" }).trim().min(1, "email and name are required").max(120, "Name is too long"),
  city: optionalText(80, "City"),
  subjects,
  rate_per_hour: optionalNumber("Hourly rate", 0, 100000),
  experience_years: optionalNumber("Years of experience", 0, 80, true),
  contact_email: optionalEmail,
  contact_phone: optionalText(30, "Contact phone"),
});

export const adminCreateTeacherSchema = z.object({
  name: z.string({ message: "Name is required" }).trim().min(1, "Name is required").max(120, "Name is too long"),
  city: optionalText(80, "City"),
});

// Only the keys admin_update_teacher_profile() (0005) reads. strict(): any
// other key is a 400, never passed through to the database.
export const adminUpdateTeacherSchema = z
  .object({
    name: optionalText(120, "Name"),
    bio: optionalText(2000, "Bio"),
    city: optionalText(80, "City"),
    subjects: z.array(z.string().max(50)).max(20).nullish(),
    rate_per_hour: z.number().min(0).max(100000).nullish(),
    is_listed: z.boolean().nullish(),
  })
  .strict();

type ParseResult<T> = { ok: true; data: T } | { ok: false; response: Response };

// Reads and validates a JSON body. On failure the response is a 400 with the
// first problem as a readable message, never zod's raw issue list.
export async function parseJsonBody<S extends z.ZodType>(req: Request, schema: S): Promise<ParseResult<z.infer<S>>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, response: Response.json({ error: "Request body must be valid JSON." }, { status: 400 }) };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, response: Response.json({ error: "Request body must be a JSON object." }, { status: 400 }) };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const message = result.error.issues[0]?.message ?? "Invalid request.";
    return { ok: false, response: Response.json({ error: message }, { status: 400 }) };
  }
  return { ok: true, data: result.data };
}

export function invalidIdResponse() {
  return Response.json({ error: "Invalid id" }, { status: 400 });
}
