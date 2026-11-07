import React from 'react';
import { BarChart3, TrendingUp, DollarSign, CreditCard, Banknote, Building2, Calendar, Award } from 'lucide-react';
import { money } from '../../services/api';

export default function PosReports({ sales = [] }) {
  const totalSales = sales.reduce((a, b) => a + (b.total || 0), 0);
  const totalOrders = sales.length;
  const avgTicket = totalOrders > 0 ? Math.round(totalSales / totalOrders) : 0;

  const cashTotal = sales.filter(s => s.payment_method === 'cash').reduce((a, b) => a + (b.total || 0), 0);
  const cardTotal = sales.filter(s => s.payment_method === 'card').reduce((a, b) => a + (b.total || 0), 0);
  const transferTotal = sales.filter(s => s.payment_method === 'transfer').reduce((a, b) => a + (b.total || 0), 0);

  const cashPct = totalSales > 0 ? Math.round((cashTotal / totalSales) * 100) : 0;
  const cardPct = totalSales > 0 ? Math.round((cardTotal / totalSales) * 100) : 0;
  const transferPct = totalSales > 0 ? Math.round((transferTotal / totalSales) * 100) : 0;

  return (
    <div className="pos-subpage-container">
      <div className="pos-subpage-header">
        <div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white">Reportes de Punto de Venta</h1>
          <p className="text-xs text-gray-500 mt-0.5">Rendimiento comercial por caja, medios de pago y ticket promedio</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 my-5">
        <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between items-center text-gray-500 text-xs font-bold">
            <span>Ventas Totales POS</span>
            <TrendingUp size={16} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white mt-1.5">{money(totalSales)}</div>
          <small className="text-[11px] text-gray-400">{totalOrders} comprobantes emitidos</small>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between items-center text-gray-500 text-xs font-bold">
            <span>Ticket Promedio</span>
            <DollarSign size={16} className="text-blue-500" />
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white mt-1.5">{money(avgTicket)}</div>
          <small className="text-[11px] text-gray-400">Promedio por cliente en mostrador</small>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between items-center text-gray-500 text-xs font-bold">
            <span>Cajero Principal</span>
            <Award size={16} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white mt-1.5">Juan Pérez</div>
          <small className="text-[11px] text-emerald-500 font-bold">100% efectividad de caja</small>
        </div>
      </div>

      {/* Payment Methods Breakdown */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm mt-5">
        <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-4">
          Distribución por Medios de Pago
        </h3>

        <div className="space-y-4">
          <div>
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <Banknote size={15} className="text-emerald-500" />
                Efectivo en Caja ({cashPct}%)
              </span>
              <span className="font-black">{money(cashTotal)}</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-neutral-800 h-2.5 rounded-full overflow-hidden">
              <div className="bg-emerald-500 h-full rounded-full transition-all duration-500" style={{ width: `${cashPct}%` }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <CreditCard size={15} className="text-blue-500" />
                Tarjeta de Débito / Crédito (POS) ({cardPct}%)
              </span>
              <span className="font-black">{money(cardTotal)}</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-neutral-800 h-2.5 rounded-full overflow-hidden">
              <div className="bg-blue-500 h-full rounded-full transition-all duration-500" style={{ width: `${cardPct}%` }}></div>
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <Building2 size={15} className="text-purple-500" />
                Transferencias Bancarias ({transferPct}%)
              </span>
              <span className="font-black">{money(transferTotal)}</span>
            </div>
            <div className="w-full bg-gray-100 dark:bg-neutral-800 h-2.5 rounded-full overflow-hidden">
              <div className="bg-purple-500 h-full rounded-full transition-all duration-500" style={{ width: `${transferPct}%` }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
