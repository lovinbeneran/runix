export default function Loading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <div style={{ fontWeight: 950, fontSize: 26 }}>RuniX</div>
        <div style={{ opacity: 0.78, marginTop: 6 }}>Loading...</div>
      </div>
    </div>
  );
}
