import NewClassForm from "./NewClassForm";

export default function NewClass() {
  return (
    <div style={{ maxWidth: 560 }}>
      <h1>New class</h1>
      <p className="muted" style={{ marginTop: 6 }}>Students join once with the class code. Each lecture you start shows up on their phone.</p>
      <NewClassForm />
    </div>
  );
}
