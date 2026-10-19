import { useMemo, useRef, useEffect, useCallback, useState } from 'react';
import { Search, Coffee, UtensilsCrossed, ShoppingCart, AlertCircle, Package, Star, X, Grid2x2, Grid3x3, List } from 'lucide-react';
import { Badge, EmptyState, Button } from '../../components/ui';
import { usePosStore } from '../../store/usePosStore';
import { useAppContext } from '../../context/AppContext';
import { useMenuData } from '../../hook/useMenuData';
import { useShiftData } from '../../hook/useShiftData';
import { useCustomerData } from '../../hook/useCustomerData';
import { useVouchers } from '../../hook/useVouchers';
import CartDrawer from './CartDrawer';
import PaymentModal from './PaymentModal';
import VariantSelectionModal from './VariantSelectionModal';
import ReceiptModal from './ReceiptModal';

function CategoryTextTab({ cat, isActive, onClick }) {
  return (
    <button type="button" onClick={() => onClick(cat)} data-active={isActive}
      className={`shrink-0 whitespace-nowrap select-none cursor-pointer pb-2 text-sm font-bold border-b-2 transition-colors duration-200 ${
        isActive ? 'text-accent-600 dark:text-accent-400 border-accent-500' : 'text-slate-400 dark:text-slate-500 border-transparent'
      }`}>
      {cat}
    </button>
  );
}

/**
 * PosView — shell yang menyatukan semua data (menu, shift, pelanggan,
 * voucher, karyawan) lalu meneruskannya ke CartDrawer/PaymentModal/
 * VariantSelectionModal lewat props. Navigasi kategori, grid menu,
 * pencarian, mode tampilan, dan swipe kategori DI-PORT PERSIS dari
 * mamam-global — murni UI, tidak menyentuh data sama sekali.
 *
 * "Terlaris"/Favorit dihitung dari transaksi 30 hari terakhir (bukan
 * seluruh histori tak terbatas seperti A) supaya query tetap ringan;
 * cukup untuk kebutuhan "track harian".
 */
export default function PosView() {
  const addToCart = usePosStore((s) => s.addToCart);
  const searchQuery = usePosStore((s) => s.searchQuery);
  const setSearchQuery = usePosStore((s) => s.setSearchQuery);
  const selectedCategory = usePosStore((s) => s.selectedCategory);
  const setSelectedCategory = usePosStore((s) => s.setSelectedCategory);
  const cart = usePosStore((s) => s.cart);
  const setIsCartOpen = usePosStore((s) => s.setIsCartOpen);
  const setSelectedMenuForVariant = usePosStore((s) => s.setSelectedMenuForVariant);
  const setVariantSelectedOptions = usePosStore((s) => s.setVariantSelectedOptions);

  const { triggerAlert, triggerConfirm, formatRupiah, navigate } = useAppContext();
  const menuData = useMenuData();
  const shiftData = useShiftData();
  const customerData = useCustomerData();
  const voucherData = useVouchers();

  const { menus, variantGroups } = menuData;
  const { currentShift, employees } = shiftData;
  const { customers, saveCustomer } = customerData;
  const { vouchers } = voucherData;

  const [recentOrderCounts, setRecentOrderCounts] = useState({});
  const [receiptResult, setReceiptResult] = useState(null);

  // Statistik "terlaris" 30 hari terakhir — sekali per kunjungan ke Kasir.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const { supabase } = await import('../../lib/supabase');
      const { data } = await supabase.from('transaction_items')
        .select('menu_item_id, qty, transactions!inner(status, paid_at)')
        .eq('transactions.status', 'paid').gte('transactions.paid_at', since.toISOString());
      if (cancelled || !data) return;
      const counts = {};
      data.forEach(row => { counts[row.menu_item_id] = (counts[row.menu_item_id] || 0) + (row.qty || 0); });
      setRecentOrderCounts(counts);
    })();
    return () => { cancelled = true; };
  }, []);

  const categoryTabsRef = useRef(null);
  const [gridVisible, setGridVisible] = useState(true);
  const VIEW_MODES = [
    { key: 'grid2', label: 'Grid 2 kolom', icon: Grid2x2 },
    { key: 'grid3', label: 'Grid 3 kolom', icon: Grid3x3 },
    { key: 'list', label: 'List', icon: List },
  ];
  const [viewMode, setViewMode] = useState('grid2');
  const cycleViewMode = useCallback(() => {
    setViewMode(prev => VIEW_MODES[(VIEW_MODES.findIndex(v => v.key === prev) + 1) % VIEW_MODES.length].key);
  }, []);

  const FAVORITE_LIMIT = 12;
  const favoriteMenus = useMemo(() =>
    [...menus].filter(m => (recentOrderCounts[m.id] || 0) > 0)
      .sort((a, b) => (recentOrderCounts[b.id] || 0) - (recentOrderCounts[a.id] || 0))
      .slice(0, FAVORITE_LIMIT),
    [menus, recentOrderCounts]);

  const isSearching = Boolean(searchQuery.trim());
  const filteredMenus = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let result;
    if (q) {
      result = menus.filter(m => m.name.toLowerCase().includes(q));
    } else {
      const base = selectedCategory === 'Favorit' ? favoriteMenus : menus;
      result = base.filter(m => selectedCategory === 'Favorit' || selectedCategory === 'Semua' || m.category === selectedCategory);
    }
    if (!q && selectedCategory !== 'Favorit') {
      result = [...result].sort((a, b) => (recentOrderCounts[b.id] || 0) - (recentOrderCounts[a.id] || 0));
    }
    return result;
  }, [menus, favoriteMenus, selectedCategory, searchQuery, recentOrderCounts]);

  const [tabs, setTabs] = useState(['Favorit', 'Semua']);
  useEffect(() => {
    const base = ['Favorit', 'Semua'];
    const activeCats = [...new Set(menus.map(m => m.category).filter(Boolean))];
    setTabs(prev => {
      const valid = [...base, ...activeCats];
      let updated = prev.filter(c => valid.includes(c));
      const missing = valid.filter(c => !updated.includes(c));
      if (missing.length > 0) updated = [...updated, ...missing];
      return (updated.length !== prev.length || updated.some((v, i) => v !== prev[i])) ? updated : prev;
    });
  }, [menus]);

  const handleCategoryClick = useCallback((cat) => {
    if (cat === selectedCategory && !searchQuery.trim()) return;
    setGridVisible(false);
    setTimeout(() => { setSearchQuery(''); setSelectedCategory(cat); setGridVisible(true); }, 170);
  }, [selectedCategory, searchQuery, setSelectedCategory, setSearchQuery]);

  useEffect(() => {
    const el = categoryTabsRef.current?.querySelector('[data-active="true"]');
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedCategory]);

  const touchStartRef = useRef({ x: 0, y: 0, time: 0 });
  const handleTouchStart = useCallback((e) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() };
  }, []);
  const handleTouchEnd = useCallback((e) => {
    if (isSearching || tabs.length === 0) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    const dt = Date.now() - touchStartRef.current.time;
    if (Math.abs(dx) < 50 || Math.abs(dy) > 60 || dt > 600) return;
    const currentIdx = tabs.indexOf(selectedCategory);
    if (currentIdx === -1) return;
    const nextIdx = dx < 0 ? currentIdx + 1 : currentIdx - 1;
    if (nextIdx < 0 || nextIdx >= tabs.length) return;
    handleCategoryClick(tabs[nextIdx]);
  }, [isSearching, tabs, selectedCategory, handleCategoryClick]);

  const handleMenuClick = useCallback((menu) => {
    if (!currentShift) {
      triggerAlert('Peringatan: Dompet belum dibuka. Harap buka dompet terlebih dahulu di menu "Dompet".');
      navigate('dompet');
      return;
    }
    if (menu.variantGroupIds.length > 0) {
      setSelectedMenuForVariant(menu);
      setVariantSelectedOptions({});
    } else {
      addToCart(menu, {}, variantGroups);
    }
    if (searchQuery.trim()) setSearchQuery('');
  }, [currentShift, triggerAlert, navigate, setSelectedMenuForVariant, setVariantSelectedOptions, addToCart, variantGroups, searchQuery, setSearchQuery]);

  if (menuData.loading || shiftData.loading) {
    return <div className="flex-1 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">Memuat kasir...</div>;
  }
  if (menuData.error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
        <p className="text-sm font-semibold text-red-500">Gagal memuat menu</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 max-w-xs">{menuData.error}</p>
        <Button onClick={menuData.reload}>Coba Lagi</Button>
      </div>
    );
  }

  const cartTotalQty = cart.reduce((sum, item) => sum + item.qty, 0);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 dark:bg-slate-950 relative">
      {!currentShift && (
        <Badge variant="danger" className="w-full justify-center py-2 text-xs font-bold gap-2">
          <AlertCircle className="w-4 h-4" /> Dompet belum dibuka! Buka dompet dulu sebelum transaksi.
        </Badge>
      )}

      <div className="px-4 short:px-3 pt-4 short:pt-2 pb-3 short:pb-2 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-sm z-10 sticky top-0">
        <div className="flex items-center gap-2 mb-3 short:mb-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4 short:w-3.5 short:h-3.5 pointer-events-none" />
            <input type="text" placeholder="Cari menu..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 short:pl-9 pr-10 py-2.5 short:py-1.5 rounded-full border border-slate-100 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-slate-100 transition-all duration-300 text-sm short:text-xs font-medium" />
            {isSearching && (
              <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200"><X className="w-4 h-4" /></button>
            )}
          </div>
          <button onClick={cycleViewMode} className="shrink-0 rounded-full border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm text-slate-500 dark:text-slate-400 p-3 short:!p-2 active:scale-95 transition-all duration-300"
            aria-label={`Tampilan: ${VIEW_MODES.find(v => v.key === viewMode)?.label}`} title={VIEW_MODES.find(v => v.key === viewMode)?.label}>
            {(() => { const Icon = VIEW_MODES.find(v => v.key === viewMode)?.icon || Grid2x2; return <Icon size={18} className="short:!w-4 short:!h-4" />; })()}
          </button>
        </div>

        <div className="relative">
          <div ref={categoryTabsRef} className="flex overflow-x-auto hide-scrollbar gap-5 short:gap-3">
            {tabs.map((cat) => (
              <CategoryTextTab key={cat} cat={cat} isActive={selectedCategory === cat && !isSearching} onClick={handleCategoryClick} />
            ))}
          </div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>

      {isSearching && (
        <div className="px-4 py-2 bg-accent-50 dark:bg-accent-500/10 border-b border-accent-100 dark:border-accent-500/20 flex items-center gap-2 text-xs text-accent-700 dark:text-accent-400 animate-in fade-in">
          <Search className="w-3.5 h-3.5 shrink-0" /><span><span className="font-bold">{filteredMenus.length}</span> menu ditemukan untuk "{searchQuery}"</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 short:p-2 pb-32 short:pb-20" onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <div className={viewMode === 'grid2' ? 'grid grid-cols-2 short:!grid-cols-4 gap-4 short:gap-2' : viewMode === 'grid3' ? 'grid grid-cols-3 short:!grid-cols-4 gap-3 short:gap-2' : 'flex flex-col gap-3 short:gap-2'}
          style={{ opacity: gridVisible ? 1 : 0, transform: gridVisible ? 'translateY(0)' : 'translateY(8px)', transition: 'opacity 0.17s ease, transform 0.17s ease' }}>
          {filteredMenus.map(menu => (
            <div key={menu.id} onClick={() => handleMenuClick(menu)}
              className={`bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-accent-200 dark:hover:border-accent-500/30 active:scale-95 transition-all duration-300 relative overflow-hidden group ${
                viewMode !== 'list' ? 'rounded-3xl short:rounded-xl p-4 md:p-4 short:!p-2 flex flex-col short:!flex-row items-center text-center short:!text-left' : 'rounded-2xl p-3 flex flex-row items-center text-left'
              }`}>
              <div className={`bg-accent-50 dark:bg-accent-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300 ${
                viewMode !== 'list' ? 'w-14 h-14 md:w-16 md:h-16 short:!w-9 short:!h-9 rounded-2xl short:!rounded-lg mb-2.5 md:mb-3 short:!mb-0 short:!mr-2' : 'w-12 h-12 rounded-xl mr-3'
              }`}>
                {menu.category === 'Minuman' ? <Coffee className="w-6 h-6 md:w-8 md:h-8 short:!w-4 short:!h-4 text-accent-600 dark:text-accent-400" /> : <UtensilsCrossed className="w-6 h-6 md:w-8 md:h-8 short:!w-4 short:!h-4 text-accent-600 dark:text-accent-400" />}
              </div>
              <div className={`min-w-0 flex-1 flex flex-col ${viewMode !== 'list' ? 'short:justify-center' : 'justify-center'}`}>
                <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100 text-xs md:text-sm short:!text-xs mb-1 short:!mb-0.5 leading-tight short:truncate">{menu.name}</h3>
                {isSearching && <Badge variant="neutral" className="mb-1 short:hidden">{menu.category}</Badge>}
                <p className="text-accent-600 dark:text-accent-400 font-bold text-xs md:text-sm short:!text-xs mt-auto short:!mt-0">{formatRupiah(menu.price)}</p>
              </div>
              {menu.variantGroupIds.length > 0 && (
                <div className="absolute top-2 right-2 short:!top-1.5 short:!right-1.5"><span className="w-2 h-2 short:!w-1.5 short:!h-1.5 rounded-full bg-amber-400 dark:bg-amber-500 block" /></div>
              )}
            </div>
          ))}
        </div>

        {filteredMenus.length === 0 && selectedCategory === 'Favorit' && !isSearching && (
          <EmptyState icon={<Star className="w-12 h-12" />} title="Belum ada menu favorit" className="mt-10 animate-in fade-in duration-300" />
        )}
        {filteredMenus.length === 0 && (selectedCategory !== 'Favorit' || isSearching) && (
          <EmptyState icon={<Package className="w-12 h-12" />} title="Menu tidak ditemukan" className="mt-10 animate-in fade-in duration-300" />
        )}
      </div>

      <div className="fixed bottom-[calc(6rem+env(safe-area-inset-bottom,0px))] short:!bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] right-6 short:!right-4 z-50">
        <button onClick={() => setIsCartOpen(true)}
          className="relative w-16 h-16 short:!w-14 short:!h-14 rounded-full flex items-center justify-center bg-gradient-to-r from-accent-600 to-accent-500 dark:from-accent-500 dark:to-accent-600 text-white shadow-[0_10px_28px_rgba(var(--color-accent-500),0.4)] hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(var(--color-accent-500),0.45)] transition-all duration-300 active:scale-95">
          <div className="relative">
            <ShoppingCart className="w-8 h-8 short:!w-7 short:!h-7" />
            {cart.length > 0 && (
              <span className="absolute -top-3 -right-3 bg-white text-accent-600 text-xs font-bold rounded-full min-w-6 h-6 px-1 flex items-center justify-center border-2 border-accent-600 animate-in zoom-in duration-300">{cartTotalQty}</span>
            )}
          </div>
        </button>
      </div>

      <CartDrawer menus={menus} customers={customers} saveCustomer={saveCustomer} vouchers={vouchers}
        employees={employees} triggerAlert={triggerAlert} triggerConfirm={triggerConfirm} formatRupiah={formatRupiah} />
      <PaymentModal menus={menus} customers={customers} vouchers={vouchers} employees={employees}
        triggerAlert={triggerAlert} formatRupiah={formatRupiah} onSuccess={setReceiptResult} />
      <VariantSelectionModal variantGroups={variantGroups} formatRupiah={formatRupiah} />
      <ReceiptModal result={receiptResult} onClose={() => setReceiptResult(null)} formatRupiah={formatRupiah} triggerAlert={triggerAlert} />
    </div>
  );
}
