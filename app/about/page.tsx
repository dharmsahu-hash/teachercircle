export const metadata = { title: "About — TeacherCircle" };

export default function AboutPage() {
  return (
    <div>
      <h1>About TeacherCircle</h1>
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
          <b>Knowledgewala</b> product.
        </p>
      </div>
    </div>
  );
}
