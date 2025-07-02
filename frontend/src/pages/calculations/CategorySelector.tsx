import React, { useState, useEffect } from 'react';
import { apiService } from '../../services/api';
import { EmissionCategory } from '../../types';
import { cn } from '../../utils/cn';
import { Factory, Zap, Truck, ChevronDown, ChevronRight } from 'lucide-react';

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
      case 1: return 'text-red-600 bg-red-50 border-red-200';
      case 2: return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 3: return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
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
            <div className="h-10 bg-gray-200 rounded mb-2"></div>
            <div className="space-y-2 ml-4">
              <div className="h-6 bg-gray-100 rounded w-3/4"></div>
              <div className="h-6 bg-gray-100 rounded w-2/3"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {[1, 2, 3].map(scope => {
        const scopeKey = `scope${scope}`;
        const scopeCategories = categories[scopeKey] || [];
        const isExpanded = expandedScopes.has(scope);

        return (
          <div key={scope} className="border border-gray-200 rounded-lg overflow-hidden">
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
                <span className="text-xs font-medium bg-white bg-opacity-50 px-2 py-1 rounded">
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
              <div className="border-t border-gray-200 bg-white">
                {scopeCategories.map(category => (
                  <button
                    key={category.id}
                    onClick={() => onCategorySelect(category.id)}
                    className={cn(
                      'w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0',
                      selectedCategoryId === category.id && 'bg-primary-50 border-primary-200'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 text-sm">
                          {category.category}
                        </h4>
                        <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {category.description}
                        </p>
                        {category.subcategory && (
                          <span className="inline-block text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded mt-2">
                            {category.subcategory}
                          </span>
                        )}
                      </div>
                      <div className="ml-3 text-right">
                        <span className={cn(
                          'inline-block text-xs px-2 py-1 rounded-full',
                          category.priority === 'high' && 'bg-red-100 text-red-700',
                          category.priority === 'medium' && 'bg-yellow-100 text-yellow-700',
                          category.priority === 'low' && 'bg-gray-100 text-gray-700'
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
