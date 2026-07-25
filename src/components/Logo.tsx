import { useTheme } from '../contexts/ThemeContext';

// Theme-aware brand logo. Light theme uses the light-background logo,
// dark theme uses the dark-background logo.
export function Logo({ className = '' }: { className?: string }) {
  const { theme } = useTheme();
  const src = theme === 'dark' ? '/logo_dark.png' : '/logo_light.png';
  return <img src={src} alt="Data Conquest" className={className} />;
}
