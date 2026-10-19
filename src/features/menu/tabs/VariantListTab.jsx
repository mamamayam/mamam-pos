import React, { useState, useMemo, useEffect } from "react";
import { useAppContext } from "../../../context/AppContext";
import { Plus, Edit3, Trash2, Settings2, Trash, GripVertical, ChevronDown, ChevronUp } from "lucide-react";
import CategoryModal from "../../../components/CategoryModal";
import { Button, IconButton, Input, NominalInput, Select, EmptyState, Badge, Modal } from "../../../components/ui";
import { useDragReorder, getDragRowClass } from "../../../hook/useDragReorder";
import useDirty from "../../../hook/useDirty";
import { showToast } from "../../../lib/toast";

// ─── Komponen Kelompok Kategori Varian ───
const VariantCategorySection = ({ category, groups, onReorder, onEdit, onDelete, categoryDrag }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const itemDrag = useDragReorder(onReorder);

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
          <div
            onPointerDown={categoryDrag?.startDrag(category)}
            className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-accent-500 shrink-0 p-1 -ml-1 touch-none transition-colors duration-200"
            title="Tahan & geser untuk mengurutkan kategori"
          >
            <GripVertical className="w-5 h-5" />
          </div>
          <span className="font-heading text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">{category}</span>
          <Badge variant="neutral">{groups.length} Grup</Badge>
        </div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-accent-50 dark:hover:bg-accent-500/10 hover:text-accent-600 dark:hover:text-accent-400 active:scale-90 transition-all duration-300"
          title={isExpanded ? "Tutup Kategori" : "Buka Kategori"}
        >
          {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
        </button>
      </div>

      {/* --- DAFTAR GRUP VARIAN --- */}
      {isExpanded && (
        <div className="flex flex-col gap-2">
          {groups.map((vg) => {
            const isDragging = itemDrag.dragId === vg.id;
            const isDropTarget = itemDrag.overId === vg.id && itemDrag.dragId !== null && itemDrag.dragId !== vg.id;
            return (
              <div
                key={vg.id}
                ref={itemDrag.registerRef(vg.id)}
                className={getDragRowClass(
                  isDragging,
                  isDropTarget,
                  "group flex flex-col sm:flex-row sm:items-center justify-between bg-white dark:bg-slate-900 p-2.5 sm:p-3 rounded-2xl border shadow-sm transition-all duration-300 gap-3 sm:gap-4",
                  "border-slate-100 dark:border-slate-800 hover:border-accent-200 dark:hover:border-accent-500/30 hover:shadow-md"
                )}
              >
                {/* --- Drag handle + Info Kiri --- */}
                <div className="flex items-start sm:items-center gap-2 flex-1 min-w-0">
                  <div
                    onPointerDown={itemDrag.startDrag(vg.id)}
                    className="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-400 shrink-0 p-1 -ml-1 touch-none"
                  >
                    <GripVertical className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">{vg.name}</h3>
                      <Badge variant={vg.isRequired ? 'danger' : 'neutral'}>{vg.isRequired ? 'Wajib' : 'Opsional'}</Badge>
                      <Badge variant="orange">Max: {vg.maxSelection} Pilihan</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-slate-400">Opsi:</span>
                      {vg.options?.map((opt, oIdx) => (
                        <span key={opt.id || oIdx} className="bg-slate-50 dark:bg-slate-950 border border-slate-100 dark:border-slate-800/80 px-1.5 py-0.5 rounded font-medium text-slate-600 dark:text-slate-300">
                          {opt.name} {opt.extraPrice > 0 && `(+${opt.extraPrice})`}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* --- Info Kanan: Tombol Aksi --- */}
                <div className="flex items-center justify-end gap-1 shrink-0 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity duration-300 border-t border-slate-50 dark:border-slate-800/50 sm:border-0 pt-2 sm:pt-0">
                  <IconButton variant="edit" onClick={() => onEdit(vg)} title="Edit Grup Varian"><Edit3 className="w-4 h-4" /></IconButton>
                  <IconButton variant="delete" onClick={() => onDelete(vg.id)} title="Hapus Grup Varian"><Trash2 className="w-4 h-4" /></IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const VariantListTab = ({ data }) => {
  const { formatRupiah, triggerAlert, triggerConfirm } = useAppContext();
  const {
    variantGroups, variantCategories,
    saveVariantGroup, deleteVariantGroup, reorderVariantGroups,
    setVariantCategoriesPersist, renameVariantCategory, deleteVariantCategory,
  } = data;
  // Aksi tulis ke server bisa gagal: kasih tahu user, tanpa antrean diam-diam.
  const run = async (fn) => {
    try { await fn(); } catch (e) { triggerAlert(e.message || 'Terjadi kesalahan.'); }
  };

  const [isEditing, setIsEditing] = useState(false);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    id: '', name: '', category: variantCategories?.[0] || 'Lainnya',
    isRequired: false, maxSelection: 1, options: []
  });
  const [newOption, setNewOption] = useState({ name: '', extraPrice: '' });
  const [editingOptionId, setEditingOptionId] = useState(null);
  // Menutup form yang sudah terisi = konfirmasi buang isian (Modal `dirty`). Baris opsi yang sedang diketik ikut dihitung.
  const { dirty, rebase } = useDirty(isEditing, [formData, newOption]);

  const handleSave = () => {
    if ((formData.options ?? []).length === 0) {
      triggerAlert("Tambahkan minimal 1 opsi varian.");
      return;
    }
    if (!formData.name) {
      triggerAlert("Nama grup varian harus diisi.");
      return;
    }
    const isNew = !formData.id;
    run(async () => {
      await saveVariantGroup(formData);
      if (isNew) {
        // Grup baru: form tidak menutup sendiri, dikosongkan (kategori dipertahankan) untuk grup berikutnya.
        showToast('Grup varian ditambahkan');
        setFormData({ id: '', name: '', category: formData.category, isRequired: false, maxSelection: 1, options: [] });
        setNewOption({ name: '', extraPrice: '' }); setEditingOptionId(null);
        rebase();
      } else {
        showToast('Grup varian diperbarui');
        setIsEditing(false);
      }
    });
  };

  const handleDelete = (id) => {
    // Koneksi ke menu (menu_item_variant_groups) ikut terhapus otomatis oleh
    // ON DELETE CASCADE — setara dengan membersihkan variantGroupIds di A.
    triggerConfirm("Yakin ingin menghapus grup varian ini?", () => run(() => deleteVariantGroup(id)));
  };

  const handleSaveOption = () => {
    if (!newOption.name || newOption.extraPrice === '') return triggerAlert("Nama opsi dan harga tambahan harus diisi.");
    if (editingOptionId) {
      setFormData(prev => ({
        ...prev,
        options: (prev.options ?? []).map(o => o.id === editingOptionId
          ? { ...o, name: newOption.name, extraPrice: Number(newOption.extraPrice) }
          : o)
      }));
      setEditingOptionId(null);
    } else {
      const opt = { id: `opt${Date.now()}`, name: newOption.name, extraPrice: Number(newOption.extraPrice) };
      setFormData(prev => ({ ...prev, options: [...(prev.options ?? []), opt] }));
    }
    setNewOption({ name: '', extraPrice: '' });
  };

  const handleEditOption = (opt) => {
    setEditingOptionId(opt.id);
    setNewOption({ name: opt.name, extraPrice: String(opt.extraPrice) });
  };

  const handleCancelEditOption = () => {
    setEditingOptionId(null);
    setNewOption({ name: '', extraPrice: '' });
  };

  const handleRemoveOption = (optId) => {
    setFormData(prev => ({ ...prev, options: (prev.options ?? []).filter(o => o.id !== optId) }));
    if (editingOptionId === optId) handleCancelEditOption();
  };

  // Drag Reorder Group (dalam kategori)
  const handleReorderGroup = (categoryName) => (draggedId, overId) => {
    const list = variantGroups ?? [];
    const categoryIds = list.filter(vg => (vg.category || 'Lainnya') === categoryName).map(vg => vg.id);
    const fromIdx = categoryIds.indexOf(draggedId);
    const toIdx = categoryIds.indexOf(overId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const reordered = [...categoryIds];
    const [movedId] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, movedId);
    run(() => reorderVariantGroups(reordered));
  };

  // Drag Reorder Kategori Varian
  const handleReorderCategory = (draggedCat, overCat) => {
    const list = [...(variantCategories || [])];
    const fromIdx = list.indexOf(draggedCat);
    const toIdx = list.indexOf(overCat);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    const [moved] = list.splice(fromIdx, 1);
    list.splice(toIdx, 0, moved);
    run(() => setVariantCategoriesPersist(list));
  };
  const categoryDrag = useDragReorder(handleReorderCategory);

  const handleReorderOption = (draggedId, overId) => {
    setFormData(prev => {
      const options = prev.options ?? [];
      const fromIdx = options.findIndex(o => o.id === draggedId);
      const toIdx = options.findIndex(o => o.id === overId);
      if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return prev;
      const reordered = [...options];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      return { ...prev, options: reordered };
    });
  };
  const optionsDrag = useDragReorder(handleReorderOption);

  const groupedVariantGroups = useMemo(() => {
    const groups = {};
    (variantGroups ?? []).forEach(vg => {
      const cat = vg.category || 'Lainnya';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(vg);
    });
    return groups;
  }, [variantGroups]);

  const sortedCategoryKeys = useMemo(() => {
    const allCats = Object.keys(groupedVariantGroups);
    const orderedCats = (variantCategories || []).filter(c => allCats.includes(c));
    const missingCats = allCats.filter(c => !orderedCats.includes(c));
    return [...orderedCats, ...missingCats];
  }, [variantCategories, groupedVariantGroups]);

  return (
    <div className="p-4 md:p-6 bg-slate-50 dark:bg-slate-950 flex-1 flex flex-col h-full overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
      <div className="flex justify-end mb-6">
        <Button icon={<Plus className="w-4 h-4" />} className="w-full sm:w-auto" onClick={() => {
          setFormData({ id: '', name: '', category: variantCategories?.[0] || 'Lainnya', isRequired: false, maxSelection: 1, options: [] });
          setIsEditing(true);
        }}>Tambah Grup Varian</Button>
      </div>
      <div className="space-y-6 pb-10">
        {sortedCategoryKeys.map(category => (
          <VariantCategorySection
            key={category}
            category={category}
            groups={groupedVariantGroups[category]}
            onReorder={handleReorderGroup(category)}
            onEdit={(vg) => { setFormData({ ...vg, options: vg.options ?? [] }); setIsEditing(true); }}
            onDelete={handleDelete}
            categoryDrag={categoryDrag}
          />
        ))}
        {(variantGroups ?? []).length === 0 && (
          <EmptyState icon={<Plus className="w-8 h-8" />} title="Belum ada data grup varian" action={<Button icon={<Plus className="w-4 h-4" />} onClick={() => setIsEditing(true)}>Tambah Grup Varian</Button>} />
        )}
      </div>

      <Modal isOpen={isEditing} onClose={() => setIsEditing(false)} dirty={dirty} sheet size="lg" maxHeight title={formData.id ? 'Edit Grup Varian' : 'Tambah Grup Varian Baru'}>
        <div className="p-5 pt-2 space-y-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="space-y-4">
            <Input id="vgName" label="Nama Grup Varian" type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Misal: Level Pedas, Topping" />
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="vgCategory" className="text-xs font-bold text-slate-500 uppercase">Kategori Varian</label>
                <Button type="button" size="xs" variant="secondary" onClick={() => setIsCategoryModalOpen(true)} icon={<Settings2 className="w-3 h-3" />}>Kelola Kategori</Button>
              </div>
              <Select id="vgCategory" title="Kategori Varian" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value })}>
                {(variantCategories ?? []).map((cat, idx) => <option key={idx} value={cat}>{cat}</option>)}
                {!(variantCategories ?? []).includes(formData.category) && formData.category && (
                  <option value={formData.category}>{formData.category}</option>
                )}
              </Select>
            </div>
            <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="w-5 h-5 accent-[#ea580c] dark:accent-[#f97316] cursor-pointer" checked={formData.isRequired} onChange={e => setFormData({ ...formData, isRequired: e.target.checked })} />
                <div>
                  <p className="font-bold text-sm text-slate-800 dark:text-slate-100">Wajib Dipilih</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pelanggan harus memilih minimal satu opsi.</p>
                </div>
              </label>
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <label htmlFor="maxSel" className="block text-xs font-bold text-slate-500 uppercase mb-1">Maksimal Jumlah Pilihan Opsi</label>
                <NominalInput bare id="maxSel" title="Maksimal Jumlah Pilihan Opsi" prefix={null} calculator={false} className="w-24 p-2 border border-slate-200 bg-white text-slate-800 rounded-lg text-sm font-bold text-left" value={formData.maxSelection} onChange={e => setFormData({ ...formData, maxSelection: Number(e.target.value) || 1 })} />
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100 border-b border-slate-100 dark:border-slate-800 pb-2">Opsi Pilihan Varian</h3>
            <div className={`flex gap-2 items-end p-3 rounded-xl border transition-colors ${editingOptionId ? 'bg-accent-50 dark:bg-accent-500/10 border-accent-200 dark:border-accent-500/30' : 'bg-slate-50 dark:bg-slate-950 border-slate-100 dark:border-slate-800'}`}>
              <div className="flex-1 min-w-0">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nama Opsi</label>
                <input type="text" placeholder="Misal: Mozzarella" className="w-full p-2 text-xs border border-slate-200 rounded-lg" value={newOption.name} onChange={e => setNewOption({ ...newOption, name: e.target.value })} />
              </div>
              <div className="w-28">
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Harga + (Rp)</label>
                <NominalInput bare title="Harga Tambahan Opsi" placeholder="0" className="w-full p-2 text-xs border border-slate-200 rounded-lg text-left" value={newOption.extraPrice} onChange={e => setNewOption({ ...newOption, extraPrice: e.target.value })} />
              </div>
              {editingOptionId && (
                <Button size="sm" variant="secondary" onClick={handleCancelEditOption} className="shrink-0 h-9">Batal</Button>
              )}
              <Button size="sm" icon={editingOptionId ? <Edit3 className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />} onClick={handleSaveOption} className="shrink-0 h-9">
                {editingOptionId ? 'Simpan' : 'Tambah'}
              </Button>
            </div>
            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
              {(formData.options ?? []).length === 0 ? (
                <EmptyState size="sm" title="Belum ada opsi pilihan dimasukkan." />
              ) : (
                (formData.options ?? []).map((opt) => {
                  const isDragging = optionsDrag.dragId === opt.id;
                  const isDropTarget = optionsDrag.overId === opt.id && optionsDrag.dragId !== null && optionsDrag.dragId !== opt.id;
                  const isBeingEdited = editingOptionId === opt.id;
                  return (
                    <div key={opt.id} ref={optionsDrag.registerRef(opt.id)} className={getDragRowClass(isDragging, isDropTarget, `flex justify-between items-center p-2.5 bg-white dark:bg-slate-900 border rounded-2xl shadow-sm transition-all duration-300 ${isBeingEdited ? 'border-accent-400 ring-1 ring-accent-300 bg-accent-50/60 dark:bg-accent-500/10' : ''}`, "border-slate-100 dark:border-slate-800")}>
                      <div className="flex items-center gap-2 min-w-0">
                        <div onPointerDown={optionsDrag.startDrag(opt.id)} className="cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-400 shrink-0 p-1 touch-none">
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-bold text-slate-800 truncate">{opt.name}</span>
                          <span className="text-xs text-slate-500">+{formatRupiah(opt.extraPrice)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <IconButton variant="edit" size="sm" onClick={() => handleEditOption(opt)}><Edit3 className="w-4 h-4" /></IconButton>
                        <IconButton variant="delete" size="sm" onClick={() => handleRemoveOption(opt.id)}><Trash className="w-4 h-4" /></IconButton>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
          <Button onClick={handleSave} size="full">{formData.id ? 'Simpan Perubahan' : 'Simpan Grup Varian'}</Button>
        </div>
      </Modal>

      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
        title="Kelola Kategori Varian"
        categories={variantCategories}
        setCategories={(next) => run(() => setVariantCategoriesPersist(next))}
        triggerAlert={triggerAlert}
        triggerConfirm={triggerConfirm}
        onDeleteFallback="Lainnya"
        onRenameAsync={(oldCat, newCat) => {
          run(() => renameVariantCategory(oldCat, newCat));
          if (formData.category === oldCat) setFormData(prev => ({ ...prev, category: newCat }));
        }}
        onDeleteAsync={(deletedCat) => {
          run(() => deleteVariantCategory(deletedCat));
          if (formData.category === deletedCat) setFormData(prev => ({ ...prev, category: 'Lainnya' }));
        }}
      />
    </div>
  );
};

export default VariantListTab;
