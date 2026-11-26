'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

interface Module {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  enabled: boolean;
  category: string;
}

const colorMap: Record<string, string> = {
  red: 'bg-red-100 text-red-600',
  blue: 'bg-blue-100 text-blue-600',
  purple: 'bg-purple-100 text-purple-600',
  teal: 'bg-teal-100 text-teal-600',
  orange: 'bg-orange-100 text-orange-600',
  amber: 'bg-amber-100 text-amber-600',
  yellow: 'bg-yellow-100 text-yellow-600',
  indigo: 'bg-indigo-100 text-indigo-600',
  gray: 'bg-gray-100 text-gray-600'
};

export default function ModulesPage() {
  const [loading, setLoading] = useState(true);

  // Only switches that control something are listed. Each one shows or hides
  // a page in the admin menu (see menuItems in app/admin/layout.tsx).
  const [modules, setModules] = useState<Module[]>([
    {
      id: 'notifications',
      name: 'Notifications',
      description: 'Shows the Notifications page in the admin menu. That page sends email and SMS campaigns to customers.',
      icon: 'ri-notification-3-line',
      color: 'red',
      enabled: false,
      category: 'Marketing'
    },
    {
      id: 'blog',
      name: 'Blog',
      description: 'Shows the Blog page in the admin menu.',
      icon: 'ri-article-line',
      color: 'teal',
      enabled: false,
      category: 'Marketing'
    },
    {
      id: 'customer-insights',
      name: 'Customer Insights',
      description: 'Shows the Customer Insights page in the admin menu.',
      icon: 'ri-user-search-line',
      color: 'orange',
      enabled: false,
      category: 'Analytics'
    }
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetchModuleStates();
  }, []);

  const fetchModuleStates = async () => {
    try {
      const { data, error } = await supabase.from('store_modules').select('*');
      if (error) throw error;

      if (data) {
        setModules(prev => prev.map(m => {
          const dbState = data.find((d: any) => d.id === m.id);
          return dbState ? { ...m, enabled: !!dbState.enabled } : m;
        }));
      }
    } catch (err: any) {
      console.error('Error fetching modules:', err);
      setSaveError(`Could not load the current settings: ${err?.message || 'unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleModule = async (id: string, currentState: boolean) => {
    if (savingId) return;
    const newState = !currentState;
    const setEnabled = (enabled: boolean) =>
      setModules(prev => prev.map(m => (m.id === id ? { ...m, enabled } : m)));

    setSavingId(id);
    setSaveError(null);
    setEnabled(newState); // show the change straight away

    try {
      // No upsert here: update the row when it exists, insert only when it does not.
      const existing = await supabase
        .from('store_modules')
        .select('id')
        .eq('id', id)
        .maybeSingle();
      if (existing.error) throw new Error(existing.error.message);

      const updated_at = new Date().toISOString();
      const { error } = existing.data
        ? await supabase.from('store_modules').update({ enabled: newState, updated_at }).eq('id', id)
        : await supabase.from('store_modules').insert({ id, enabled: newState, updated_at });
      if (error) throw new Error(error.message);

      // Tell the admin menu (app/admin/layout.tsx) to re-read the switches.
      window.dispatchEvent(new Event('store-modules-changed'));
    } catch (err: any) {
      console.error('Error updating module:', err);
      setEnabled(currentState); // put the switch back
      setSaveError(`The change was not saved: ${err?.message || 'unknown error'}`);
    } finally {
      setSavingId(null);
    }
  };

  const categories = ['all', ...Array.from(new Set(modules.map(m => m.category)))];

  const filteredModules = modules.filter(module => {
    const matchesSearch = module.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      module.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = filterCategory === 'all' || module.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedModules = filteredModules.reduce((acc, module) => {
    if (!acc[module.category]) {
      acc[module.category] = [];
    }
    acc[module.category].push(module);
    return acc;
  }, {} as Record<string, typeof modules>);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Modules & Features</h1>
        <p className="text-gray-600 mb-8">
          These switches show or hide pages in the admin menu. A hidden page can still be opened by its address.
        </p>

        {saveError && (
          <div role="alert" className="mb-6 p-4 rounded-lg border border-red-200 bg-red-50 text-red-700 text-sm">
            {saveError}
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
              <input
                type="text"
                placeholder="Search modules..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="p-2 border border-gray-300 rounded-lg outline-none"
            >
              {categories.map(c => <option key={c} value={c}>{c === 'all' ? 'All Categories' : c}</option>)}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12">Loading modules...</div>
        ) : (
          <div className="space-y-10">
            {Object.entries(groupedModules).map(([category, items]) => (
              <div key={category}>
                <h2 className="text-xl font-bold text-gray-800 mb-4 border-l-4 border-blue-500 pl-3">{category}</h2>
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {items.map(module => (
                    <div key={module.id} className={`bg-white rounded-xl border-2 p-6 transition-all ${module.enabled ? 'border-blue-500 shadow-md' : 'border-gray-200 opacity-75'}`}>
                      <div className="flex justify-between items-start mb-4">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorMap[module.color] || 'bg-gray-100 text-gray-600'}`}>
                          <i className={`${module.icon} text-2xl`}></i>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={module.enabled}
                          aria-label={`${module.name}: ${module.enabled ? 'shown in the menu' : 'hidden from the menu'}`}
                          disabled={savingId !== null}
                          onClick={() => toggleModule(module.id, module.enabled)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer disabled:cursor-wait ${module.enabled ? 'bg-blue-600' : 'bg-gray-300'}`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${module.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                      </div>
                      <h3 className="text-lg font-bold text-gray-900">{module.name}</h3>
                      <p className="text-sm text-gray-500 mt-1 min-h-[2.5rem]">{module.description}</p>
                      <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between items-center">
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${module.enabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                          {savingId === module.id ? 'Saving...' : module.enabled ? 'Shown in menu' : 'Hidden from menu'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
