"use client";

import React from "react";
import { useRouter } from "next/navigation";

export default function DownloadPage() {
  const r = useRouter();

  return (
    <main>
      <style>{`
        .dl{
          min-height:100vh;
          background:var(--bg);
          color:var(--text);
          font-family:var(--font-primary, ui-sans-serif, system-ui, -apple-system, sans-serif);
          overflow-x:hidden;
          position:relative;
        }
        .dl::before{
          content:"";
          position:fixed;top:0;left:0;right:0;bottom:0;
          pointer-events:none;z-index:0;
          opacity:0.035;
          background-image:
            radial-gradient(ellipse 300px 300px at 10% 20%, #c8a882 0%, transparent 70%),
            radial-gradient(ellipse 250px 250px at 85% 15%, #b8976e 0%, transparent 70%),
            radial-gradient(ellipse 200px 200px at 70% 80%, #d4b896 0%, transparent 70%),
            radial-gradient(ellipse 180px 180px at 20% 75%, #a08060 0%, transparent 70%),
            url("data:image/svg+xml,%3Csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 5c2 0 4 3 3 6s-4 5-7 4-4-4-3-7 4-4 7-3zm15 20c1.5 0 3 2 2.5 4.5s-3 3.5-5 3-3-3-2.5-5.5 3-3 5-2zm-35 8c1 0 2.5 2 2 4s-2.5 3-4 2.5-2.5-2.5-2-4.5 2.5-2.5 4-2zm20 22c1.5 0 3.5 2.5 3 5.5s-3.5 4-5.5 3.5-3-3.5-2.5-6 3.5-3.5 5-3z' fill='%23a08060' fill-opacity='0.4'/%3E%3C/svg%3E");
        }
        .dl>*{position:relative;z-index:1;}

        .dl-nav{
          position:fixed;top:0;left:0;right:0;z-index:50;
          padding:16px 24px;
          display:flex;align-items:center;justify-content:space-between;
          backdrop-filter:blur(16px);
          background:color-mix(in srgb, var(--panel) 85%, transparent);
          border-bottom:1px solid var(--border);
        }
        .dl-logo{font-size:22px;font-weight:900;letter-spacing:-0.03em;color:var(--text);}
        .dl-logo span{color:var(--brand,#d59567);}

        .dl-content{
          max-width:720px;margin:0 auto;
          padding:120px 24px 80px;
          text-align:center;
        }

        .dl-badge{
          display:inline-flex;align-items:center;gap:6px;
          padding:7px 16px;border-radius:999px;
          background:var(--brandSoft);border:1px solid var(--brand2);
          color:var(--brand,#d59567);font-size:13px;font-weight:700;
          margin-bottom:24px;
        }

        .dl-content h1{
          font-size:clamp(32px,6vw,52px);font-weight:900;
          line-height:1.1;letter-spacing:-0.03em;margin:0;
          color:var(--text);
        }
        .dl-content h1 em{
          font-style:normal;color:var(--brand,#d59567);
        }

        .dl-sub{
          margin-top:16px;font-size:16px;line-height:1.7;
          color:var(--muted);max-width:500px;margin-left:auto;margin-right:auto;
        }

        .dl-cards{
          display:grid;grid-template-columns:1fr 1fr;gap:20px;
          margin-top:48px;text-align:left;
        }
        @media(max-width:640px){
          .dl-cards{grid-template-columns:1fr;}
        }

        .dl-card{
          padding:28px 24px;border-radius:18px;
          border:1px solid var(--border);background:var(--panel);
          transition:all 0.2s ease;
        }
        .dl-card:hover{
          border-color:var(--brand2);background:var(--brandSoft);
          box-shadow:0 8px 24px rgba(0,0,0,0.04);transform:translateY(-2px);
        }

        .dl-card-icon{
          width:48px;height:48px;border-radius:12px;
          background:var(--brandSoft);display:grid;place-items:center;
          font-size:24px;margin-bottom:16px;
        }
        .dl-card h3{font-size:18px;font-weight:800;margin:0 0 6px;color:var(--text);}
        .dl-card p{font-size:13px;line-height:1.6;color:var(--muted);margin:0 0 16px;}

        .dl-btn{
          display:inline-flex;align-items:center;gap:8px;
          padding:12px 20px;border-radius:10px;font-weight:700;font-size:14px;
          border:none;cursor:pointer;transition:all 0.15s ease;
          background:var(--brand,#d59567);color:#fff;
          text-decoration:none;
        }
        .dl-btn:hover{opacity:0.9;transform:translateY(-1px);}
        .dl-btn-ghost{
          background:transparent;color:var(--muted);border:1px solid var(--border);
        }
        .dl-btn-ghost:hover{background:var(--brandSoft);border-color:var(--brand2);}

        .dl-features{
          margin-top:48px;padding:32px 24px;border-radius:20px;
          background:var(--brandSoft);
          border:1px solid var(--brand2);text-align:left;
        }
        .dl-features h3{font-size:18px;font-weight:800;margin:0 0 16px;text-align:center;color:var(--text);}
        .dl-feat-grid{
          display:grid;grid-template-columns:1fr 1fr;gap:12px;
        }
        @media(max-width:640px){
          .dl-feat-grid{grid-template-columns:1fr;}
        }
        .dl-feat{
          display:flex;align-items:center;gap:10px;
          font-size:14px;color:var(--text);font-weight:600;
        }
        .dl-feat::before{
          content:"✓";color:var(--brand,#d59567);font-weight:900;font-size:16px;
          flex-shrink:0;
        }

        .dl-footer{
          padding:24px;text-align:center;color:var(--muted);font-size:12px;
          border-top:1px solid var(--border);margin-top:60px;
        }

        @media(max-width:640px){
          .dl-nav{padding:12px 16px;}
          .dl-content{padding:100px 16px 60px;}
        }
      `}</style>

      <div className="dl">
        {/* NAV */}
        <nav className="dl-nav">
          <div className="dl-logo" style={{ cursor: "pointer" }} onClick={() => r.push("/")}>
            terra<span>POS</span>
          </div>
          <button className="dl-btn-ghost dl-btn" onClick={() => r.push("/login")}>
            Masuk
          </button>
        </nav>

        {/* CONTENT */}
        <div className="dl-content">
          <div className="dl-badge">Download Aplikasi</div>

          <h1>
            Akses <em>RuniX</em> dari mana saja
          </h1>

          <p className="dl-sub">
            Install aplikasi RuniX di HP Android kamu untuk pengalaman terbaik — akses cepat, notifikasi, dan print langsung ke Bluetooth printer.
          </p>

          {/* DOWNLOAD CARDS */}
          <div className="dl-cards">
            <div className="dl-card">
              <div className="dl-card-icon">📱</div>
              <h3>Android APK</h3>
              <p>
                Download APK langsung, install di HP tanpa perlu Play Store. Support Bluetooth printer ESC/POS.
              </p>
              <a
                href="/runix.apk"
                className="dl-btn"
                download
              >
                Download APK
              </a>
            </div>

            <div className="dl-card">
              <div className="dl-card-icon">🌐</div>
              <h3>Web App (PWA)</h3>
              <p>
                Buka di browser dan &quot;Add to Home Screen&quot; untuk pengalaman seperti app native tanpa install.
              </p>
              <button
                className="dl-btn"
                onClick={() => r.push("/login")}
              >
                Buka Web App
              </button>
            </div>
          </div>

          {/* FEATURES */}
          <div className="dl-features">
            <h3>Yang kamu dapatkan</h3>
            <div className="dl-feat-grid">
              <div className="dl-feat">POS kasir cepat</div>
              <div className="dl-feat">Print struk Bluetooth</div>
              <div className="dl-feat">Mode offline</div>
              <div className="dl-feat">Dashboard realtime</div>
              <div className="dl-feat">QR meja</div>
              <div className="dl-feat">Laporan & export</div>
              <div className="dl-feat">Multi outlet</div>
              <div className="dl-feat">Update otomatis</div>
            </div>
          </div>

          {/* INSTALL GUIDE */}
          <div style={{ marginTop: 40, textAlign: "left", padding: "24px", borderRadius: 16, border: "1px solid var(--border)", background: "var(--panel)" }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, margin: "0 0 12px", color: "var(--text)" }}>Cara Install APK</h3>
            <ol style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 8, fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>
              <li>Download file APK di atas</li>
              <li>Buka file yang ter-download</li>
              <li>Jika diminta izin &quot;Install dari sumber tidak dikenal&quot;, aktifkan</li>
              <li>Tap &quot;Install&quot; dan tunggu selesai</li>
              <li>Buka RuniX dan login dengan akun kamu</li>
            </ol>
          </div>
        </div>

        {/* FOOTER */}
        <footer className="dl-footer">
          &copy; {new Date().getFullYear()} RuniX &mdash; POS modern untuk cafe & resto.
        </footer>
      </div>
    </main>
  );
}
