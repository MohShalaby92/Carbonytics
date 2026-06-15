import React, { useEffect, useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { organizationService } from '../../services/organizationService';
import { OnboardingWizard } from './OnboardingWizard';

/**
 * Decides whether to show the guided onboarding wizard. It auto-appears for an
 * admin/manager of an organization that hasn't completed (or skipped) onboarding
 * — i.e. a freshly-registered tenant. Pre-wizard organizations report
 * shouldShowWizard=false from the backend and never see it.
 */
export const OnboardingGate: React.FC = () => {
  const { user, loading } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (loading || !user) {
      setShow(false);
      return;
    }
    const canOnboard = user.role === 'admin' || user.role === 'manager';
    if (!canOnboard) {
      setShow(false);
      return;
    }
    organizationService
      .getOnboarding()
      .then((ob) => {
        if (!cancelled && ob.shouldShowWizard) setShow(true);
      })
      .catch(() => {
        /* onboarding is non-blocking — never break the app over it */
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.role, loading]);

  if (!show) return null;
  return <OnboardingWizard onClose={() => setShow(false)} />;
};
