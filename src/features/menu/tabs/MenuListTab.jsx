import React, { useState, useMemo, useEffect } from "react";
import { useAppContext } from "../../../context/AppContext";
import { Plus, Edit3, Trash2, Settings2, Search, X, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import CategoryModal from "../../../components/CategoryModal";
import { Button, IconButton, Input, NominalInput, Select, EmptyState, Badge, Modal } from "../../../components/ui";
import { useDragReorder, getDragRowClass } from "../../../hook/useDragReorder";
import useDirty from "../../../hook/useDirty";
import { showToast } from "../../../lib/toast";

// ─── Komponen Kelompok Kategori Menu ───
const MenuCategorySection = ({
  category,
  menus,
  variantGroups,
  onReorderItem,
  onEdit,
  onDelete,
  formatRupiah,
  categoryDrag,
  isDragEnabled
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const itemDrag = useDragReorder(onReorderItem);

  const isDraggingCat = categoryDrag?.dragId === category;
  const isDropTargetCat = categoryDrag?.overId === category && categoryDrag?.dragId !== null && categoryDrag?.dragId !== category;

  return (
    <div
      ref={categoryDrag?.registerRef(category)}
      className={getDragRowClass(
        isDraggingCat,
        isDropTargetCat,
        "animate-in fade-in slide-in-from-bottom-2 duration-300 rounded-2xl p-2 -mx-2 transition-all duration-300",
        "border border-transparent hover:bg-slate-100/50 dark:hover:bg-slate-900/50"
      )}
    >
      {/* --- Header Kategori --- */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 pb-2 mb-3">
        <div className="flex items-center gap-2">
          {isDragEnabled && (
            <div
              onPointerDown={categoryDrag?.startDrag(category)}
              className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-accent-500 shrink-0 p-1 -ml-1 touch-none transition-colors duration-200"
              title="Tahan & geser untuk mengurutkan kategori"
            >
              <GripVertical className="w-5 h-5" />
            </div>
          )}
          <span className="font-heading text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">{category}</span>
          <Badge variant="neutral">{menus.length} Item</Badge>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 text-slate-400 hover:text-accent-600 dark:hover:text-accent-400 rounded-xl hover:bg-accent-50 dark:hover:bg-accent-500/10 active:scale-90 transition-all duration-300"
          title={isExpanded ? "Tutup Kategori" : "Buka Kategori"}
        >
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {/* --- DAFTAR MENU RINGKAS --- */}
      {isExpanded && (
        <div className="flex flex-col gap-2">
          {menus.map((menu) => {
            const isDragging = itemDrag.dragId === menu.id;
            const isDropTarget = itemDrag.overId === menu.id && itemDrag.dragId !== null && itemDrag.dragId !== menu.id;

            return (
              <div
                key={menu.id}
                ref={itemDrag.registerRef(menu.id)}
                className={getDragRowClass(
                  isDragging,
                  isDropTarget,
                  "group flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-2xl border shadow-sm transition-all duration-300 gap-3 sm:gap-4",
                  "border-slate-100 dark:border-slate-800 hover:border-accent-200 dark:hover:border-accent-500/30 hover:shadow-md"
                )}
              >
                {/* --- Info Kiri: Drag Handle, Nama, HPP, Varian --- */}
                <div className="flex items-start sm:items-center gap-2 flex-1 min-w-0">
                  {isDragEnabled && (
                    <div
                      onPointerDown={itemDrag.startDrag(menu.id)}
                      className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-400 shrink-0 p-1 -ml-1 touch-none"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>
                  )}

                  <div className="flex flex-col flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate mb-0.5">
                      {menu.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-medium">HPP: {formatRupiah(menu.hpp || 0)}</span>
                      {menu.variantGroupIds?.length > 0 && (
                        <>
                          <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0"></span>
                          <span className="truncate">
                            Varian: {menu.variantGroupIds.map(vid => variantGroups.find(v => v.id === vid)?.name).filter(Boolean).join(', ')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* --- Info Kanan: Harga & Tombol Aksi --- */}
                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 border-t border-slate-50 dark:border-slate-800/50 sm:border-0 pt-2 sm:pt-0">
                  <span className="font-bold text-accent-600 dark:text-accent-400 text-sm">
                    {formatRupiah(menu.price)}
                  </span>
                  <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <IconButton variant="edit" onClick={() => onEdit(menu)} title="Edit Menu">
                      <Edit3 className="w-4 h-4" />
                    </IconButton>
                    <IconButton variant="delete" onClick={() => onDelete(menu.id)} title="Hapus Menu">
                      <Trash2 className="w-4 h-4" />
                    </IconButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const MenuListTab = ({ data }) => {
  const { formatRupiah, triggerAlert, triggerConfirm } = useAppContext();
  const {
    menus, variantGroups, categories,
    saveMenu, deleteMenu, reorderMenus,
    setCategoriesPersist, renameMenuCategory, deleteMenuCategory,
  } = data;
  // Aksi tulis ke server bisa gagal (internet putus dll). Tidak ada antrean
  // diam-diam: kalau gagal, user diberi tahu jelas.
  const run = async (fn) => {
    try { await fn(); } catch (e) { triggerAlert(e.message || 'Terjadi kesalahan.'); }
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    id: '', name: '', price: '', hpp: '', category: categories[0] || 'Lainnya', variantGroupIds: []
  });

  // Menutup form yang sudah terisi = konfirmasi buang isian (Modal `dirty`).
  const { dirty, rebase } = useDirty(isEditing, formData);

  const handleSave = () => {
    if (!formData.name || formData.price === '' || formData.price < 0) {
      triggerAlert("Nama dan harga menu harus diisi dengan benar.");
      return;
    }
    const dataToSave = { ...formData, price: Number(formData.price), hpp: Number(formData.hpp || 0) };
    const isNew = !formData.id;
    run(async () => {
      await saveMenu(dataToSave);
      if (isNew) {
        // Menu baru: form tidak menutup sendiri, dikosongkan (kategori dipertahankan) untuk menu berikutnya.
        showToast('Menu ditambahkan');
        setFormData({ id: '', name: '', price: '', hpp: '', category: formData.category, variantGroupIds: [] });
        rebase();
      } else {
        showToast('Menu diperbarui');
        setIsEditing(false);
      }
    });
  };

  const handleDelete = (id) => {
    triggerConfirm("Yakin ingin menghapus menu ini?", () => run(() => deleteMenu(id)));
  };

  // Drag Reorder Menu Item (dalam kategori)
  const handleReorderMenu = (categoryName) => (draggedId, overId) => {
    const categoryIds = menus.filter(m => (m.category || 'Lainnya') === categoryName).map(m => m.id);
    const fromIdx = categoryIds.indexOf(draggedId);
    const toIdx = categoryIds.indexOf(overId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const reordered = [...categoryIds];
    const [movedId] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, movedId);
    run(() => reorderMenus(reordered));
  };

  // Drag Reorder Kategori
  const handleReorderCategory = (draggedCat, overCat) => {
    const list = [...categories];
    const fromIdx = list.indexOf(draggedCat);
    const toIdx = list.indexOf(overCat);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    run(() => setCategoriesPersist(list));
  };
  const categoryDrag = useDragReorder(handleReorderCategory);

  const groupedMenus = useMemo(() => {
    const groups = {};
    menus.forEach(menu => {
      const cat = menu.category || 'Lainnya';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(menu);
    });
    return groups;
  }, [menus]);

  // Urutkan kategori berdasarkan urutan di state 'categories' (mempertahankan hasil drag)
  const sortedCategoryKeys = useMemo(() => {
    const allCats = Object.keys(groupedMenus);
    const orderedCats = categories.filter(c => allCats.includes(c));
    const missingCats = allCats.filter(c => !orderedCats.includes(c));
    return [...orderedCats, ...missingCats];
  }, [categories, groupedMenus]);

  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
      {/* Input Pencarian */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
          <input
            type="text"
            placeholder="Cari nama menu atau kategori..."
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent transition-all duration-300 text-sm"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 active:scale-90 transition-all duration-300"><X className="w-4 h-4" /></button>
          )}
        </div>

        <Button icon={<Plus className="w-4 h-4" />} className="w-full sm:w-auto sm:ml-auto" onClick={() => {
          setFormData({ id: '', name: '', price: '', hpp: '', category: categories[0] || 'Lainnya', variantGroupIds: [] });
          setIsEditing(true);
        }}>Tambah Data Menu</Button>
      </div>

      <div className="space-y-6 pb-10">
        {sortedCategoryKeys
          .filter(category => {
            if (!searchQuery) return true;
            const q = searchQuery.toLowerCase();
            return category.toLowerCase().includes(q) || groupedMenus[category].some(menu => menu.name.toLowerCase().includes(q));
          })
          .map(category => {
            const q = searchQuery.toLowerCase();
            const visibleMenus = (!searchQuery || category.toLowerCase().includes(q))
              ? groupedMenus[category]
              : groupedMenus[category].filter(menu => menu.name.toLowerCase().includes(q));

            return (
              <MenuCategorySection
                key={category}
                category={category}
                menus={visibleMenus}
                variantGroups={variantGroups}
                onReorderItem={handleReorderMenu(category)}
                onEdit={(menu) => { setFormData(menu); setIsEditing(true); }}
                onDelete={handleDelete}
                formatRupiah={formatRupiah}
                categoryDrag={categoryDrag}
                isDragEnabled={!searchQuery} // Nonaktifkan drag & drop saat mencari
              />
            );
          })}
        {menus.length === 0 && (
          <EmptyState icon={<Plus className="w-8 h-8" />} title="Belum ada data menu" description="Tambah menu pertama untuk mulai menerima pesanan" action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setIsEditing(true)}>Tambah Menu Pertama</Button>} />
        )}
      </div>

      <Modal isOpen={isEditing} onClose={() => setIsEditing(false)} dirty={dirty} sheet size="lg" maxHeight title={formData.id ? 'Edit Menu' : 'Tambah Menu Baru'}>
        <div className="p-5 pt-2 space-y-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="space-y-4">
            <Input id="menuName" label="Nama Menu" type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Misal: Lumpia Semarang" />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="menuCategory" className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Kategori</label>
                <Button type="button" size="xs" variant="secondary" onClick={() => setIsCategoryModalOpen(true)} icon={<Settings2 className="w-3 h-3" />}>Kelola Kategori</Button>
              </div>
              <Select id="menuCategory" title="Kategori" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                {categories.map((cat, idx) => <option key={idx} value={cat}>{cat}</option>)}
                {!categories.includes(formData.category) && formData.category && (
                  <option value={formData.category}>{formData.category}</option>
                )}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <NominalInput id="menuPrice" label="Harga Jual" value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="0" />
              <NominalInput id="menuHpp" label="HPP / Modal" value={formData.hpp} onChange={e => setFormData({ ...formData, hpp: e.target.value === '' ? '' : Number(e.target.value) })} placeholder="0" />
            </div>
          </div>
          <div className="space-y-3">
            <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">Varian Terkait</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">Pilih kategori varian yang berlaku untuk menu ini.</p>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
              {variantGroups.length === 0 ? (
                <p className="text-sm italic text-slate-400 dark:text-slate-500">Belum ada grup varian. Tambahkan di tab Varian.</p>
              ) : (
                variantGroups.map(vg => (
                  <label key={vg.id} className={`flex items-center gap-3 p-3 border rounded-2xl cursor-pointer transition-all duration-300 ${formData.variantGroupIds.includes(vg.id) ? 'bg-accent-50 dark:bg-accent-500/10 border-accent-200 dark:border-accent-500/30 shadow-sm' : 'bg-slate-50 dark:bg-slate-950 border-slate-100 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-900'}`}>
                    <input type="checkbox" className="w-5 h-5 accent-[#ea580c] dark:accent-[#f97316] cursor-pointer" checked={formData.variantGroupIds.includes(vg.id)} onChange={() => setFormData(prev => ({ ...prev, variantGroupIds: prev.variantGroupIds.includes(vg.id) ? prev.variantGroupIds.filter(id => id !== vg.id) : [...prev.variantGroupIds, vg.id] }))} />
                    <div className="flex-1">
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{vg.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{vg.options.map(o => o.name).join(', ')}</p>
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>
          <Button onClick={handleSave} size="full">{formData.id ? 'Simpan Perubahan' : 'Tambah Menu'}</Button>
        </div>
      </Modal>

      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title="Kelola Kategori Menu"
        onDeleteFallback="Umum"
        categories={categories}
        setCategories={(next) => run(() => setCategoriesPersist(next))}
        triggerAlert={triggerAlert}
        triggerConfirm={triggerConfirm}
        onRenameAsync={(oldCat, newCat) => {
          run(() => renameMenuCategory(oldCat, newCat));
          if (formData.category === oldCat) setFormData(prev => ({ ...prev, category: newCat }));
        }}
        onDeleteAsync={(deletedCat) => {
          // Item di kategori terhapus dipindah ke 'Umum' (sama seperti A), urut di server
          run(() => deleteMenuCategory(deletedCat));
          if (formData.category === deletedCat) setFormData(prev => ({ ...prev, category: 'Umum' }));
        }}
      />
    </div>
  );
};

export default MenuListTab;
