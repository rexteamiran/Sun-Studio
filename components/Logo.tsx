/** Sun Studio monochrome logomark — a sun over a horizon, ink on nothing. */
export default function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden="true"
    >
      {/* horizon */}
      <line x1="2.5" y1="17.5" x2="21.5" y2="17.5" />
      {/* rising sun */}
      <path d="M6.5 17.5a5.5 5.5 0 0 1 11 0" />
      {/* rays */}
      <line x1="12" y1="2.5" x2="12" y2="5.5" />
      <line x1="4.6" y1="6.1" x2="6.7" y2="8.2" />
      <line x1="19.4" y1="6.1" x2="17.3" y2="8.2" />
    </svg>
  );
}
