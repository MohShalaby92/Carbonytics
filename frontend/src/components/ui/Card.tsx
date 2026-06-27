import React from 'react';
import { cn } from '../../utils/cn';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ className, children, ...props }) => {
  return (
    <div
      className={cn('rounded-2xl border border-line bg-surface shadow-soft', className)}
      {...props}
    >
      {children}
    </div>
  );
};
