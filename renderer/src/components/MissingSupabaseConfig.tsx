/**
 * Shown when VITE_SUPABASE_URL / keys are missing — avoids a blank white screen
 * from a crashing Supabase client init.
 */
export function MissingSupabaseConfig() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "system-ui, sans-serif",
        background: "#0f172a",
        color: "#e2e8f0",
      }}
    >
      <div style={{ maxWidth: 520, lineHeight: 1.6 }}>
        <h1 style={{ fontSize: "1.35rem", marginBottom: 12, color: "#f8fafc" }}>
          Supabase configuration required
        </h1>
        <p style={{ marginBottom: 16, opacity: 0.92 }}>
          The app needs your project URL and anon (or publishable) key. Without them the UI can stay blank.
        </p>
        <ol style={{ paddingLeft: 20, marginBottom: 16, opacity: 0.9 }}>
          <li>
            In the <strong>renderer</strong> folder, copy <code style={{ color: "#7dd3fc" }}>.env.example</code> to{" "}
            <code style={{ color: "#7dd3fc" }}>.env.local</code>.
          </li>
          <li>
            Set <code style={{ color: "#7dd3fc" }}>VITE_SUPABASE_URL</code> and{" "}
            <code style={{ color: "#7dd3fc" }}>VITE_SUPABASE_ANON_KEY</code> (or{" "}
            <code style={{ color: "#7dd3fc" }}>VITE_SUPABASE_PUBLISHABLE_KEY</code>) from Supabase → Project Settings → API.
          </li>
          <li>Restart the dev server (<code style={{ color: "#7dd3fc" }}>npm run dev</code>) or rebuild the Electron app.</li>
        </ol>
        <p style={{ fontSize: 14, opacity: 0.75 }}>
          Current: URL {import.meta.env.VITE_SUPABASE_URL ? "set" : "missing"}, key{" "}
          {import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ? "set" : "missing"}.
        </p>
      </div>
    </div>
  );
}
