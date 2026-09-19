// Inline SVG, not an image file — zero asset requests, themeable via
// currentColor, and scales cleanly at any size. No external icon library.
export default function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="2" />
      <path
        d="M16 8L25 12.5L16 17L7 12.5L16 8Z"
        fill="currentColor"
      />
      <path
        d="M11 15V20.5C11 20.5 13 23 16 23C19 23 21 20.5 21 20.5V15"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
