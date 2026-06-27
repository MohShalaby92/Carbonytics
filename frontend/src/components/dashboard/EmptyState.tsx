import React from 'react';
import { Button } from '../ui/Button';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  actionHref?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
  actionHref,
}) => {
  return (
    <div className="text-center py-12">
      <Icon className="w-12 h-12 text-muted mx-auto mb-4" />
      <h3 className="text-lg font-medium text-fg mb-2">{title}</h3>
      <p className="text-muted mb-6 max-w-sm mx-auto">{description}</p>
      {(actionLabel && (onAction || actionHref)) && (
        <Button
          onClick={onAction}
          href={actionHref}
          variant="outline"
        >
          {actionLabel}
        </Button>
      )}
    </div>
  );
};
