import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/api';
import { EmissionCategory } from '../../types';
import { cn } from '../../utils/cn';
import { Factory, Zap, Truck, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';

interface CategorySelectorProps {
  onCategorySelect: (categoryId: string) => void;
  selectedCategoryId?: string;
}

export const CategorySelector: React.FC<CategorySelectorProps> = ({
  onCategorySelect,
  selectedCategoryId,
}) => {
  const [categories, setCategories] = useState<Record<string, EmissionCategory[]>>({});
  const [loading, setLoading] = useState(true);
  const [expandedScopes, setExpandedScopes] = useState<Set<number>>(new Set([1, 2, 3]));
  const [showPriorityHelp, setShowPriorityHelp] = useState(false);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const response = await apiService.get<{ grouped: Record<string, EmissionCategory[]> }>('/emission-categories');
      if (response.success && response.data) {
        setCategories(response.data.grouped);
      }
    } catch (error) {
      console.error('Failed to load categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleScope = (scope: number) => {
    const newExpanded = new Set(expandedScopes);
    if (newExpanded.has(scope)) {
      newExpanded.delete(scope);
    } else {
      newExpanded.add(scope);
    }
    setExpandedScopes(newExpanded);
  };

  const getScopeIcon = (scope: number) => {
    switch (scope) {
      case 1: return <Factory className="w-4 h-4" />;
      case 2: return <Zap className="w-4 h-4" />;
      case 3: return <Truck className="w-4 h-4" />;
      default: return null;
    }
  };

  const getScopeColor = (scope: number) => {
    switch (scope) {
      case 1: return 'text-red-600 dark:text-red-400 bg-red-500/10 border-red-500/25';
      case 2: return 'text-yellow-600 dark:text-yellow-400 bg-yellow-500/10 border-yellow-500/25';
      case 3: return 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/25';
      default: return 'text-muted bg-fg/[0.04] border-line';
    }
  };

  const getScopeDescription = (scope: number) => {
    switch (scope) {
      case 1: return 'Direct emissions from owned/controlled sources';
      case 2: return 'Indirect emissions from purchased energy';
      case 3: return 'Indirect emissions from value chain';
      default: return '';
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(scope => (
          <div key={scope} className="animate-pulse">
            <div className="h-10 bg-fg/[0.08] rounded mb-2"></div>
            <div className="space-y-2 ml-4">
              <div className="h-6 bg-fg/[0.06] rounded w-3/4"></div>
              <div className="h-6 bg-fg/[0.06] rounded w-2/3"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Priority legend */}
      <div className="flex items-center justify-between text-xs text-muted">
        <span>Pick a category to start calculating</span>
        <button
          type="button"
          onClick={() => setShowPriorityHelp((v) => !v)}
          className="flex items-center gap-1 hover:text-fg transition-colors"
          aria-label="What do the priority flags mean?"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          priority flags
        </button>
      </div>
      {showPriorityHelp && (
        <div className="p-3 bg-blue-500/10 border border-blue-500/25 rounded-lg text-xs text-blue-700 dark:text-blue-300 space-y-1">
          <p className="font-medium">What do high / medium / low mean?</p>
          <p>
            The flag is the category's typical <strong>materiality</strong> — how much it
            usually contributes to an organization's footprint and how important it is to
            measure first. It is not a data-quality rating.
          </p>
          <ul className="list-disc ml-4 space-y-0.5">
            <li><span className="font-medium">high</span> — usually a major source; measure these first.</li>
            <li><span className="font-medium">medium</span> — relevant for many organizations.</li>
            <li><span className="font-medium">low</span> — niche; include for completeness.</li>
          </ul>
        </div>
      )}

      {[1, 2, 3].map(scope => {
        const scopeKey = `scope${scope}`;
        const scopeCategories = categories[scopeKey] || [];
        const isExpanded = expandedScopes.has(scope);

        return (
          <div key={scope} className="border border-line rounded-lg overflow-hidden">
            {/* Scope Header */}
            <button
              onClick={() => toggleScope(scope)}
              className={cn(
                'w-full px-4 py-3 flex items-center justify-between text-left transition-colors hover:bg-opacity-80',
                getScopeColor(scope)
              )}
            >
              <div className="flex items-center space-x-3">
                {getScopeIcon(scope)}
                <div>
                  <h3 className="font-medium">Scope {scope}</h3>
                  <p className="text-xs opacity-75">{getScopeDescription(scope)}</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-medium bg-surface/60 px-2 py-1 rounded">
                  {scopeCategories.length}
                </span>
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </div>
            </button>

            {/* Categories List */}
            {isExpanded && (
              <div className="border-t border-line bg-surface">
                {scopeCategories.map(category => (
                  <button
                    key={category.id}
                    onClick={() => onCategorySelect(category.id)}
                    className={cn(
                      'w-full px-4 py-3 text-left hover:bg-fg/[0.04] transition-colors border-b border-line last:border-b-0',
                      // Token-based selected state (the old bg-primary-50 was light-mode only)
                      selectedCategoryId === category.id && 'bg-brand/10 ring-1 ring-inset ring-brand/30'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-fg text-sm">
                          {category.category}
                        </h4>
                        <p className="text-xs text-muted mt-1 line-clamp-2">
                          {category.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <span
                            className="inline-block text-xs text-muted bg-fg/[0.06] px-2 py-0.5 rounded"
                            title={
                              category.allowedUnits && category.allowedUnits.length > 0
                                ? `Accepted units: ${category.allowedUnits.map((u) => u.unit).join(', ')}`
                                : undefined
                            }
                          >
                            Unit: {category.baseUnit}
                          </span>
                          {category.subcategory && (
                            <span className="inline-block text-xs text-muted bg-fg/[0.06] px-2 py-0.5 rounded">
                              {category.subcategory}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-3 text-right">
                        <span className={cn(
                          'inline-block text-xs px-2 py-1 rounded-full',
                          category.priority === 'high' && 'bg-red-500/15 text-red-700 dark:text-red-300',
                          category.priority === 'medium' && 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
                          category.priority === 'low' && 'bg-fg/[0.06] text-fg/80'
                        )}>
                          {category.priority}
                        </span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
