import React, { useState } from 'react';
import { Search, Receipt, Printer, Calendar, ArrowRight, Eye, CheckCircle2 } from 'lucide-react';
import { money, date } from '../../services/api';
import ReceiptModal from '../../components/Receipt';

export default function SalesHistory({ sales = [], toast }) {
  const [query, setQuery] = useState('');
  const [filterPeriod, setFilterPeriod] = useState('all'); // 'today' | 'all'
  const [selectedReceipt, setSelectedReceipt] = useState(null);

  const filteredSales = sales.filter(s => {
    if(filterPeriod==='today' && new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Santiago'}).format(new Date(s.created_at))!==new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Santiago'}).format(new Date()))return false;
    const q = query.toLowerCase().trim();
    if (!q) return true;
    const searchString = [
      `V-${String(s.number || '').padStart(6, '0')}`,
      s.customer_name || '',
      s.payment_method || '',
      s.external_reference || ''
    ].join(' ').toLowerCase();
    return searchString.includes(q);
  });

  return (
    <div className="pos-subpage-container">
      {/* Header */}
      <div className="pos-subpage-header">
        <div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white">Historial de Ventas</h1>
          <p className="text-xs text-gray-500 mt-0.5">Auditoría completa de boletas y comprobantes emitidos en el Punto de Venta</p>
        </div>

        <div className="flex gap-2">
          <div className="pos-search-input-wrap !w-72">
            <Search size={16} className="pos-search-icon" />
            <input 
              type="text"
              placeholder="Buscar por V-XXXXXX o cliente..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pos-search-input text-xs"
            />
          </div>
        </div>
      </div>

      {/* Sales Table */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm mt-5">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/75 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-800 text-gray-500 uppercase text-[10px] font-bold">
              <tr>
                <th className="py-3 px-4">Comprobante</th>
                <th className="py-3 px-4">Fecha y Hora</th>
                <th className="py-3 px-4">Cliente / RUT</th>
                <th className="py-3 px-4">Ítems</th>
                <th className="py-3 px-4">Método</th>
                <th className="py-3 px-4 text-right">Total</th>
                <th className="py-3 px-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {filteredSales.map(s => {
                const units = s.items?.reduce((a, b) => a + (b.qty || 1), 0) || 1;
                return (
                  <tr key={s.id} className="hover:bg-gray-50/50 dark:hover:bg-neutral-800/40 transition">
                    <td className="py-3 px-4 font-black text-blue-600 dark:text-blue-400">
                      V-{String(s.number || '').padStart(6, '0')}
                    </td>
                    <td className="py-3 px-4 text-gray-500 font-medium">
                      {date(s.created_at)}
                    </td>
                    <td className="py-3 px-4 font-bold text-gray-800 dark:text-gray-200">
                      {s.customer_name || 'Cliente mostrador'}
                    </td>
                    <td className="py-3 px-4 text-gray-500">
                      {units} {units === 1 ? 'unidad' : 'unidades'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="capitalize px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                        {s.payment_method === 'cash' ? '💵 Efectivo' : s.payment_method === 'card' ? '💳 Tarjeta' : s.payment_method === 'transfer' ? '🏦 Transferencia' : '📲 Mixto'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-black text-right text-gray-900 dark:text-white">
                      {money(s.total)}
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button 
                        className="px-2.5 py-1 rounded-lg text-xs font-bold border border-gray-200 dark:border-neutral-700 hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-700 dark:text-gray-200 inline-flex items-center gap-1.5 transition"
                        onClick={() => setSelectedReceipt(s)}
                      >
                        <Printer size={13} />
                        <span>Ver Ticket</span>
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredSales.length === 0 && (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-gray-400">
                    No hay ventas registradas que coincidan con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Receipt Modal */}
      {selectedReceipt && (
        <ReceiptModal sale={selectedReceipt} close={() => setSelectedReceipt(null)} />
      )}
    </div>
  );
}
