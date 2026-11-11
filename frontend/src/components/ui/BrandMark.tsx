import React from 'react';
import { cn } from '../../utils/cn';
import { useTheme } from '../../hooks/useTheme';

/**
 * The dotted-C mark. Verdant uses the original greens; Console swaps in a lightness-lifted
 * variant so the deep dots stay visible on near-black. Always transparent (never on a chip).
 */
export const BrandMark: React.FC<{ className?: string }> = ({ className }) => {
  const { theme } = useTheme();
  return (
    <img
      src={theme === 'dark' ? '/icon-dark.png' : '/icon.png'}
      alt=""
      aria-hidden="true"
      className={cn('object-contain', className)}
    />
  );
};
