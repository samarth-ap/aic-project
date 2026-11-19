// Small inline icons (stroke = currentColor).
const P = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const IconClasses = () => (
  <svg viewBox="0 0 24 24" {...P} aria-hidden><rect x="3.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.6" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.6" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.6" /></svg>
);
export const IconMoments = () => (
  <svg viewBox="0 0 24 24" {...P} aria-hidden><path d="M4 5.5h16v10.5H9l-5 4z" /></svg>
);
export const IconBulb = ({ size }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} {...P} aria-hidden><path d="M12 3a6 6 0 0 0-3.6 10.8c.8.6 1.1 1.4 1.1 2.3v.4h5v-.4c0-.9.4-1.7 1.1-2.3A6 6 0 0 0 12 3z" /><path d="M9.8 19.5h4.4M10.6 22h2.8M12 16.5v-4l-1.8-1.8M12 12.5l1.8-1.8" /></svg>
);
export const IconProfile = () => (
  <svg viewBox="0 0 24 24" {...P} aria-hidden><circle cx="12" cy="8" r="4" /><path d="M4.5 21c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" /></svg>
);
export const IconPlay = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><path d="M8 5.5v13l10.5-6.5z" fill="currentColor" /></svg>
);
export const IconPause = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden><rect x="7" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" /><rect x="13.4" y="5.5" width="3.6" height="13" rx="1" fill="currentColor" /></svg>
);
export const IconUp = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" {...P} strokeWidth={2.4} aria-hidden><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const IconChevron = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" {...P} aria-hidden><path d="M9 6l6 6-6 6" /></svg>
);
export const IconCheck = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" {...P} strokeWidth={3} aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);
