import React from "react";

export function PauseIcon(props: { size?: number }) {
  const s = props.size ?? 16;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable={false}
    >
      <rect x="6" y="5" width="4" height="14" fill="currentColor" rx="1" />
      <rect x="14" y="5" width="4" height="14" fill="currentColor" rx="1" />
    </svg>
  );
}

export function RefreshIcon(props: { size?: number }) {
  const s = props.size ?? 16;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable={false}
    >
      <path
        d="M21 12a9 9 0 10-3.07 6.36L21 22v-4.64A8.99 8.99 0 0021 12z"
        fill="currentColor"
      />
      <path
        d="M21 3v5h-5"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export function PlayIcon(props: { size?: number }) {
  const s = props.size ?? 16;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable={false}
    >
      <path d="M8 5v14l11-7z" fill="currentColor" />
    </svg>
  );
}

export function StepBackIcon(props: { size?: number }) {
  const s = props.size ?? 16;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable={false}
    >
      <path d="M11 18V6l-8 6 8 6zM21 6v12h-2V6h2z" fill="currentColor" />
    </svg>
  );
}

export function StepForwardIcon(props: { size?: number }) {
  const s = props.size ?? 16;
  return (
    <svg
      width={s}
      height={s}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      focusable={false}
    >
      <path d="M13 6v12l8-6-8-6zM3 6v12h2V6H3z" fill="currentColor" />
    </svg>
  );
}
