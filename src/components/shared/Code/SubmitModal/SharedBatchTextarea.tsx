import React, { useLayoutEffect, useRef, useState } from "react";
import { Textarea } from "@heroui/react";
import "./SharedBatchTextarea.css";

export interface BatchCaret {
  id: string;
  index: number;
  color: string;
  local: boolean;
}

interface Props {
  label: string;
  value: string;
  onEdit: (value: string, index: number) => void;
  onCursor: (index: number | null) => void;
  cursors: BatchCaret[];
  showMarkers: boolean;
}

export default function SharedBatchTextarea({ label, value, onEdit, onCursor, cursors, showMarkers }: Props) {
  const wrapper = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const [geometry, setGeometry] = useState<React.CSSProperties>();
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const localCursor = cursors.find(cursor => cursor.local);
  const previousValue = useRef(value);

  useLayoutEffect(() => {
    const field = input.current;
    const container = wrapper.current;
    if (!field || !container) return;
    const measure = () => {
      const fieldBox = field.getBoundingClientRect();
      const bounds = container.getBoundingClientRect();
      const styles = getComputedStyle(field);
      setGeometry({
        left: fieldBox.left - bounds.left + field.clientLeft,
        top: fieldBox.top - bounds.top + field.clientTop,
        width: field.clientWidth,
        height: field.clientHeight,
        padding: styles.padding,
        font: styles.font,
        lineHeight: styles.lineHeight,
        letterSpacing: styles.letterSpacing,
        tabSize: styles.tabSize,
        textAlign: styles.textAlign as React.CSSProperties["textAlign"],
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(field);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const field = input.current;
    if (previousValue.current !== value && field && localCursor && document.activeElement === field) {
      field.setSelectionRange(localCursor.index, localCursor.index);
    }
    previousValue.current = value;
  }, [value, localCursor?.index]);

  const markers: React.ReactNode[] = [];
  let previous = 0;
  let offset = 0;
  for (const cursor of (showMarkers ? [...cursors] : []).sort((a, b) => a.index - b.index)) {
    const index = Math.min(value.length, cursor.index);
    if (index !== previous) {
      markers.push(value.slice(previous, index));
      offset = 0;
    }
    markers.push(<span key={cursor.id} data-batch-caret={index} className="shared-batch-caret"
      style={{ borderColor: cursor.color, transform: `translateX(${offset}px)` }} />);
    previous = index;
    offset += 5;
  }
  markers.push(value.slice(previous), "\u200b");

  return <div ref={wrapper} className="shared-batch-textarea">
    <Textarea
      ref={input}
      value={value}
      label={label}
      classNames={{ input: showMarkers && localCursor ? "shared-batch-native-caret-hidden" : undefined }}
      onChange={event => {
        previousValue.current = event.currentTarget.value;
        onEdit(event.currentTarget.value, event.currentTarget.selectionEnd ?? event.currentTarget.value.length);
      }}
      onFocus={event => onCursor(event.currentTarget.selectionEnd)}
      onSelect={event => onCursor(event.currentTarget.selectionEnd)}
      onBlur={() => onCursor(null)}
      onScroll={event => setScroll({ x: event.currentTarget.scrollLeft, y: event.currentTarget.scrollTop })}
    />
    {showMarkers && geometry && cursors.length > 0 && <div className="shared-batch-caret-viewport" aria-hidden="true" style={geometry}>
      <div className="shared-batch-caret-mirror" style={{ transform: `translate(${-scroll.x}px,${-scroll.y}px)` }}>
        {markers}
      </div>
    </div>}
  </div>;
}
