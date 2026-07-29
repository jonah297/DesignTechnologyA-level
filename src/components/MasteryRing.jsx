import React, { memo } from "react";

export const MasteryRing = memo(({ score, color }) => {
  const radius = 18;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div
      style={{
        position: "relative",
        width: "45px",
        height: "45px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg
        width="45"
        height="45"
        style={{ position: "absolute", transform: "rotate(-90deg)" }}
      >
        <circle
          cx="22.5"
          cy="22.5"
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="4"
        />
        <circle
          cx="22.5"
          cy="22.5"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span
        style={{
          fontSize: "0.75rem",
          fontWeight: "bold",
          color: "var(--text)",
          zIndex: 1,
          opacity: 0.7,
        }}
      >
        {score}%
      </span>
    </div>
  );
});
