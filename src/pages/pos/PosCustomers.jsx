import React, { useState } from 'react';
import { Users, UserPlus, Search, Phone, Mail, FileText, ShoppingBag, Check } from 'lucide-react';
import { money } from '../../services/api';

export default function PosCustomers({ sales = [], toast }) {
  const [query, setQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [customers, setCustomers] = useState(()=>{const map=new Map();sales.filter(s=>s.customer_name&&s.customer_name!=='Cliente mostrador').forEach(s=>{const key=s.customer_rut||s.customer_name;const c=map.get(key)||{id:key,name:s.customer_name,rut:s.customer_rut||'',phone:'',email:'',totalSpent:0,ordersCount:0};c.totalSpent+=s.total;c.ordersCount++;map.set(key,c);});return [...map.values()];});

  const [newName, setNewName] = useState('');
  const [newRut, setNewRut] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const filtered = customers.filter(c => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.rut.toLowerCase().includes(q) || c.phone.includes(q);
  });

  const handleAddCustomer = () => {
    if (!newName.trim()) return;
    const item = {
      id: Date.now(),
      name: newName.trim(),
      rut: newRut.trim() || 'Sin RUT',
      phone: newPhone.trim() || '+56 9 ...',
      email: newEmail.trim() || '',
      totalSpent: 0,
      ordersCount: 0
    };
    setCustomers([item, ...customers]);
    setShowAddModal(false);
    setNewName('');
    setNewRut('');
    setNewPhone('');
    setNewEmail('');
    toast?.('Cliente añadido a esta sesión; directorio persistente pendiente');
  };

  return (
    <div className="pos-subpage-container">
      <div className="pos-subpage-header">
        <div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white">Clientes Frecuentes</h1>
          <p className="text-xs text-gray-500 mt-0.5">Directorio de clientes para emisión de boleta, RUT y fidelización</p>
        </div>

        <div className="flex gap-2">
          <div className="pos-search-input-wrap !w-64">
            <Search size={16} className="pos-search-icon" />
            <input 
              type="text" 
              placeholder="Buscar por nombre o RUT..." 
              value={query}
              onChange={e => setQuery(e.target.value)}
              className="pos-search-input text-xs" 
            />
          </div>

          <button className="pos-btn-primary" onClick={() => setShowAddModal(true)}>
            <UserPlus size={15} />
            <span>+ Nuevo Cliente</span>
          </button>
        </div>
      </div>

      {/* Customers List */}
      <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl overflow-hidden shadow-sm mt-5">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50/75 dark:bg-neutral-800/50 border-b border-gray-200 dark:border-neutral-800 text-gray-500 uppercase text-[10px] font-bold">
            <tr>
              <th className="py-3 px-4">Cliente</th>
              <th className="py-3 px-4">RUT</th>
              <th className="py-3 px-4">Teléfono / WhatsApp</th>
              <th className="py-3 px-4">Compras</th>
              <th className="py-3 px-4 text-right">Total Acumulado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-neutral-800">
            {filtered.map(c => (
              <tr key={c.id} className="hover:bg-gray-50/50 dark:hover:bg-neutral-800/40 transition">
                <td className="py-3 px-4 font-bold text-gray-900 dark:text-white flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 flex items-center justify-center text-xs font-bold shrink-0">
                    {c.name.charAt(0)}
                  </div>
                  <div>
                    <div>{c.name}</div>
                    {c.email && <div className="text-[10px] text-gray-400 font-normal">{c.email}</div>}
                  </div>
                </td>
                <td className="py-3 px-4 font-mono text-gray-600 dark:text-gray-300 font-semibold">{c.rut}</td>
                <td className="py-3 px-4 text-gray-600 dark:text-gray-300">{c.phone}</td>
                <td className="py-3 px-4 text-gray-600 dark:text-gray-300 font-bold">{c.ordersCount} pedidos</td>
                <td className="py-3 px-4 text-right font-black text-emerald-600 dark:text-emerald-400">{money(c.totalSpent)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="pos-modal-overlay">
          <div className="pos-modal-card">
            <h3 className="font-bold text-base text-gray-900 dark:text-white mb-3">Registrar Nuevo Cliente</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-gray-600">Nombre Completo *</label>
                <input 
                  type="text" 
                  value={newName} 
                  onChange={e => setNewName(e.target.value)} 
                  placeholder="Ej: Marcelo González" 
                  className="pos-modal-input" 
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600">RUT Chileno</label>
                <input 
                  type="text" 
                  value={newRut} 
                  onChange={e => setNewRut(e.target.value)} 
                  placeholder="Ej: 17.829.102-4" 
                  className="pos-modal-input" 
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600">Teléfono / WhatsApp</label>
                <input 
                  type="tel" 
                  value={newPhone} 
                  onChange={e => setNewPhone(e.target.value)} 
                  placeholder="+56 9 8765 4321" 
                  className="pos-modal-input" 
                />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600">Correo Electrónico</label>
                <input 
                  type="email" 
                  value={newEmail} 
                  onChange={e => setNewEmail(e.target.value)} 
                  placeholder="cliente@ejemplo.cl" 
                  className="pos-modal-input" 
                />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button className="pos-btn-outline flex-1" onClick={() => setShowAddModal(false)}>Cancelar</button>
              <button className="pos-btn-primary flex-1" onClick={handleAddCustomer}>Crear Cliente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
