// The KaigoAI brand in code: the Continuum mark (a ring with a gap, and the dot that closes it), the outlined
// wordmark, pen notes in Caveat, and the sketched "thinking" state. Geometry matches brand/kit exactly.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const RING = { dash: "231.96 44.50", rotate: "rotate(-61.03 60 60)" };
const WORDMARK = "M194 0L36 0L36-700L194-700L194-329Q228-347 252.5-370Q277-393 294-419.5Q311-446 321.5-473.5Q332-501 339-528L339-528L525-528Q514-488 493.5-450.5Q473-413 443-380.5Q413-348 373.5-322Q334-296 286-279L286-279L286-271Q348-281 387.5-273.5Q427-266 450-245.5Q473-225 485.5-194Q498-163 505-125L505-125L528 0L353 0L342-88Q338-120 331-148Q324-176 304-193.5Q284-211 241-211L241-211L194-211L194 0ZM666 14L666 14Q626 14 590 0Q554-14 531-45.5Q508-77 508-130L508-130Q508-179 527-209.5Q546-240 578-258.5Q610-277 648-286.5Q686-296 723-303L723-303Q775-313 801-319Q827-325 836.5-333Q846-341 846-355L846-355Q846-384 824.5-399Q803-414 768-414L768-414Q746-414 724-406Q702-398 688-377.5Q674-357 675-319L675-319L531-329Q529-392 550-433.5Q571-475 607.5-498.5Q644-522 687.5-532Q731-542 774-542L774-542Q853-542 904-512.5Q955-483 979.5-427.5Q1004-372 1004-293L1004-293L1004-199Q1004-166 1004-132.5Q1004-99 1004-66Q1004-33 1004 0L1004 0L864 0Q864-36 864-73Q864-110 864-151L864-151L858-151Q854-106 828.5-68.5Q803-31 761.5-8.5Q720 14 666 14ZM733-104L733-104Q750-104 769.5-110.5Q789-117 806.5-132Q824-147 835-173.5Q846-200 846-239L846-239L846-263L873-266Q865-253 846.5-245Q828-237 805-232.5Q782-228 758.5-223.5Q735-219 715-211.5Q695-204 682.5-191.5Q670-179 670-157L670-157Q670-131 688.5-117.5Q707-104 733-104ZM1182 0L1020 0L1020-528L1182-528L1182 0ZM1100-566L1100-566Q1054-566 1029.5-585.5Q1005-605 1005-642L1005-642Q1005-680 1029.5-699.5Q1054-719 1100-719L1100-719Q1147-719 1171.5-699Q1196-679 1196-642L1196-642Q1196-606 1171.5-586Q1147-566 1100-566ZM1413 158L1413 158Q1324 158 1272 144Q1220 130 1198 105.5Q1176 81 1176 49L1176 49Q1176 5 1211-21.5Q1246-48 1313-58L1313-58L1313-63Q1262-63 1233-80.5Q1204-98 1204-129L1204-129Q1204-158 1230.5-181Q1257-204 1317-204L1317-204L1317-211Q1263-224 1231-261Q1199-298 1199-357L1199-357Q1199-409 1225.5-447Q1252-485 1303-506.5Q1354-528 1427-528L1427-528L1690-528L1690-404L1509-427L1509-419Q1592-408 1621.5-381.5Q1651-355 1651-318L1651-318Q1651-281 1628.5-252Q1606-223 1559-206.5Q1512-190 1440-190L1440-190Q1418-190 1395.5-192Q1373-194 1357-198L1357-198Q1340-191 1330.5-183.5Q1321-176 1321-168L1321-168Q1321-163 1325-160.5Q1329-158 1336.5-157Q1344-156 1354-156L1354-156L1514-156Q1535-156 1566.5-153.5Q1598-151 1629.5-138.5Q1661-126 1682-97Q1703-68 1703-15L1703-15Q1703 45 1671.5 83Q1640 121 1576 139.5Q1512 158 1413 158ZM1413 16L1413 16Q1480 16 1512 11.5Q1544 7 1554-1Q1564-9 1564-19L1564-19Q1564-33 1556-41Q1548-49 1536-52.5Q1524-56 1512.5-56.5Q1501-57 1494-57L1494-57L1359-57Q1327-46 1315.5-36.5Q1304-27 1304-15L1304-15Q1304-1 1317.5 5.5Q1331 12 1355.5 14Q1380 16 1413 16ZM1430-278L1430-278Q1462-278 1479.5-298Q1497-318 1497-353L1497-353Q1497-388 1479-409.5Q1461-431 1429-431L1429-431Q1398-431 1379.5-409.5Q1361-388 1361-353L1361-353Q1361-330 1369-313Q1377-296 1392.5-287Q1408-278 1430-278ZM1949 14L1949 14Q1873 14 1814-16.5Q1755-47 1722-108.5Q1689-170 1689-263L1689-263Q1689-360 1723.5-421.5Q1758-483 1817.5-512.5Q1877-542 1952-542L1952-542Q2030-542 2088.5-511.5Q2147-481 2179.5-419.5Q2212-358 2212-264L2212-264Q2212-167 2177.5-105.5Q2143-44 2083.5-15Q2024 14 1949 14ZM1953-105L1953-105Q1984-105 2005-122.5Q2026-140 2037-174Q2048-208 2048-255L2048-255Q2048-307 2036-342.5Q2024-378 2001.5-397Q1979-416 1947-416L1947-416Q1917-416 1896-398.5Q1875-381 1864-347Q1853-313 1853-265L1853-265Q1853-189 1879.5-147Q1906-105 1953-105ZM2214 0L2115 0L2349-660L2472-660L2705 0L2606 0L2412-581L2407-581L2214 0ZM2607-146L2223-146L2223-218L2607-218L2607-146ZM2809 0L2716 0L2716-660L2809-660L2809 0Z";

function MarkShapes({ ring, dot, animate }: { ring: string; dot: string; animate?: boolean }) {
  return (
    <>
      <circle className={animate ? "kg-ring-in" : undefined} cx="60" cy="60" r="44" fill="none" stroke={ring} strokeWidth="16"
        strokeLinecap="round" strokeDasharray={RING.dash} transform={RING.rotate} />
      <circle className={animate ? "kg-dot-in" : undefined} cx="60" cy="16" r="9" fill={dot} />
    </>
  );
}

/** The mark alone. tone="dark" is for plum backgrounds. */
export function Mark({ size = 32, tone = "light", animate = false, title }: { size?: number; tone?: "light" | "dark"; animate?: boolean; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="6 6 108 108" role={title ? "img" : undefined} aria-label={title} aria-hidden={title ? undefined : true}>
      <MarkShapes ring={tone === "dark" ? "var(--paper)" : "var(--plum)"} dot="var(--tangerine)" animate={animate} />
    </svg>
  );
}

/** Mark and wordmark together. Height sets the size; the name is outlined, so it never depends on a font. */
export function Logo({ height = 30, tone = "light", animate = false }: { height?: number; tone?: "light" | "dark"; animate?: boolean }) {
  const ink = tone === "dark" ? "var(--paper)" : "var(--plum)";
  return (
    <svg height={height} viewBox="-8.0 -849.6 4089.8 1029.2" role="img" aria-label="KaigoAI" style={{ display: "block", overflow: "visible" }}>
      <g transform="translate(-77.2 -909.2) scale(9.65)"><MarkShapes ring={ink} dot="var(--tangerine)" animate={animate} /></g>
      <g transform="translate(1264.8 0)"><path className={animate ? "kg-word-in" : undefined} fill={ink} d={WORDMARK} /></g>
    </svg>
  );
}

/** The thinking state: the mark sketches itself in pen. Never a spinning ring. */
export function Thinking({ label, size = 22 }: { label: string; size?: number }) {
  return (
    <span className="thinking" role="status">
      <svg width={size} height={size} viewBox="6 6 108 108" aria-hidden="true">
        <circle className="kg-think-ring" cx="60" cy="60" r="44" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round"
          strokeDasharray={RING.dash} transform={RING.rotate} />
        <circle className="kg-think-dot" cx="60" cy="16" r="10" fill="var(--tangerine)" />
      </svg>
      <span>{label}</span>
    </span>
  );
}

/** Adds "in" to an element once it scrolls into view, for gentle reveals and pen strokes that draw themselves. */
export function useInView<T extends Element>(threshold = 0.3) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    if (!("IntersectionObserver" in window)) { setInView(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setInView(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [inView, threshold]);
  return [ref, inView] as const;
}

export function Reveal({ children, as: Tag = "div", className = "", style, delay = 0 }: {
  children: ReactNode; as?: "div" | "section" | "header" | "footer"; className?: string; style?: CSSProperties; delay?: number;
}) {
  const [ref, inView] = useInView<HTMLDivElement>(0.15);
  return (
    <Tag ref={ref as never} className={`reveal${inView ? " in" : ""} ${className}`} style={{ ...style, transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

type Stroke = "underline" | "circle" | "arrow" | "tick" | "bracket";
const STROKES: Record<Stroke, { viewBox: string; paths: string[]; stretch?: boolean }> = {
  underline: { viewBox: "0 0 300 14", paths: ["M3 9 C 80 4, 180 11, 297 5"], stretch: true },
  circle: { viewBox: "0 0 200 80", paths: ["M22 52 C 10 26, 70 6, 122 9 C 172 12, 198 30, 188 50 C 178 70, 120 77, 80 74 C 40 71, 6 60, 14 37 C 20 22, 46 12, 74 11"], stretch: true },
  arrow: { viewBox: "0 0 56 50", paths: ["M50 44 C 34 40, 18 30, 10 8", "M4 16 L10 7 L17 15"] },
  tick: { viewBox: "0 0 60 50", paths: ["M6 28 L22 42 L54 8"] },
  bracket: { viewBox: "0 0 16 150", paths: ["M14 2 C 6 2, 6 6, 6 20 L 6 64 C 6 72, 2 74, 1 75 C 2 76, 6 78, 6 86 L 6 130 C 6 144, 6 148, 14 148"], stretch: true },
};

/** A pen stroke in teal ink that draws itself once when it scrolls into view. */
export function Pen({ stroke, className = "", style, width = 1.8, delay = 0 }: { stroke: Stroke; className?: string; style?: CSSProperties; width?: number; delay?: number }) {
  const [ref, inView] = useInView<SVGSVGElement>(0.6);
  const s = STROKES[stroke];
  return (
    <svg ref={ref} className={`pen-stroke ${inView ? "in" : ""} ${className}`} viewBox={s.viewBox} preserveAspectRatio={s.stretch ? "none" : undefined}
      style={{ ...style, transitionDelay: `${delay}ms` }} aria-hidden="true">
      {s.paths.map((d, i) => (
        <path key={i} d={d} pathLength={1} fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round"
          vectorEffect="non-scaling-stroke" style={{ transitionDelay: `${delay + i * 180}ms` }} />
      ))}
    </svg>
  );
}

/** A handwritten note, the way a reader writes in the margin. */
export function Note({ children, className = "", style, rotate = -3 }: { children: ReactNode; className?: string; style?: CSSProperties; rotate?: number }) {
  return <span className={`pen-note ${className}`} style={{ ...style, transform: `rotate(${rotate}deg)` }}>{children}</span>;
}
