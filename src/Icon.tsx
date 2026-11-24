import type { CSSProperties } from 'react';
export default function Icon({ name, size = 18, style }: { name: string; size?: number; style?: CSSProperties }) {
  const paths: Record<string, React.ReactNode> = {
    play: <path d="m9 5 11 7-11 7Z"/>, pause: <><path d="M8 5v14M16 5v14"/></>,
    reset: <><path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/></>, plus: <path d="M12 5v14M5 12h14"/>,
    x: <path d="m6 6 12 12M6 18 18 6"/>, check: <path d="m5 12 4 4L19 6"/>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></>,
    steps: <><path d="M5 5v12h5M5 9h5M14 9h5M14 17h5"/><circle cx="5" cy="4" r="1"/></>,
    edit: <><path d="m5 15 10-10 4 4L9 19H5Z"/><path d="m13 7 4 4"/></>,
    moon: <path d="M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z"/>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/></>,
    graph: <><path d="M4 4v16h16M8 16v-5m5 5V7m5 9v-7"/></>,
    grid: <><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>,
    cup: <><path d="M5 5h12v9a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5ZM17 6h2a3 3 0 0 1 0 6h-2M4 22h14"/></>,
    note: <><path d="M5 3h14v13l-5 5H5ZM14 21v-5h5M8 8h8M8 12h6"/></>,
    chevron: <path d="m6 9 6 6 6-6"/>, headphones: <><path d="M4 13V11a8 8 0 0 1 16 0v2"/><rect x="3" y="12" width="4" height="8" rx="2"/><rect x="17" y="12" width="4" height="8" rx="2"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={style}>{paths[name] ?? paths.target}</svg>;
}
