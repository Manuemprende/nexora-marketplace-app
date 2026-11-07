import React, { useState } from 'react';
import { Settings, Printer, Store, Receipt, Sliders, Check } from 'lucide-react';

export default function PosSettings({ toast }) {
  const saved=JSON.parse(localStorage.getItem('nexora-pos-preferences')||'null')||{};
  const [storeName, setStoreName] = useState(saved.storeName||'Nexora - Sucursal Principal');
  const [cashRegister, setCashRegister] = useState(saved.cashRegister||'Caja 01 - Mostrador');
  const [printerWidth, setPrinterWidth] = useState(saved.printerWidth||'80mm');
  const [autoPrint, setAutoPrint] = useState(saved.autoPrint??true);
  const [footerMsg, setFooterMsg] = useState(saved.footerMsg||'¡Gracias por tu compra en Nexora!');

  const handleSave = (e) => {
    e.preventDefault();
    localStorage.setItem('nexora-pos-preferences',JSON.stringify({storeName,cashRegister,printerWidth,autoPrint,footerMsg}));
    toast?.('Preferencias guardadas en este dispositivo. La impresión usa el diálogo del navegador.');
  };

  return (
    <div className="pos-subpage-container">
      <div className="pos-subpage-header">
        <div>
          <h1 className="text-xl font-black text-gray-900 dark:text-white">Configuración del Punto de Venta</h1>
          <p className="text-xs text-gray-500 mt-0.5">Parámetros de terminal, impresora térmica y comprobantes</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm mt-5 max-w-2xl space-y-4">
        <div>
          <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">Nombre de la Sucursal</label>
          <input 
            type="text" 
            value={storeName} 
            onChange={e => setStoreName(e.target.value)} 
            className="pos-modal-input" 
          />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">Identificador de Caja</label>
          <input 
            type="text" 
            value={cashRegister} 
            onChange={e => setCashRegister(e.target.value)} 
            className="pos-modal-input" 
          />
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">Ancho de Impresora Térmica</label>
          <select 
            value={printerWidth} 
            onChange={e => setPrinterWidth(e.target.value)}
            className="pos-modal-input"
          >
            <option value="80mm">80mm (Estándar POS)</option>
            <option value="58mm">58mm (Ticketera portátil / mini)</option>
          </select>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <input 
            type="checkbox" 
            id="autoPrintCheck"
            checked={autoPrint} 
            onChange={e => setAutoPrint(e.target.checked)} 
            className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <label htmlFor="autoPrintCheck" className="text-xs font-bold text-gray-700 dark:text-gray-300 cursor-pointer">
            Imprimir comprobante automáticamente al cobrar
          </label>
        </div>

        <div>
          <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block mb-1">Mensaje al pie del comprobante</label>
          <textarea 
            rows="2"
            value={footerMsg} 
            onChange={e => setFooterMsg(e.target.value)} 
            className="pos-modal-input"
          />
        </div>

        <div className="pt-3">
          <button type="submit" className="pos-btn-primary">
            <Check size={16} />
            <span>Guardar Configuración</span>
          </button>
        </div>
      </form>
    </div>
  );
}
