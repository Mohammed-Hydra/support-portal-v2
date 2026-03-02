export function Logo({ className, alt = "HYDRA-TECH IT SUPPORT PLATFORM" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 380 72"
      role="img"
      aria-label={alt}
      className={className}
    >
      <defs>
        <linearGradient id="logoCircleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="100%" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <circle cx="36" cy="36" r="32" fill="url(#logoCircleGrad)" />
      <text x="36" y="46" fontFamily="Arial, sans-serif" fontSize="36" fontWeight="700" fill="#ffffff" textAnchor="middle">
        H
      </text>
      <text
        x="88"
        y="42"
        fontFamily="Arial, sans-serif"
        fontSize="28"
        fontWeight="700"
        fill="var(--logo-primary)"
        letterSpacing="0.5"
      >
        HYDRA-TECH
      </text>
      <text
        x="88"
        y="62"
        fontFamily="Arial, sans-serif"
        fontSize="16"
        fontWeight="600"
        fill="var(--logo-tagline)"
        letterSpacing="1"
      >
        IT SUPPORT PLATFORM
      </text>
    </svg>
  );
}
