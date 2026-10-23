import React, { useState } from 'react';
import { X, Plus, Edit3, Trash2, Save, Layers, GripVertical } from 'lucide-react';
import {
    DndContext,
    closestCenter,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
    arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Modal      from './ui/Modal';
import Button     from './ui/Button';
import IconButton from './ui/IconButton';
import EmptyState from './ui/EmptyState';

/**
 * Modal generic untuk kelola daftar kategori (tambah/edit/hapus/urutkan via drag).
 *
 * Props:
 * - isOpen, onClose
 * - title: string
 * - categories: string[]
 * - setCategories: (string[]) => void
 * - onRename(oldName, newName): callback setelah rename (opsional)
 * - onDelete(deletedName): callback setelah hapus (opsional)
 * - onDeleteFallback: string — nama kategori pengganti di teks konfirmasi
 * - triggerAlert, triggerConfirm: dari useAppContext
 */

// ── Sortable item ─────────────────────────────────────────────────────────────
// Dipisah jadi komponen sendiri karena useSortable harus dipanggil di level item,
// bukan di loop induk.
function SortableCategoryItem({
    cat, idx,
    editIndex, editValue, setEditValue,
    startEdit, saveEdit, handleDelete, setEditIndex, canDelete,
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: cat });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <li
            ref={setNodeRef}
            style={style}
            className={`flex items-center p-3 transition-colors
                border-b border-slate-100 dark:border-slate-800 last:border-0
                ${isDragging
                    ? 'bg-accent-50 dark:bg-accent-950/20 shadow-lg relative z-10 rounded-xl opacity-90'
                    : 'hover:bg-white dark:hover:bg-slate-900'
                }`}
        >
            {editIndex === idx ? (
                // Mode edit inline — border biru intentional (bukan orange)
                // karena ini edit state, bukan input form biasa
                <div className="flex flex-1 gap-2 mr-2 animate-in fade-in">
                    <input
                        type="text"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && saveEdit(cat, idx)}
                        className="flex-1 p-2 bg-white dark:bg-slate-900 border border-blue-300 dark:border-blue-500/40 rounded-lg outline-none focus:border-blue-500 dark:focus:border-blue-400 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-sm transition-colors"
                        autoFocus
                    />
                    <IconButton variant="success" onClick={() => saveEdit(cat, idx)}>
                        <Save className="w-4 h-4" />
                    </IconButton>
                    <IconButton variant="neutral" onClick={() => setEditIndex(-1)}>
                        <X className="w-4 h-4" />
                    </IconButton>
                </div>
            ) : (
                <>
                    {/* Drag handle — listeners hanya di sini, bukan seluruh item,
                        supaya tombol Edit/Hapus tetap bisa diklik normal */}
                    <span
                        {...attributes}
                        {...listeners}
                        className="mr-2 shrink-0 text-slate-300 dark:text-slate-600 cursor-grab active:cursor-grabbing touch-none"
                    >
                        <GripVertical className="w-4 h-4" />
                    </span>
                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate flex-1 mr-2">
                        {cat}
                    </span>
                    <div className="flex gap-1 shrink-0">
                        <IconButton variant="edit" onClick={() => startEdit(cat, idx)}>
                            <Edit3 className="w-4 h-4" />
                        </IconButton>
                        {canDelete && (
                            <IconButton variant="delete" onClick={() => handleDelete(cat, idx)}>
                                <Trash2 className="w-4 h-4" />
                            </IconButton>
                        )}
                    </div>
                </>
            )}
        </li>
    );
}

// ── Main modal ────────────────────────────────────────────────────────────────
const CategoryModal = ({
    isOpen, onClose, title = 'Kelola Kategori',
    categories = [], setCategories,
    onRename, onDelete, onDeleteFallback = 'Uncategorized',
    onDeleteAsync, // opsional (C): hapus kategori + pindahkan item secara BERURUTAN di server
    deleteMessage, // opsional (C): (cat) => string, ganti teks konfirmasi hapus bawaan
    onRenameAsync, // opsional (C): rename = UPDATE nama di baris yang sama (bukan hapus+tambah)
    triggerAlert, triggerConfirm,
    canDelete = true, // false = tombol hapus kategori disembunyikan (mis. staf di Manajemen Menu)
}) => {
    const [newCat, setNewCat]       = useState('');
    const [editIndex, setEditIndex] = useState(-1);
    const [editValue, setEditValue] = useState('');

    // TouchSensor penting untuk Android via Capacitor.
    // delay 150ms + tolerance 5px supaya scroll vertikal modal tetap jalan normal.
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
    );

    // ── Handlers ────────────────────────────────────────────────────────────
    const handleAdd = () => {
        if (!newCat.trim()) return;
        if (categories.some(c => c.toLowerCase() === newCat.trim().toLowerCase())) {
            return triggerAlert?.('Kategori sudah ada!');
        }
        setCategories([...categories, newCat.trim()]);
        setNewCat('');
    };

    const handleDelete = (cat, idx) => {
        triggerConfirm?.(
            deleteMessage ? deleteMessage(cat) : `Yakin ingin menghapus kategori "${cat}"? Item yang menggunakan kategori ini akan masuk ke "${onDeleteFallback}".`,
            () => {
                // Jalur C: satu operasi server berurutan (pindahkan item -> hapus kategori).
                // Menjalankan setCategories & onDelete bersamaan akan balapan.
                if (onDeleteAsync) { onDeleteAsync(cat); return; }
                setCategories(categories.filter((_, i) => i !== idx));
                onDelete?.(cat);
            }
        );
    };

    const startEdit = (cat, idx) => { setEditIndex(idx); setEditValue(cat); };

    const saveEdit = (oldCat, idx) => {
        if (!editValue.trim() || editValue === oldCat) return setEditIndex(-1);
        if (categories.some((c, i) => i !== idx && c.toLowerCase() === editValue.trim().toLowerCase())) {
            return triggerAlert?.('Nama kategori sudah digunakan!');
        }
        const next    = [...categories];
        const trimmed = editValue.trim();
        next[idx]     = trimmed;
        if (onRenameAsync) {
            // Jalur C: satu UPDATE nama di server. Memanggil setCategories(next)
            // juga akan dibaca sebagai "hapus nama lama + tambah nama baru".
            onRenameAsync(oldCat, trimmed);
            setEditIndex(-1);
            return;
        }
        setCategories(next);
        onRename?.(oldCat, trimmed);
        setEditIndex(-1);
    };

    // categories adalah string[] tanpa duplicate → aman dipakai sebagai drag ID
    const handleDragEnd = ({ active, over }) => {
        if (!over || active.id === over.id) return;
        const oldIndex = categories.indexOf(active.id);
        const newIndex = categories.indexOf(over.id);
        setCategories(arrayMove(categories, oldIndex, newIndex));
    };

    // ── Render ───────────────────────────────────────────────────────────────
    return (
        <Modal isOpen={isOpen} onClose={onClose} size="md" zLevel="modal" maxHeight>

            {/* Header */}
            <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 px-6 pt-6 pb-4 mb-5 shrink-0">
                <h3 className="font-heading font-bold text-slate-800 dark:text-slate-100 text-lg flex items-center gap-2">
                    <Layers className="w-5 h-5 text-accent-500 dark:text-accent-400" />
                    {title}
                </h3>
                <button
                    onClick={onClose}
                    className="p-2 bg-slate-100 dark:bg-slate-800 rounded-full text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            {/* Form tambah kategori */}
            <div className="flex gap-2 px-6 mb-5 shrink-0">
                <input
                    type="text"
                    value={newCat}
                    onChange={e => setNewCat(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                    placeholder="Tambah kategori baru..."
                    className="flex-1 p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-orange-500 dark:focus:border-orange-500 text-sm font-bold text-slate-700 dark:text-slate-200 transition-colors"
                />
                <Button icon={<Plus className="w-4 h-4" />} onClick={handleAdd}>
                    Tambah
                </Button>
            </div>

            {/* Daftar kategori */}
            <div className="mx-6 mb-6 overflow-y-auto flex-1 border border-slate-100 dark:border-slate-800 rounded-2xl bg-slate-50 dark:bg-slate-950 min-h-[200px]">
                {categories.length === 0 ? (
                    <EmptyState
                        size="sm"
                        icon={<Layers className="w-8 h-8" />}
                        title="Belum ada kategori terdaftar."
                    />
                ) : (
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext items={categories} strategy={verticalListSortingStrategy}>
                            <ul>
                                {categories.map((cat, idx) => (
                                    <SortableCategoryItem
                                        key={cat}
                                        cat={cat}
                                        idx={idx}
                                        editIndex={editIndex}
                                        editValue={editValue}
                                        setEditValue={setEditValue}
                                        startEdit={startEdit}
                                        saveEdit={saveEdit}
                                        handleDelete={handleDelete}
                                        setEditIndex={setEditIndex}
                                        canDelete={canDelete}
                                    />
                                ))}
                            </ul>
                        </SortableContext>
                    </DndContext>
                )}
            </div>

        </Modal>
    );
};

export default CategoryModal;