import React from 'react';
const base = { width: 15, height: 15, viewBox: '0 0 20 20', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const };
export const CodeIcon = () => <svg {...base}><path d="m7 5-5 5 5 5m6-10 5 5-5 5m-2-12L9 17"/></svg>;
export const TerminalIcon = () => <svg {...base}><rect x="2" y="3" width="16" height="14" rx="3"/><path d="m5 7 3 3-3 3m5 0h4"/></svg>;
export const InputIcon = () => <svg {...base}><path d="M8 4h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8M2 10h10m-4-4 4 4-4 4"/></svg>;
