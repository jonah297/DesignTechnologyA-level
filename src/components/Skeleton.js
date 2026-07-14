import React, { memo } from "react";

export const Skeleton = memo(({ lines = 3, height = "20px" }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
      {Array(lines).fill(0).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: height, width: i === lines - 1 ? '70%' : '100%' }} />
      ))}
    </div>
  );
});