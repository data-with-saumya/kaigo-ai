import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 18, strokeWidth = 1.8, children, ...rest }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {children}
    </svg>
  );
}

export const IconDashboard = (p: P) => <Svg {...p}><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></Svg>;
export const IconShield = (p: P) => <Svg {...p}><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z" /><path d="M9 12l2 2 4-4" /></Svg>;
export const IconClipboard = (p: P) => <Svg {...p}><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V2.8h6V4" /><path d="M9 10h6M9 14h6M9 18h3.5" /></Svg>;
export const IconPeople = (p: P) => <Svg {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17.5 14.6c2.1.2 3.6 1.6 4.1 3.9" /></Svg>;
export const IconLoop = (p: P) => <Svg {...p}><path d="M4 12a8 8 0 0 1 13.7-5.6L20 9" /><path d="M20 4v5h-5" /><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15" /><path d="M4 20v-5h5" /></Svg>;
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5.5M12 7.5v.01" /></Svg>;
export const IconAlert = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.5v.01" /></Svg>;
export const IconCheck = (p: P) => <Svg strokeWidth={2.4} {...p}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>;
export const IconX = (p: P) => <Svg strokeWidth={2.4} {...p}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></Svg>;
export const IconMinus = (p: P) => <Svg strokeWidth={2.4} {...p}><path d="M6 12h12" /></Svg>;
export const IconArrow = (p: P) => <Svg strokeWidth={2.2} {...p}><path d="M5 12h14M13 6l6 6-6 6" /></Svg>;
export const IconUpload = (p: P) => <Svg {...p}><path d="M12 16V4M7 9l5-5 5 5" /><path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></Svg>;
export const IconFile = (p: P) => <Svg {...p}><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5" /></Svg>;
export const IconSpark = (p: P) => <Svg strokeWidth={2} {...p}><path d="M12 3v5M12 16v5M3 12h5M16 12h5M6.5 6.5L9 9M15 15l2.5 2.5M6.5 17.5L9 15M15 9l2.5-2.5" /></Svg>;
export const IconRule = (p: P) => <Svg strokeWidth={2} {...p}><path d="M4 6h16M4 12h16M4 18h9" /></Svg>;
export const IconPerson = (p: P) => <Svg strokeWidth={2} {...p}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c1-3.8 3.8-5.5 7-5.5s6 1.7 7 5.5" /></Svg>;
export const IconClock = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>;
export const IconMessage = (p: P) => <Svg {...p}><path d="M4 5h16v11H9l-5 4z" /></Svg>;
export const IconBook = (p: P) => <Svg {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M8 7h7M8 11h5" /></Svg>;
