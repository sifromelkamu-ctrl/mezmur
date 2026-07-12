export default function EqualizerBars({ className = "" }: { className?: string }) {
  return (
    <span className={`eq-bars ${className}`} aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
