// Official Data Conquest transparent logo without background
export function Logo({
  className = '',
}: {
  className?: string;
  variant?: string;
}) {
  return (
    <img
      src="/dc_logo_transparent.png"
      alt="Data Conquest"
      className={className}
    />
  );
}
