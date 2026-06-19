import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { organizationService } from '../services/organizationService';
import { useAuth } from './useAuth';

/**
 * Persona modes (§10): tailor the UI to the three target users. A persona is an
 * org-wide presentation preference (Organization.settings.persona) — it changes
 * what is SHOWN, never the underlying data, calculations or factors. Admins
 * switch it; everyone else inherits the org's mode.
 */

export type Persona = 'enterprise' | 'consultant' | 'sme';

export const PERSONAS: { id: Persona; label: string; tagline: string; description: string }[] = [
  {
    id: 'enterprise',
    label: 'Enterprise',
    tagline: 'Full audit-ready toolset',
    description:
      'Every compliance surface — consolidation, verification, disclosure frameworks, calculation lineage and the audit trail.',
  },
  {
    id: 'consultant',
    label: 'Consultant',
    tagline: 'Client-ready preparation & exports',
    description:
      'The full toolset, oriented to preparing client deliverables — the assurance package, Inventory Management Plan and framework exports.',
  },
  {
    id: 'sme',
    label: 'SME',
    tagline: 'Streamlined essentials',
    description:
      'A focused view — calculate, screen completeness, attach evidence and produce a report. Advanced enterprise surfaces are tucked away.',
  },
];

export const PERSONA_LABEL: Record<Persona, string> = {
  enterprise: 'Enterprise',
  consultant: 'Consultant',
  sme: 'SME',
};

/**
 * Compliance tabs an SME sees — the streamlined essentials (calculate elsewhere,
 * then screen completeness → produce a reporting-year report → attach evidence).
 * Enterprise and consultant see every tab.
 */
export const SME_COMPLIANCE_TABS = ['reports', 'inventories', 'completeness', 'evidence'];

/** Is this compliance tab visible for the persona? */
export function complianceTabVisible(tabId: string, persona: Persona): boolean {
  if (persona === 'sme') return SME_COMPLIANCE_TABS.includes(tabId);
  return true;
}

/** Consolidation / multi-entity surfaces are an enterprise concern (hidden for SME). */
export function showsConsolidation(persona: Persona): boolean {
  return persona !== 'sme';
}

interface PersonaContextType {
  persona: Persona;
  setPersona: (p: Persona) => Promise<void>;
  loading: boolean;
}

const PersonaContext = createContext<PersonaContextType | undefined>(undefined);

export const PersonaProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [persona, setPersonaState] = useState<Persona>('enterprise');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    organizationService
      .getSettings()
      .then((s) => {
        if (!cancelled) setPersonaState((s.persona as Persona) || 'enterprise');
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const setPersona = useCallback(async (p: Persona) => {
    setPersonaState(p); // optimistic — the UI reflects the choice immediately
    try {
      await organizationService.updateSettings({ persona: p });
    } catch {
      // Best-effort persistence (e.g. a non-admin can't write org settings);
      // the choice still applies for this session.
    }
  }, []);

  return (
    <PersonaContext.Provider value={{ persona, setPersona, loading }}>
      {children}
    </PersonaContext.Provider>
  );
};

export function usePersona() {
  const ctx = useContext(PersonaContext);
  if (!ctx) throw new Error('usePersona must be used within a PersonaProvider');
  return ctx;
}
