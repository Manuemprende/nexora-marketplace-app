import React, { useState } from 'react';
import { Package, Search, AlertTriangle, CheckCircle2, ArrowUpDown } from 'lucide-react';
import { money, available } from '../../services/api';

export default function PosInventory({ products = [], toast }) {
  const [query, setQuery] = useState('');
  const [page,setPage]=useState(1);
  const [filterStock, setFilterStock] = useState('all'); // 'all' | 'low' | 'out'

  const active = products.filter(p => !!p.active);

  const filtered = active.filter(p => {
    const stock = available(p);
    if (filterStock === 'low' && (stock <= 0 || stock > 10)) return false;
    if (filterStock === 'out' && stock > 0) return false;

    const q = query.toLowerCase().trim();
    if (!q) return true;
    return [p.name, p.sku, p.category, p.attributes].join(' ').toLowerCase().includes(q);
  });

  return (
    <div className="pos-subpage-container">
      <div className="pos-subpage-header">
        <div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white">Inventario en Sala (POS)</h1>
          <p className="text-xs text-gray-500 mt-0.5">Control de existencias para mostrador y sincronización con almacén</p>
        </div>

        <div className="flex gap-2">
          <div className="pos-search-input-wrap !w-64">
            <Search size={16} className="pos-search-icon" />
            <input 
              type="text" 
              placeholder="Buscar por SKU o producto..." 
              value={query}
              onChange={e => {setQuery(e.target.value);setPage(1);}}
              className="pos-search-input text-xs" 
            />
          </div>

          <div className="flex bg-gray-100 dark:bg-neutral-800 p-1 rounded-xl">
            <button 
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${filterStock === 'all' ? 'bg-white dark:bg-neutral-700 shadow-sm text-gray-900 dark:text-white' : 'text-gray-500'}`}
              onClick={() => setFilterStock('all')}
            >
              Todos ({active.length})
            </button>
            <button 
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${filterStock === 'low' ? 'bg-white dark:bg-neutral-700 shadow-sm text-amber-600' : 'text-gray-500'}`}
              onClick={() => setFilterStock('low')}
            >
              Bajo Stock
            </button>
            <button 
              className={`px-3 py-1 rounded-lg text-xs font-bold transition ${filterStock === 'out' ? 'bg-white dark:bg-neutral-700 shadow-sm text-rose-600' : 'text-gray-500'}`}
              onClick={() => setFilterStock('out')}
            >
              Agotados
            </button>
          </div>
        </div>
      </div>

      <div className="pagination"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>{page} de {Math.max(1,Math.ceil(filtered.length/20))}</span><button disabled={page*20>=filtered.length} onClick={()=>setPage(p=>p+1)}>Siguiente</button></div><div className="tableWrap">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50/75 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-800 text-gray-500 uppercase text-[10px] font-bold">
            <tr>
              <th className="py-3 px-4">Producto</th>
              <th className="py-3 px-4">SKU</th>
              <th className="py-3 px-4">Categoría</th>
              <th className="py-3 px-4">Precio Venta</th>
              <th className="py-3 px-4">Stock Sala</th>
              <th className="py-3 px-4 text-center">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
            {filtered.slice((page-1)*20,page*20).map(p => {
              const stock = available(p);
              return (
                <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-neutral-800/40 transition">
                  <td className="py-3 px-4 font-bold text-gray-900 dark:text-white">
                    {p.name}
                    {p.attributes && <span className="block text-[10px] text-gray-400 font-normal">{p.attributes}</span>}
                  </td>
                  <td className="py-3 px-4 font-mono text-gray-500">{p.sku}</td>
                  <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{p.category || 'General'}</td>
                  <td className="py-3 px-4 font-bold text-gray-900 dark:text-white">{money(p.price)}</td>
                  <td className="py-3 px-4 font-black text-sm">{stock} un.</td>
                  <td className="py-3 px-4 text-center">
                    {stock > 10 ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800">
                        Óptimo
                      </span>
                    ) : stock > 0 ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800">
                        Por agotar ({stock})
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800">
                        Agotado
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
