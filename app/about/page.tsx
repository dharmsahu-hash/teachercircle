import { buildUpiDonationLink, buildUpiQrDataUrl } from "@/lib/upi";

export const metadata = { title: "About — TeacherCircle" };

export default async function AboutPage() {
  const donationQr = await buildUpiQrDataUrl(buildUpiDonationLink("Support TeacherCircle"));
  const upiVpa = process.env.UPI_PAYEE_VPA || "yourname@upi";

  return (
    <div>
      <h1>About TeacherCircle</h1>
      <p style={{ fontSize: 20, fontWeight: 700, color: "var(--accent)", margin: "0 0 8px" }}>
        Great teachers shouldn&apos;t need a middleman.
      </p>
      <p className="hint" style={{ fontSize: 16 }}>
        A simple way for students and parents to find a good teacher nearby, and for
        teachers to be found — without an agency or a placement fee sitting in between.
      </p>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Why it exists</h2>
        <p>
          Finding the right tutor usually means asking around, scrolling through
          crowded classified listings, or paying an agency a cut just to get an
          introduction. TeacherCircle skips all of that: search by subject and city,
          see real feedback from people who actually connected, and reach out
          directly. Teachers list their profile for free — no commission, no catch.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Who it&apos;s for</h2>
        <p>
          <b>Students &amp; parents</b> looking for a subject tutor, exam coaching, or
          ongoing lessons. <b>Teachers</b> — from individual tutors to experienced
          coaches — who want to be discoverable without paying for it.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Who&apos;s behind it</h2>
        <p>
          TeacherCircle is built and maintained by <b>Dharmendra Sahu</b>, a{" "}
          <a href="https://knowledgewala.com" target="_blank" rel="noopener noreferrer">
            <b>Knowledgewala</b>
          </a>{" "}
          product.
        </p>
      </div>

      <div className="card donation-card">
        <div>
          <h2 style={{ marginTop: 0 }}>Buy us a coffee — no obligation</h2>
          <p>
            Scan the QR code with any UPI app (GPay, PhonePe, Paytm, BHIM) to send
            whatever you&apos;d like.
          </p>
          <p className="hint" style={{ marginBottom: 12 }}>
            Every rupee goes straight back into building and maintaining free tools for
            the TeacherCircle community.
          </p>
          <span className="pill">{upiVpa}</span>
        </div>
        <div className="donation-qr">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={donationQr} alt="UPI QR code to donate" width={180} height={180} />
          <p className="hint" style={{ margin: "6px 0 0", textAlign: "center" }}>
            Scan to pay via UPI
          </p>
        </div>
      </div>
    </div>
  );
}
