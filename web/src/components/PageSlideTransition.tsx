"use client";

import React, { useEffect, useState, useRef } from "react";
import { usePathname } from "next/navigation";

// Priority order for direction calculation
const ROUTE_ORDER = [
  "/dashboard",
  "/products",
  "/staff-accounts",
  "/promos",
  "/reports",
  "/settings",
  "/printer",
  "/dev",
];

function getRouteIndex(path: string): number {
  const match = ROUTE_ORDER.findIndex((r) => path.startsWith(r));
  return match !== -1 ? match : 99;
}

export default function PageSlideTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [transitionStage, setTransitionStage] = useState<"idle" | "sliding">("idle");
  const [slideDirection, setSlideDirection] = useState<"left" | "right">("right");
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    if (pathname === prevPathRef.current) return;

    const prevIndex = getRouteIndex(prevPathRef.current);
    const currIndex = getRouteIndex(pathname);

    // Direction: going right if currIndex > prevIndex, else going left
    const direction = currIndex >= prevIndex ? "right" : "left";
    setSlideDirection(direction);
    setTransitionStage("sliding");
    prevPathRef.current = pathname;

    const timer = setTimeout(() => {
      setTransitionStage("idle");
    }, 220); // Smooth 220ms slide transition

    return () => clearTimeout(timer);
  }, [pathname]);

  return (
    <>
      <style>{`
        .slide-transition-wrapper {
          width: 100%;
          overflow-x: hidden;
          position: relative;
        }

        .slide-content-stage {
          width: 100%;
          will-change: transform, opacity;
        }

        .slide-stage-sliding-right {
          animation: slideFromRight 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        .slide-stage-sliding-left {
          animation: slideFromLeft 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes slideFromRight {
          0% {
            opacity: 0.1;
            transform: translateX(100px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes slideFromLeft {
          0% {
            opacity: 0.1;
            transform: translateX(-100px);
          }
          100% {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>

      <div className="slide-transition-wrapper">
        <div
          key={pathname}
          className={`slide-content-stage ${
            slideDirection === "right"
              ? "slide-stage-sliding-right"
              : "slide-stage-sliding-left"
          }`}
        >
          {children}
        </div>
      </div>
    </>
  );
}
