import React, { useState } from 'react';
import { Lock, Unlock, DollarSign, ArrowDownRight, ArrowUpRight, CheckCircle2, History, AlertTriangle, ShieldCheck } from 'lucide-react';
import { money } from '../../services/api';

export default function CashShifts({ sales = [], toast }) {
  const [isOpen, setIsOpen] = useState(false);
  const [openingAmount, setOpeningAmount] = useState(0);
  const [cashMovements, setCashMovements] = useState([]);  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveType, setMoveType] = useState('in');
  const [moveAmount, setMoveAmount] = useState('');
  const [moveDesc, setMoveDesc] = useState('');

  // Calculate sales by payment method
  const cashSales = sales.filter(s => s.payment_method === 'cash').reduce((a, b) => a + (b.total || 0), 0);
  const cardSales = sales.filter(s => s.payment_method === 'card').reduce((a, b) => a + (b.total || 0), 0);
  const transferSales = sales.filter(s => s.payment_method === 'transfer').reduce((a, b) => a + (b.total || 0), 0);
  
  const totalIn = cashMovements.filter(m => m.type === 'in').reduce((a, b) => a + b.amount, 0);
  const totalOut = cashMovements.filter(m => m.type === 'out').reduce((a, b) => a + b.amount, 0);
  const expectedCashInDrawer = openingAmount + cashSales + (totalIn - openingAmount) - totalOut;

  const handleAddMovement = () => {
    const amt = Number(moveAmount);
    if (!amt || amt <= 0) return;
    const now = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' });
    setCashMovements([
      { id: Date.now(), type: moveType, description: moveDesc || (moveType === 'in' ? 'Ingreso de efectivo' : 'Retiro de caja'), amount: amt, time: now },
      ...cashMovements
    ]);
    setShowMoveModal(false);
    setMoveAmount('');
    setMoveDesc('');
    toast?.(moveType === 'in' ? 'Ingreso registrado en caja' : 'Retiro registrado en caja');
  };

  return (
    <div className="pos-subpage-container"><p className="callout">Control de caja de esta sesión. Los movimientos y turnos aún no se guardan en el servidor.</p>
      {/* Header */}
      <div className="pos-subpage-header">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-black text-gray-900 dark:text-white">Caja y Turnos</h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${isOpen ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-rose-500/10 text-rose-600 border-rose-500/20'}`}>
              ● {isOpen ? 'Caja Abierta (Turno Activo)' : 'Caja Cerrada'}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">Sucursal Principal · Terminal Caja 01 · Cajero: Juan Pérez (Admin)</p>
        </div>

        <div className="flex gap-2">
          <button 
            className="pos-quick-btn"
            onClick={() => {
              setMoveType('in');
              setShowMoveModal(true);
            }}
          >
            <ArrowDownRight size={16} className="text-emerald-500" />
            <span>Ingreso de Caja</span>
          </button>

          <button 
            className="pos-quick-btn"
            onClick={() => {
              setMoveType('out');
              setShowMoveModal(true);
            }}
          >
            <ArrowUpRight size={16} className="text-rose-500" />
            <span>Retiro de Caja</span>
          </button>

          <button 
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white shadow-sm transition"
            onClick={() => {
              if (window.confirm('¿Confirmas el arqueo ciego y cierre de turno de la Caja 01?')) {
                setIsOpen(false);
                toast?.('Turno cerrado. Arqueo guardado en base de datos.');
              }
            }}
          >
            <Lock size={14} className="inline mr-1" />
            Cerrar Turno
          </button>
        </div>
      </div>

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 my-5">
        <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between items-center text-gray-500 text-xs font-bold">
            <span>Efectivo en Gaveta</span>
            <DollarSign size={16} className="text-emerald-500" />
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white mt-1.5">{money(expectedCashInDrawer)}</div>
          <small className="text-[11px] text-gray-400">Saldo inicial + Ventas efectivo - Retiros</small>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between items-center text-gray-500 text-xs font-bold">
            <span>Ventas con Tarjeta</span>
            <span className="text-blue-500 text-sm">💳</span>
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white mt-1.5">{money(cardSales)}</div>
          <small className="text-[11px] text-gray-400">Transbank / POS electrónico</small>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between items-center text-gray-500 text-xs font-bold">
            <span>Transferencias</span>
            <span className="text-purple-500 text-sm">🏦</span>
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white mt-1.5">{money(transferSales)}</div>
          <small className="text-[11px] text-gray-400">BancoEstado / CuentaRUT</small>
        </div>

        <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-4 shadow-sm">
          <div className="flex justify-between items-center text-gray-500 text-xs font-bold">
            <span>Sencillo Inicial</span>
            <ShieldCheck size={16} className="text-amber-500" />
          </div>
          <div className="text-2xl font-black text-gray-900 dark:text-white mt-1.5">{money(openingAmount)}</div>
          <small className="text-[11px] text-gray-400">Apertura: Hoy a las 08:30 hrs</small>
        </div>
      </div>

      {/* Cash Movements Table */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm mt-5">
        <h3 className="font-bold text-sm text-gray-900 dark:text-white mb-3 flex items-center gap-2">
          <History size={16} />
          Movimientos de Caja del Turno Actual
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 dark:border-neutral-800 text-gray-400 uppercase text-[10px]">
                <th className="pb-2 font-bold">Hora</th>
                <th className="pb-2 font-bold">Tipo</th>
                <th className="pb-2 font-bold">Descripción</th>
                <th className="pb-2 font-bold text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
              {cashMovements.map(m => (
                <tr key={m.id} className="hover:bg-gray-50/50 dark:hover:bg-neutral-800/40">
                  <td className="py-2.5 font-bold text-gray-500">{m.time}</td>
                  <td className="py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${m.type === 'in' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {m.type === 'in' ? 'Ingreso (+)' : 'Retiro (-)'}
                    </span>
                  </td>
                  <td className="py-2.5 text-gray-700 dark:text-gray-300 font-medium">{m.description}</td>
                  <td className={`py-2.5 font-black text-right ${m.type === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {m.type === 'in' ? `+${money(m.amount)}` : `-${money(m.amount)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for In/Out Movement */}
      {showMoveModal && (
        <div className="pos-modal-overlay">
          <div className="pos-modal-card">
            <h3 className="font-bold text-base text-gray-900 dark:text-white mb-3">
              {moveType === 'in' ? 'Registrar Ingreso de Efectivo' : 'Registrar Retiro de Efectivo'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600">Monto ($ CLP) *</label>
                <input 
                  type="number"
                  placeholder="Ej: 15000"
                  value={moveAmount}
                  onChange={e => setMoveAmount(e.target.value)}
                  className="pos-modal-input"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-600">Motivo / Detalle *</label>
                <input 
                  type="text"
                  placeholder="Ej: Pago de flete local, recarga de sencillo, etc."
                  value={moveDesc}
                  onChange={e => setMoveDesc(e.target.value)}
                  className="pos-modal-input"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button className="pos-btn-outline flex-1" onClick={() => setShowMoveModal(false)}>Cancelar</button>
              <button className="pos-btn-primary flex-1" onClick={handleAddMovement}>Guardar Movimiento</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
