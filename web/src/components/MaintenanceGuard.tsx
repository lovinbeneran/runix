"use client";

import React, { useEffect, useState, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  checkIsDeveloper,
  DEVELOPER_EMAILS,
  subscribeMaintenanceStatus,
  MaintenanceStatus,
} from "@/lib/developer";

/**
 * MaintenanceGuard - Block seluruh app saat maintenance mode aktif.
 * Developer tetap bisa akses (bypass).
 * 
 * Fix: Wait for BOTH auth AND maintenance status before deciding.
 */
export default function MaintenanceGuard({ children }: { children: React.ReactNode }) {
  const [maintenance, setMaintenance] = useState<MaintenanceStatus>({
    enabled: false,
    message: "",
    enabledAt: null,
    enabledBy: "",
  });
  const [isDev, setIsDev] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [maintenanceReady, setMaintenanceReady] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Subscribe maintenance status (realtime)
  useEffect(() => {
    // Safety timeout: jika Firestore gagal, jangan stuck selamanya
    timeoutRef.current = setTimeout(() => {
      setMaintenanceReady(true);
    }, 5000);

    const unsub = subscribeMaintenanceStatus((status) => {
      setMaintenance(status);
      setMaintenanceReady(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    });

    return () => {
      unsub();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Check auth & developer status
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setIsDev(false);
        setAuthReady(true);
        return;
      }

      // Quick check: hardcoded email
      if (user.email && DEVELOPER_EMAILS.includes(user.email.toLowerCase())) {
        setIsDev(true);
        setAuthReady(true);
        return;
      }

      // Fallback: Firestore check
      try {
        const devStatus = await checkIsDeveloper(user.uid, user.email || "");
        setIsDev(devStatus);
      } catch {
        setIsDev(false);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Still loading — render children to avoid blank screen flash
  // But only for max ~5 seconds (timeout above)
  if (!authReady || !maintenanceReady) {
    return <>{children}</>;
  }

  // Developer always bypasses
  if (isDev) {
    return <>{children}</>;
  }

  // Maintenance OFF — let through
  if (!maintenance.enabled) {
    return <>{children}</>;
  }

  // BLOCK: maintenance ON + user is NOT developer
  return <MaintenanceUserView message={maintenance.message} />;
}

function MaintenanceUserView({ message }: { message: string }) {
  const [showGame, setShowGame] = useState(false);
  const [gameScore, setGameScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameStateRef = useRef({
    playerY: 0,
    velocity: 0,
    isJumping: false,
    obstacles: [] as { x: number; width: number; height: number; speed: number }[],
    score: 0,
    spawnTimer: 0,
    gameLoop: 0,
  });

  const JUMP_FORCE = -12;
  const GRAVITY = 0.7;
  const GROUND_Y = 130;

  const handleJump = () => {
    if (!isPlaying) {
      startGame();
      return;
    }
    if (gameOver) {
      startGame();
      return;
    }
    if (!gameStateRef.current.isJumping) {
      gameStateRef.current.velocity = JUMP_FORCE;
      gameStateRef.current.isJumping = true;
    }
  };

  const startGame = () => {
    gameStateRef.current = {
      playerY: GROUND_Y,
      velocity: 0,
      isJumping: false,
      obstacles: [{ x: 400, width: 24, height: 32, speed: 4 }],
      score: 0,
      spawnTimer: 0,
      gameLoop: 0,
    };
    setGameScore(0);
    setGameOver(false);
    setIsPlaying(true);
  };

  useEffect(() => {
    if (!showGame || !isPlaying || gameOver) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const update = () => {
      const st = gameStateRef.current;

      // Update Player Physics
      st.velocity += GRAVITY;
      st.playerY += st.velocity;

      if (st.playerY >= GROUND_Y) {
        st.playerY = GROUND_Y;
        st.velocity = 0;
        st.isJumping = false;
      }

      // Spawn Obstacles
      st.spawnTimer++;
      if (st.spawnTimer > Math.max(45, 90 - Math.floor(st.score / 50))) {
        st.spawnTimer = 0;
        const speed = 4.5 + Math.min(6, st.score / 150);
        st.obstacles.push({
          x: canvas.width + 20,
          width: 20 + Math.random() * 12,
          height: 28 + Math.random() * 16,
          speed: speed,
        });
      }

      // Move & Filter Obstacles
      for (let i = st.obstacles.length - 1; i >= 0; i--) {
        const obs = st.obstacles[i];
        obs.x -= obs.speed;

        // Collision Check
        const playerX = 40;
        const playerW = 28;
        const playerH = 34;

        if (
          playerX < obs.x + obs.width &&
          playerX + playerW > obs.x &&
          st.playerY < GROUND_Y + obs.height &&
          st.playerY + playerH > GROUND_Y - obs.height + 20
        ) {
          setGameOver(true);
          setIsPlaying(false);
          setHighScore((prev) => Math.max(prev, Math.floor(st.score)));
          return;
        }

        if (obs.x + obs.width < 0) {
          st.obstacles.splice(i, 1);
        }
      }

      st.score += 0.2;
      setGameScore(Math.floor(st.score));

      // Draw Screen
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw Ground Line
      ctx.strokeStyle = "rgba(255,255,255,0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, GROUND_Y + 34);
      ctx.lineTo(canvas.width, GROUND_Y + 34);
      ctx.stroke();

      // Draw Player: Maskot Robot Kasir RuniX "R-01"
      const py = st.playerY;

      // 1. Robot Body / Chest Chassis
      ctx.fillStyle = "#9A0002";
      ctx.beginPath();
      ctx.roundRect(38, py + 12, 32, 22, 6);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Core Power Button / Chest Screen
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(54, py + 22, 4, 0, Math.PI * 2);
      ctx.fill();

      // 2. Robot Head
      ctx.fillStyle = "#750002";
      ctx.beginPath();
      ctx.roundRect(36, py - 4, 36, 18, 5);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();

      // Visor Glowing Screen
      ctx.fillStyle = "#00f0ff";
      ctx.shadowColor = "#00f0ff";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.roundRect(42, py, 24, 8, 3);
      ctx.fill();
      ctx.shadowBlur = 0; // reset shadow

      // Robot Eyes / Visor Lines
      ctx.fillStyle = "#000000";
      ctx.beginPath();
      ctx.arc(48, py + 4, 1.5, 0, Math.PI * 2);
      ctx.arc(60, py + 4, 1.5, 0, Math.PI * 2);
      ctx.fill();

      // 3. Lightning Antenna
      ctx.strokeStyle = "#f59e0b";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(54, py - 4);
      ctx.lineTo(54, py - 11);
      ctx.stroke();
      ctx.fillStyle = "#f59e0b";
      ctx.beginPath();
      ctx.arc(54, py - 12, 3, 0, Math.PI * 2);
      ctx.fill();

      // 4. Kinetic Wheels / Legs (Running Effect)
      const isAnim = Math.floor(st.score) % 2 === 0;
      ctx.fillStyle = "#1e293b";
      ctx.beginPath();
      ctx.arc(46, py + 34, 4, 0, Math.PI * 2);
      ctx.arc(62, py + 34, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Draw Obstacles (Cangkir Kopi / Box Barcode)
      st.obstacles.forEach((obs) => {
        ctx.fillStyle = "#ef4444";
        ctx.beginPath();
        ctx.roundRect(obs.x, GROUND_Y + 34 - obs.height, obs.width, obs.height, 6);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        ctx.stroke();
      });

      animationFrameId = requestAnimationFrame(update);
    };

    animationFrameId = requestAnimationFrame(update);

    return () => cancelAnimationFrame(animationFrameId);
  }, [showGame, isPlaying, gameOver]);

  // Handle Spacebar Jump
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp") {
        e.preventDefault();
        handleJump();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isPlaying, gameOver]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle at 50% 30%, #200508 0%, #0d0d12 70%, #050508 100%)",
        color: "#fff",
        padding: 24,
        fontFamily: "var(--font-sans, system-ui, -apple-system, sans-serif)",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Background Ambient Glow */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 500,
          height: 500,
          background: "radial-gradient(circle, rgba(154, 0, 2, 0.25) 0%, rgba(0, 0, 0, 0) 70%)",
          filter: "blur(60px)",
          pointerEvents: "none",
        }}
      />

      <style>{`
        @keyframes pulse-maint-icon {
          0% { transform: scale(1); box-shadow: 0 0 0 0 rgba(154, 0, 2, 0.6); }
          70% { transform: scale(1.05); box-shadow: 0 0 0 20px rgba(154, 0, 2, 0); }
          100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(154, 0, 2, 0); }
        }

        @keyframes progress-shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }

        .maint-glass-card {
          max-width: 520px;
          width: 100%;
          background: rgba(22, 22, 28, 0.7);
          border: 1.5px solid rgba(255, 255, 255, 0.1);
          border-radius: 32px;
          padding: 36px 32px;
          text-align: center;
          backdrop-filter: blur(24px);
          -webkit-backdrop-filter: blur(24px);
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          position: relative;
          z-index: 10;
        }

        .maint-icon-wrap {
          width: 76px;
          height: 76px;
          margin: 0 auto 20px;
          border-radius: 24px;
          background: linear-gradient(135deg, #9A0002, #5a0001);
          display: grid;
          place-items: center;
          font-size: 34px;
          color: #ffffff;
          box-shadow: 0 10px 30px rgba(154, 0, 2, 0.4);
          animation: pulse-maint-icon 2.4s infinite ease-in-out;
        }

        .maint-badge-tag {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 16px;
          border-radius: 999px;
          background: rgba(239, 68, 68, 0.12);
          border: 1px solid rgba(239, 68, 68, 0.3);
          color: #f87171;
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.8px;
          text-transform: uppercase;
          margin-bottom: 14px;
        }

        .maint-progress-bar {
          width: 100%;
          height: 6px;
          background: rgba(255, 255, 255, 0.08);
          border-radius: 999px;
          overflow: hidden;
          margin: 20px 0 14px;
        }

        .maint-progress-inner {
          height: 100%;
          width: 65%;
          border-radius: 999px;
          background: linear-gradient(90deg, #9A0002 0%, #ef4444 50%, #9A0002 100%);
          background-size: 200% 100%;
          animation: progress-shimmer 2s infinite linear;
        }

        .maint-btn-primary {
          width: 100%;
          padding: 14px 24px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          background: linear-gradient(135deg, #9A0002 0%, #750002 100%);
          color: #ffffff;
          font-size: 14px;
          font-weight: 900;
          cursor: pointer;
          transition: all 0.25s ease;
          box-shadow: 0 8px 24px rgba(154, 0, 2, 0.3);
        }

        .maint-btn-primary:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(154, 0, 2, 0.5);
          filter: brightness(1.1);
        }

        .maint-btn-game {
          width: 100%;
          padding: 12px 20px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.12);
          background: rgba(255, 255, 255, 0.06);
          color: #ffffff;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.2s ease;
          margin-top: 10px;
        }

        .maint-btn-game:hover {
          background: rgba(255, 255, 255, 0.12);
          border-color: rgba(255, 255, 255, 0.25);
        }

        .runner-canvas-box {
          background: #0f0f15;
          border: 1.5px solid rgba(255,255,255,0.12);
          border-radius: 20px;
          padding: 16px;
          margin-top: 16px;
          position: relative;
          cursor: pointer;
          user-select: none;
        }
      `}</style>

      <div className="maint-glass-card">
        <div className="maint-icon-wrap">⚙️</div>

        <div className="maint-badge-tag">
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", boxShadow: "0 0 10px #ef4444" }} />
          Sistem Dalam Pemeliharaan
        </div>

        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 900, color: "#ffffff", letterSpacing: "-0.5px" }}>
          RuniX System Maintenance
        </h1>

        <p style={{ marginTop: 12, fontSize: 13, lineHeight: 1.6, color: "rgba(255, 255, 255, 0.75)" }}>
          {message || "Sistem sedang dalam pemeliharaan berkala untuk peningkatan performa. Kami akan segera kembali."}
        </p>

        {/* Dynamic Progress Indicator */}
        <div className="maint-progress-bar">
          <div className="maint-progress-inner" />
        </div>

        <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.45)", fontWeight: 600 }}>
          Proses pembaruan sedang berjalan secara otomatis...
        </div>

        {/* MINI GAME RUNNER POPUP / CANVAS */}
        {showGame ? (
          <div className="runner-canvas-box" onClick={handleJump}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.7)", marginBottom: 8 }}>
              <span>Skor: <b style={{ color: "#ef4444" }}>{gameScore}</b></span>
              <span>High Score: <b style={{ color: "#10b981" }}>{highScore}</b></span>
            </div>

            <canvas ref={canvasRef} width={420} height={180} style={{ width: "100%", height: 160, display: "block" }} />

            {(!isPlaying || gameOver) && (
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.75)", display: "grid", placeItems: "center", borderRadius: 20 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#fff" }}>
                    {gameOver ? "💥 Game Over!" : "🤖 RuniX Robot R-01 Runner"}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>
                    Tap / Tekan [Spacebar] untuk lompat melewati rintangan
                  </div>
                  <button className="btn btn-primary" style={{ marginTop: 14, padding: "8px 20px", borderRadius: 12, fontSize: 12, fontWeight: 900 }}>
                    {gameOver ? "Coba Lagi ↺" : "Mulai Bermain ▶"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        <div style={{ marginTop: 20 }}>
          <button
            className="maint-btn-primary"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
          >
            ⚡ Coba Muat Ulang Sekarang
          </button>

          <button
            className="maint-btn-game"
            onClick={() => setShowGame(!showGame)}
          >
            {showGame ? "🎮 Tutup Mini Game" : "🎮 Mainkan Game Sambil Menunggu"}
          </button>
        </div>

        <div style={{ marginTop: 18, fontSize: 11, color: "rgba(255, 255, 255, 0.35)", fontFamily: "var(--font-mono)" }}>
          RuniX POS & Outlets Core Engine • Service Status: Active Sync
        </div>
      </div>
    </div>
  );
}
