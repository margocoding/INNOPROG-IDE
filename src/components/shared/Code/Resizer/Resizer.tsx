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
  const onResizeRef = useRef(onResize);
  const isDraggingRef = useRef(false);

  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);

  useEffect(() => {
    const preventSelection = (e: Event) => {
      e.preventDefault();
    };

    const stopDragging = () => {
      isDraggingRef.current = false;
      setIsDragging(false);
      document.body.classList.remove("resizer-dragging");
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!isDraggingRef.current || !resizerRef.current) return;

      let container = resizerRef.current.parentElement;
      while (container && !container.classList.contains("flex")) {
        container = container.parentElement;
      }
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      let newSize = (mouseX / containerRect.width) * 100;

      newSize = Math.max(minSize, Math.min(maxSize, newSize));
      onResizeRef.current(newSize);
    };

    if (isDragging) {
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", stopDragging);
      document.addEventListener("pointercancel", stopDragging);
      document.addEventListener("selectstart", preventSelection);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.body.classList.add("resizer-dragging");
    }

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", stopDragging);
      document.removeEventListener("pointercancel", stopDragging);
      document.removeEventListener("selectstart", preventSelection);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.body.classList.remove("resizer-dragging");
    };
  }, [isDragging, minSize, maxSize]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    window.getSelection()?.removeAllRanges();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    isDraggingRef.current = true;
    setIsDragging(true);
  };

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div
      ref={resizerRef}
      className={`resizer ${isDragging ? "resizer-active" : ""}`}
      onPointerDown={handlePointerDown}
      onDragStart={handleDragStart}
    >
      <div className="resizer-handle" />
    </div>
  );
};

export default Resizer;
