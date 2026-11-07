import React, { useState, useEffect } from 'react';
import NewSale from './NewSale';
import {Shifts as CashShifts,History as SalesHistory,Customers as PosCustomers,Inventory as PosInventory,Reports as PosReports,Preferences as PosSettings} from './WorkspacePages';

export default function PosContainer({ products = [], sales = [], refresh, toast, activeSubTab = 'sale', onTabChange, catalogLoading }) {
  const [currentTab, setCurrentTab] = useState(activeSubTab || 'sale');

  useEffect(() => {
    if (activeSubTab) {
      setCurrentTab(activeSubTab);
    }
  }, [activeSubTab]);

  const handleTabSwitch = (tab) => {
    setCurrentTab(tab);
    if (onTabChange) {
      onTabChange(tab);
    }
  };

  return (
    <div className="pos-root-container">
      {currentTab === 'sale' && (
        <NewSale 
          products={products} catalogLoading={catalogLoading} 
          sales={sales} 
          refresh={refresh} 
          toast={toast} 
          onNavigateTab={handleTabSwitch} 
        />
      )}
      {currentTab === 'shifts' && (
        <CashShifts 
          sales={sales} 
          toast={toast} 
        />
      )}
      {currentTab === 'history' && (
        <SalesHistory 
          sales={sales} 
          toast={toast} 
        />
      )}
      {currentTab === 'inventory' && (
        <PosInventory 
          products={products} catalogLoading={catalogLoading} 
          toast={toast} 
        />
      )}
      {currentTab === 'customers' && (
        <PosCustomers 
          sales={sales} 
          toast={toast} 
        />
      )}
      {currentTab === 'reports' && (
        <PosReports 
          sales={sales} 
        />
      )}
      {currentTab === 'settings' && (
        <PosSettings 
          toast={toast} 
        />
      )}
    </div>
  );
}
