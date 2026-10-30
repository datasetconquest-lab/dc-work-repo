import { useTheme } from '../contexts/ThemeContext';

// Theme-aware brand logo.
export function Logo({
  className = '',
  variant = 'standard',
}: {
  className?: string;
  variant?: 'standard' | 'solution';
}) {
  const { theme } = useTheme();

  if (variant === 'solution') {
    return (
      <img
        src="/dc_solution_logo.jpg"
        alt="Data Conquest Solution"
        className={className}
      />
    );
  }

  const src = theme === 'dark' ? '/logo_dark.png' : '/logo_light.png';
  return <img src={src} alt="Data Conquest" className={className} />;
}
