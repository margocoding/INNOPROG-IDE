import React, { useRef, useEffect, useState } from "react";
import "./Resizer.css";

interface ResizerProps {
  onResize: (newWidth: number) => void;
  minSize?: number;
  maxSize?: number;
}

const Resizer: React.FC<ResizerProps> = ({
  onResize,
  minSize = 20,
  maxSize = 80,
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const resizerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !resizerRef.current) return;

      let container = resizerRef.current.parentElement;
      while (container && !container.classList.contains("flex")) {
        container = container.parentElement;
      }
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      let newSize = (mouseX / containerRect.width) * 100;

      newSize = Math.max(minSize, Math.min(maxSize, newSize));
      onResize(newSize);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isDragging, onResize, minSize, maxSize]);

  return (
    <div
      ref={resizerRef}
      className={`resizer ${isDragging ? "resizer-active" : ""}`}
      onMouseDown={() => setIsDragging(true)}
    >
      <div className="resizer-handle" />
    </div>
  );
};

export default Resizer;

