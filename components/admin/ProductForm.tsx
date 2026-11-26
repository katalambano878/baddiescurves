'use client';

import Link from 'next/link';
import { useState, useEffect, useRef } from 'react';
import { money } from '@/lib/format-money';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

interface ProductFormProps {
    initialData?: any;
    isEditMode?: boolean;
}

const PRODUCT_STATUSES = ['active', 'draft', 'archived'];

const slugify = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

/** A form or database value as a number; blank, missing or unreadable gives null. */
const numOrNull = (value: any): number | null => {
    if (value === '' || value === null || value === undefined) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
};

/** Turns the database's wording for a clash into something the admin can act on. */
const plainSaveMessage = (message: string) => {
    if (/products_slug_key/.test(message)) {
        return 'Another product already uses this URL slug. Change the slug on the SEO tab and save again.';
    }
    if (/products_sku_key/.test(message)) {
        return 'Another product already uses this SKU. Click the refresh button next to the SKU (Pricing & Inventory tab) and save again.';
    }
    if (/product_variants_sku_key/.test(message)) {
        return 'Two variants have the same SKU. Each variant needs its own SKU.';
    }
    return message;
};

export default function ProductForm({ initialData, isEditMode = false }: ProductFormProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [categories, setCategories] = useState<any[]>([]);

    // What is wrong with the form (shown at the top and next to the field) and
    // what went wrong while saving.
    const [formErrors, setFormErrors] = useState<Record<string, string>>({});
    const [saveError, setSaveError] = useState('');
    const clearFormError = (field: string) => {
        setFormErrors((prev) => {
            if (!prev[field]) return prev;
            const next = { ...prev };
            delete next[field];
            return next;
        });
    };

    // The product being saved. Set after a new product is created, so that saving
    // again after a failed step updates that product instead of creating a second one.
    const savedProductIdRef = useRef<string | null>(initialData?.id || null);

    const [productName, setProductName] = useState(initialData?.name || '');
    const [categoryId, setCategoryId] = useState(initialData?.category_id || '');
    const [price, setPrice] = useState(initialData?.price || '');
    const [comparePrice, setComparePrice] = useState(initialData?.compare_at_price || '');
    const [priceGhs, setPriceGhs] = useState(initialData?.price_ghs || '');
    const [comparePriceGhs, setComparePriceGhs] = useState(initialData?.compare_at_price_ghs || '');
    const [sku, setSku] = useState(initialData?.sku || '');
    const [stock, setStock] = useState(initialData?.quantity || '');
    const [moq, setMoq] = useState(initialData?.moq || '1');
    const [lowStockThreshold, setLowStockThreshold] = useState(initialData?.metadata?.low_stock_threshold || '5');
    const [description, setDescription] = useState(initialData?.description || '');
    // Holds the real database value: 'active', 'draft' or 'archived'.
    const [status, setStatus] = useState<string>(() => {
        const saved = String(initialData?.status || 'active').toLowerCase();
        return PRODUCT_STATUSES.includes(saved) ? saved : 'active';
    });
    const [featured, setFeatured] = useState(initialData?.featured || false);
    const [preorderShipping, setPreorderShipping] = useState(initialData?.metadata?.preorder_shipping || '');
    const [activeTab, setActiveTab] = useState('general');

    // Auto-generate SKU function
    const generateSku = () => {
        const prefix = 'ST'; // Store identifier prefix
        const timestamp = Date.now().toString(36).toUpperCase().slice(-4);
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `${prefix}-${timestamp}-${random}`;
    };

    // --- Variant System ---
    // Preset color palette
    const colorPresets = [
        { name: 'Black', hex: '#000000' },
        { name: 'White', hex: '#FFFFFF' },
        { name: 'Red', hex: '#EF4444' },
        { name: 'Blue', hex: '#3B82F6' },
        { name: 'Navy', hex: '#1E3A5F' },
        { name: 'Green', hex: '#22C55E' },
        { name: 'Yellow', hex: '#EAB308' },
        { name: 'Pink', hex: '#EC4899' },
        { name: 'Purple', hex: '#A855F7' },
        { name: 'Orange', hex: '#F97316' },
        { name: 'Gray', hex: '#6B7280' },
        { name: 'Brown', hex: '#92400E' },
        { name: 'Beige', hex: '#D2B48C' },
        { name: 'Maroon', hex: '#800000' },
        { name: 'Teal', hex: '#14B8A6' },
        { name: 'Cream', hex: '#FFFDD0' },
        { name: 'Gold', hex: '#D4AF37' },
        { name: 'Silver', hex: '#C0C0C0' },
    ];
    const sizePresets = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

    // Parse existing variants to extract unique colors and sizes
    const savedVariants: any[] = initialData?.product_variants || [];
    const variantColor = (v: any): string => v.color ?? v.option2 ?? '';
    // A colour-only variant is saved with name = colour and no size (option1).
    // Older saves also wrote the colour into option1; that still counts as
    // colour-only when every variant of the product looks that way.
    const everyNameIsItsColor = savedVariants.length > 0 &&
        savedVariants.every((v: any) => !!variantColor(v) && v.name === variantColor(v));
    const existingVariants = savedVariants.map((v: any) => {
        const color = variantColor(v);
        const colorOnly = !!color && v.name === color &&
            (!v.option1 || (v.option1 === color && everyNameIsItsColor));
        return {
            ...v,
            stock: v.stock ?? v.quantity ?? 0,
            color,
            size: colorOnly ? '' : (v.name || '')
        };
    });

    const [selectedColors, setSelectedColors] = useState<{ name: string; hex: string }[]>(() => {
        const colors = new Map<string, string>();
        existingVariants.forEach((v: any) => {
            if (v.color) {
                // The colour the admin saved wins over the preset list, so custom colours keep their swatch.
                const savedHex = typeof v.metadata?.color_hex === 'string' ? v.metadata.color_hex : '';
                const preset = colorPresets.find(c => c.name.toLowerCase() === v.color.toLowerCase());
                if (!colors.has(v.color) || savedHex) {
                    colors.set(v.color, savedHex || colors.get(v.color) || preset?.hex || '#888888');
                }
            }
        });
        return Array.from(colors.entries()).map(([name, hex]) => ({ name, hex }));
    });

    const [selectedSizes, setSelectedSizes] = useState<string[]>(() => {
        const sizes = new Set<string>();
        existingVariants.forEach((v: any) => {
            if (v.size) sizes.add(v.size);
        });
        return Array.from(sizes);
    });

    const [customColorName, setCustomColorName] = useState('');
    const [customColorHex, setCustomColorHex] = useState('#888888');
    const [customSize, setCustomSize] = useState('');

    // Build variants from colors × sizes (or just sizes, or just colors)
    const buildVariantKey = (color: string, size: string) => `${color}|||${size}`;

    // The variants as they are saved right now, with their ids. Saving compares the
    // form against this list so a variant keeps its id (carts and past orders point at it).
    const variantBaselineRef = useRef<{ key: string; row: any }[]>(
        existingVariants.map((v: any) => ({ key: buildVariantKey(v.color || '', v.size || ''), row: v }))
    );

    // Store variant data (price, stock) in a map keyed by "color|||size"
    const [variantData, setVariantData] = useState<Record<string, { price: string; stock: string; sku: string; price_ghs: string }>>(() => {
        const data: Record<string, { price: string; stock: string; sku: string; price_ghs: string }> = {};
        existingVariants.forEach((v: any) => {
            const key = buildVariantKey(v.color || '', v.size || '');
            data[key] = {
                price: v.price?.toString() || '',
                stock: v.stock?.toString() || '0',
                sku: v.sku || '',
                price_ghs: v.price_ghs?.toString() || ''
            };
        });
        return data;
    });

    // Computed: all variant combinations
    const variantCombinations = (() => {
        const combos: { color: string; colorHex: string; size: string; key: string }[] = [];
        const colors = selectedColors.length > 0 ? selectedColors : [{ name: '', hex: '' }];
        const sizes = selectedSizes.length > 0 ? selectedSizes : [''];

        for (const color of colors) {
            for (const size of sizes) {
                if (!color.name && !size) continue; // skip if both empty
                const key = buildVariantKey(color.name, size);
                combos.push({ color: color.name, colorHex: color.hex, size, key });
            }
        }
        return combos;
    })();

    // Build the flat variants array for saving (used by handleSubmit)
    const variants = variantCombinations.map(combo => {
        const d = variantData[combo.key] || { price: price, stock: '0', sku: '', price_ghs: '' };
        return {
            key: combo.key,
            name: combo.size,
            color: combo.color,
            sku: d.sku,
            price: d.price || price,
            stock: d.stock || '0',
            price_ghs: d.price_ghs || ''
        };
    });

    const defaultVariantRow = { price: price, stock: '0', sku: '', price_ghs: '' };

    const updateVariantField = (key: string, field: string, value: string) => {
        setVariantData(prev => ({
            ...prev,
            [key]: { ...prev[key] || defaultVariantRow, [field]: value }
        }));
    };

    const bulkSetField = (field: 'price' | 'stock' | 'price_ghs', value: string) => {
        setVariantData(prev => {
            const updated = { ...prev };
            variantCombinations.forEach(combo => {
                updated[combo.key] = { ...updated[combo.key] || defaultVariantRow, [field]: value };
            });
            return updated;
        });
    };

    const toggleColor = (color: { name: string; hex: string }) => {
        setSelectedColors(prev => {
            const exists = prev.find(c => c.name === color.name);
            if (exists) return prev.filter(c => c.name !== color.name);
            return [...prev, color];
        });
    };

    const toggleSize = (size: string) => {
        setSelectedSizes(prev => {
            if (prev.includes(size)) return prev.filter(s => s !== size);
            return [...prev, size];
        });
    };

    const addCustomColor = () => {
        if (!customColorName.trim()) return;
        const exists = selectedColors.find(c => c.name.toLowerCase() === customColorName.trim().toLowerCase());
        if (!exists) {
            setSelectedColors(prev => [...prev, { name: customColorName.trim(), hex: customColorHex }]);
        }
        setCustomColorName('');
        setCustomColorHex('#888888');
    };

    const addCustomSize = () => {
        if (!customSize.trim()) return;
        if (!selectedSizes.includes(customSize.trim())) {
            setSelectedSizes(prev => [...prev, customSize.trim()]);
        }
        setCustomSize('');
    };

    // Images
    const [images, setImages] = useState<any[]>(initialData?.product_images || []);
    const [uploading, setUploading] = useState(false);
    // The image rows as they are saved right now, to tell whether the list changed.
    const imageBaselineRef = useRef<any[]>(initialData?.product_images || []);

    // SEO
    const [seoTitle, setSeoTitle] = useState(initialData?.seo_title || '');
    const [metaDescription, setMetaDescription] = useState(initialData?.seo_description || '');
    const [urlSlug, setUrlSlug] = useState(initialData?.slug || '');
    // The slug follows the name until the admin types in the slug field. A saved
    // product's slug counts as typed, so its URL does not change by itself.
    const [slugEdited, setSlugEdited] = useState<boolean>(isEditMode && !!initialData?.slug);
    const [keywords, setKeywords] = useState(initialData?.tags?.join(', ') || '');

    const tabs = [
        { id: 'general', label: 'General', icon: 'ri-information-line' },
        { id: 'pricing', label: 'Pricing & Inventory', icon: 'ri-price-tag-3-line' },
        { id: 'variants', label: 'Variants', icon: 'ri-layout-grid-line' },
        { id: 'images', label: 'Images', icon: 'ri-image-line' },
        { id: 'seo', label: 'SEO', icon: 'ri-search-line' }
    ];

    // Fetch categories on mount
    useEffect(() => {
        async function fetchCategories() {
            const { data } = await supabase.from('categories').select('id, name').eq('status', 'active');
            if (data) {
                setCategories(data);
                if (data.length > 0 && !categoryId) {
                    setCategoryId(data[0].id);
                }
            }
        }
        fetchCategories();
    }, [categoryId]);

    // Keep the slug following the name until the slug field is edited by hand
    useEffect(() => {
        if (!slugEdited) {
            setUrlSlug(slugify(productName));
        }
    }, [productName, slugEdited]);

    // Auto-generate SKU for new products
    useEffect(() => {
        if (!isEditMode && !sku) {
            setSku(generateSku());
        }
    }, [isEditMode]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        try {
            if (!e.target.files || e.target.files.length === 0) return;

            setUploading(true);
            const file = e.target.files[0];
            const fileExt = file.name.split('.').pop();
            const fileName = `${Math.random()}.${fileExt}`;
            const filePath = `${fileName}`;

            const { error: uploadError } = await supabase.storage
                .from('products')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('products')
                .getPublicUrl(filePath);

            setImages([...images, { url: publicUrl, position: images.length }]);

        } catch (error: any) {
            alert('Error uploading image: ' + error.message);
        } finally {
            setUploading(false);
        }
    };

    const handleRemoveImage = (indexToRemove: number) => {
        setImages(images.filter((_, idx) => idx !== indexToRemove));
    };

    // Variant helpers removed — variants are now auto-generated from selectedColors × selectedSizes

    // The slug that will be saved. A saved product keeps its slug exactly as it is
    // unless the admin changed it; anything typed is tidied into a URL-safe slug.
    const resolveSlug = () => {
        if (isEditMode && initialData?.slug && urlSlug === initialData.slug) return urlSlug as string;
        return slugify(urlSlug || productName);
    };

    const tabForError: Record<string, string> = {
        name: 'general',
        price: 'pricing',
        stock: 'pricing',
        variants: 'variants',
        slug: 'seo'
    };

    // Checks the form before anything is written. Returns true when it can be saved.
    const validateForm = () => {
        const errors: Record<string, string> = {};

        if (!productName.trim()) {
            errors.name = 'Enter a product name.';
        }

        const usd = numOrNull(price) ?? 0;
        const ghs = numOrNull(priceGhs) ?? 0;
        const compareUsd = numOrNull(comparePrice) ?? 0;
        const compareGhs = numOrNull(comparePriceGhs) ?? 0;
        if (usd < 0 || ghs < 0 || compareUsd < 0 || compareGhs < 0) {
            errors.price = 'Prices cannot be negative.';
        } else if (usd <= 0 && ghs <= 0) {
            errors.price = 'Enter a Ghana price (GH₵) or a dollar price greater than 0.';
        }

        if (variants.length === 0 && (numOrNull(stock) ?? 0) < 0) {
            errors.stock = 'Stock cannot be negative.';
        }

        const badVariant = variants.find((v) =>
            (numOrNull(v.price) ?? 0) < 0 ||
            (numOrNull(v.price_ghs) ?? 0) < 0 ||
            (numOrNull(v.stock) ?? 0) < 0
        );
        if (badVariant) {
            const label = [badVariant.color, badVariant.name].filter(Boolean).join(' / ');
            errors.variants = `Variant "${label}" has a negative price or stock. Prices and stock cannot be below 0.`;
        }

        if (productName.trim() && !resolveSlug()) {
            errors.slug = 'Enter a URL slug using letters or numbers.';
        }

        setFormErrors(errors);
        const firstError = Object.keys(errors)[0];
        if (firstError) {
            setActiveTab(tabForError[firstError] || 'general');
            if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
            return false;
        }
        return true;
    };

    const handleSubmit = async () => {
        if (loading) return;
        setSaveError('');
        if (!validateForm()) return;

        // Which part was being saved, so a failure can say what did and did not save.
        let step = 'The product was not saved.';

        try {
            setLoading(true);

            // If product has variants, auto-sync main stock = sum of variant stocks
            const hasVariants = variants.length > 0;
            const variantStockTotal = hasVariants
                ? variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)
                : parseInt(stock) || 0;

            let productId: string | null = savedProductIdRef.current;

            // Keep everything else stored in metadata (for example a switched-off
            // sale price) and only set the two keys this form owns. Read it fresh,
            // because a sale may have been switched on or off since the form opened.
            let currentMetadata: Record<string, any> = initialData?.metadata || {};
            if (productId) {
                const { data: fresh, error: freshError } = await supabase
                    .from('products')
                    .select('metadata')
                    .eq('id', productId)
                    .maybeSingle();
                if (freshError) throw freshError;
                if (fresh?.metadata && typeof fresh.metadata === 'object') currentMetadata = fresh.metadata;
            }

            const productData: Record<string, any> = {
                name: productName.trim(),
                slug: resolveSlug(),
                description,
                category_id: categoryId || null,
                price: parseFloat(price) || 0,
                compare_at_price: comparePrice ? parseFloat(comparePrice) : null,
                price_ghs: priceGhs ? parseFloat(priceGhs) : null,
                compare_at_price_ghs: comparePriceGhs ? parseFloat(comparePriceGhs) : null,
                sku: sku || generateSku(),
                quantity: hasVariants ? variantStockTotal : (parseInt(stock) || 0),
                moq: Math.max(1, parseInt(moq) || 1),
                status: PRODUCT_STATUSES.includes(status) ? status : 'active',
                featured,
                seo_title: seoTitle,
                seo_description: metaDescription,
                tags: (keywords as string).split(',').map((k: string) => k.trim()).filter(Boolean),
                metadata: {
                    ...currentMetadata,
                    low_stock_threshold: parseInt(lowStockThreshold) || 5,
                    preorder_shipping: preorderShipping.trim() || null
                }
            };

            const variantBaseline = variantBaselineRef.current;

            if (productId) {
                // Prices and stock can change behind an open form (a sale starting,
                // an order coming in). Only write the ones that were changed here.
                if (isEditMode && initialData?.id === productId) {
                    for (const field of ['price', 'compare_at_price', 'price_ghs', 'compare_at_price_ghs']) {
                        if (numOrNull(productData[field]) === numOrNull(initialData[field])) delete productData[field];
                    }
                    if (hasVariants) {
                        // Set from the saved variants once they are written (see below).
                        delete productData.quantity;
                    } else if (variantBaseline.length === 0 && numOrNull(productData.quantity) === numOrNull(initialData.quantity ?? 0)) {
                        delete productData.quantity;
                    }
                }

                // Update existing
                const { error: updateError } = await supabase
                    .from('products')
                    .update(productData)
                    .eq('id', productId);
                if (updateError) throw updateError;
            } else {
                // Create new
                const { data: newProduct, error: insertError } = await supabase
                    .from('products')
                    .insert([productData])
                    .select()
                    .single();

                if (insertError) throw insertError;
                if (!newProduct?.id) throw new Error('The shop did not confirm the new product. Check the product list before trying again.');
                productId = newProduct.id as string;
                savedProductIdRef.current = productId;
            }

            // 1. Images. Left alone when the list did not change. When it did:
            // add the new ones first, then renumber, and only then remove the ones
            // the admin took out, so a failed step can never leave no images.
            const imageBaseline = imageBaselineRef.current;
            const imagesUnchanged = imageBaseline.length === images.length &&
                images.every((img, idx) =>
                    img.url === imageBaseline[idx].url && (img.id || null) === (imageBaseline[idx].id || null));

            if (!imagesUnchanged) {
                step = 'The product details were saved, but the images were not.';
                let nextImages = images;

                const newImages = images.filter((img) => !img.id);
                if (newImages.length > 0) {
                    const { data: insertedImages, error: imageInsertError } = await supabase
                        .from('product_images')
                        .insert(newImages.map((img) => ({
                            product_id: productId,
                            url: img.url,
                            position: images.indexOf(img),
                            alt_text: productName.trim()
                        })))
                        .select();
                    if (imageInsertError) throw imageInsertError;
                    // Remember the new rows, so saving again does not add them twice.
                    nextImages = images.map((img) => {
                        if (img.id) return img;
                        const saved = (insertedImages || []).find((row: any) => row.url === img.url);
                        return saved ? { ...img, id: saved.id, position: saved.position } : img;
                    });
                    setImages(nextImages);
                    imageBaselineRef.current = [
                        ...imageBaseline,
                        ...nextImages.filter((img) => img.id && !imageBaseline.some((b) => b.id === img.id))
                    ];
                }

                for (let idx = 0; idx < nextImages.length; idx++) {
                    const img = nextImages[idx];
                    if (!img.id || Number(img.position) === idx) continue;
                    const { error: positionError } = await supabase
                        .from('product_images')
                        .update({ position: idx })
                        .eq('id', img.id);
                    if (positionError) throw positionError;
                }

                const removedImageIds = imageBaselineRef.current
                    .filter((b) => b.id && !nextImages.some((img) => img.id === b.id))
                    .map((b) => b.id);
                if (removedImageIds.length > 0) {
                    const { error: imageDeleteError } = await supabase
                        .from('product_images')
                        .delete()
                        .in('id', removedImageIds);
                    if (imageDeleteError) throw imageDeleteError;
                }

                nextImages = nextImages.map((img, idx) => ({ ...img, position: idx }));
                setImages(nextImages);
                imageBaselineRef.current = nextImages;
            }

            // 2. Variants. Compare the form with what is saved: update the ones that
            // are still there (keeping their id, sale prices and other stored data),
            // add the new ones, and delete only the ones the admin removed.
            step = 'The product details and images were saved, but the variants were not all saved.';

            const savedByKey = new Map<string, any>();
            variantBaseline.forEach((b) => {
                if (b.row?.id && !savedByKey.has(b.key)) savedByKey.set(b.key, b.row);
            });

            const wantedVariants = variants.map((v) => ({
                key: v.key,
                label: [v.color, v.name].filter(Boolean).join(' / '),
                colorHex: selectedColors.find((c) => c.name === v.color)?.hex || null,
                fields: {
                    name: v.name || v.color || 'Default',
                    sku: v.sku || null,
                    // Inherit product prices when a variant field is left blank
                    // (prevents stale variant USD showing as huge Ghana prices on the shop).
                    price: v.price !== '' && v.price != null
                        ? parseFloat(v.price) || 0
                        : (price ? parseFloat(price) : 0),
                    price_ghs: v.price_ghs
                        ? parseFloat(v.price_ghs)
                        : (priceGhs ? parseFloat(priceGhs) : null),
                    quantity: parseInt(v.stock) || 0,
                    option1: v.name || null,
                    option2: v.color?.trim() || null
                } as Record<string, any>
            }));

            // 2a. Update the variants that still exist, writing only what changed.
            const variantUpdates: { row: any; label: string; patch: Record<string, any>; colorHex: string | null }[] = [];
            for (const wanted of wantedVariants) {
                const row = savedByKey.get(wanted.key);
                if (!row) continue;
                const patch: Record<string, any> = {};
                if (wanted.fields.name !== row.name) patch.name = wanted.fields.name;
                if (wanted.fields.sku !== (row.sku || null)) patch.sku = wanted.fields.sku;
                if (numOrNull(wanted.fields.price) !== numOrNull(row.price)) patch.price = wanted.fields.price;
                if (numOrNull(wanted.fields.price_ghs) !== numOrNull(row.price_ghs)) patch.price_ghs = wanted.fields.price_ghs;
                if (wanted.fields.quantity !== (numOrNull(row.quantity) ?? 0)) patch.quantity = wanted.fields.quantity;
                if (wanted.fields.option1 !== (row.option1 || null)) patch.option1 = wanted.fields.option1;
                if (wanted.fields.option2 !== (row.option2 || null)) patch.option2 = wanted.fields.option2;
                const colorChanged = !!wanted.colorHex && wanted.colorHex !== (row.metadata?.color_hex || null);
                if (Object.keys(patch).length > 0 || colorChanged) {
                    variantUpdates.push({ row, label: wanted.label, patch, colorHex: colorChanged ? wanted.colorHex : null });
                }
            }

            if (variantUpdates.some((u) => u.colorHex)) {
                // The colour goes into the variant's stored data without replacing
                // the rest of it. Read that data fresh for the same reason as above.
                const { data: freshVariants, error: freshVariantsError } = await supabase
                    .from('product_variants')
                    .select('id, metadata')
                    .eq('product_id', productId);
                if (freshVariantsError) throw freshVariantsError;
                const freshMetadata = new Map<string, any>();
                (freshVariants || []).forEach((r: any) => freshMetadata.set(r.id, r.metadata));
                for (const update of variantUpdates) {
                    if (!update.colorHex) continue;
                    const stored = freshMetadata.get(update.row.id) ?? update.row.metadata;
                    update.patch.metadata = {
                        ...(stored && typeof stored === 'object' ? stored : {}),
                        color_hex: update.colorHex
                    };
                }
            }

            for (const update of variantUpdates) {
                const { error: variantUpdateError } = await supabase
                    .from('product_variants')
                    .update(update.patch)
                    .eq('id', update.row.id);
                if (variantUpdateError) {
                    throw new Error(`Variant "${update.label}": ${variantUpdateError.message}`);
                }
                Object.assign(update.row, update.patch);
            }

            // 2b. Add the new variants (one request: they are all added or none are).
            const newVariants = wantedVariants.filter((wanted) => !savedByKey.has(wanted.key));
            if (newVariants.length > 0) {
                const { data: insertedVariants, error: variantInsertError } = await supabase
                    .from('product_variants')
                    .insert(newVariants.map((wanted) => ({
                        product_id: productId,
                        ...wanted.fields,
                        metadata: wanted.colorHex ? { color_hex: wanted.colorHex } : {}
                    })))
                    .select();
                if (variantInsertError) throw variantInsertError;
                // Remember the new rows, so saving again does not add them twice.
                for (const wanted of newVariants) {
                    const saved = (insertedVariants || []).find((row: any) =>
                        row.name === wanted.fields.name &&
                        (row.option1 || null) === wanted.fields.option1 &&
                        (row.option2 || null) === wanted.fields.option2);
                    if (saved) variantBaselineRef.current.push({ key: wanted.key, row: saved });
                }
            }

            // 2c. Delete only the variants the admin removed.
            const wantedKeys = new Set(wantedVariants.map((wanted) => wanted.key));
            const removedVariantIds = variantBaselineRef.current
                .filter((b) => b.row?.id && !wantedKeys.has(b.key))
                .map((b) => b.row.id);
            if (removedVariantIds.length > 0) {
                const { error: variantDeleteError } = await supabase
                    .from('product_variants')
                    .delete()
                    .in('id', removedVariantIds);
                if (variantDeleteError) throw variantDeleteError;
                variantBaselineRef.current = variantBaselineRef.current.filter((b) => wantedKeys.has(b.key));
            }

            // 3. A product with variants holds the total of its variants' stock.
            // Add it up from what is saved, not from the form, so stock sold while
            // the form was open is not put back. (This last write also lets the
            // database re-check the product's "on sale" flag against its variants.)
            if (hasVariants || removedVariantIds.length > 0) {
                step = 'Everything was saved except the product\'s total stock.';
                let totalStock = parseInt(stock) || 0;
                if (hasVariants) {
                    const { data: stockRows, error: stockReadError } = await supabase
                        .from('product_variants')
                        .select('quantity')
                        .eq('product_id', productId);
                    if (stockReadError) throw stockReadError;
                    totalStock = (stockRows || []).reduce((sum: number, r: any) => sum + (numOrNull(r.quantity) ?? 0), 0);
                }
                const { error: stockWriteError } = await supabase
                    .from('products')
                    .update({ quantity: Math.max(0, totalStock) })
                    .eq('id', productId);
                if (stockWriteError) throw stockWriteError;
            }

            alert(isEditMode ? 'Product updated successfully!' : 'Product created successfully!');
            router.push('/admin/products');

        } catch (err: any) {
            console.error('Error saving product:', err);
            const reason = plainSaveMessage(err?.message || 'Check your connection and save again.');
            setSaveError(`${step} ${reason}`);
            if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <Link
                        href="/admin/products"
                        className="w-10 h-10 flex items-center justify-center border-2 border-gray-300 rounded-lg hover:border-gray-400 transition-colors"
                    >
                        <i className="ri-arrow-left-line text-xl text-gray-700"></i>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900">
                            {isEditMode ? 'Edit Product' : 'Add New Product'}
                        </h1>
                        <p className="text-gray-600 mt-1">
                            {isEditMode ? 'Update product information and settings' : 'Create a new product for your catalog'}
                        </p>
                    </div>
                </div>

                <div className="flex items-center space-x-3">
                    {isEditMode && (
                        <Link
                            href={`/product/${initialData?.id}`}
                            target="_blank"
                            className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:border-gray-400 transition-colors font-semibold whitespace-nowrap cursor-pointer flex items-center"
                        >
                            <i className="ri-eye-line mr-2"></i>
                            Preview
                        </Link>
                    )}
                    <button
                        onClick={handleSubmit}
                        disabled={loading || uploading}
                        className={`px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer flex items-center ${loading || uploading ? 'opacity-70 cursor-not-allowed' : ''}`}
                    >
                        {loading ? (
                            <>
                                <i className="ri-loader-4-line animate-spin mr-2"></i>
                                Saving...
                            </>
                        ) : (
                            <>
                                <i className="ri-save-line mr-2"></i>
                                {isEditMode ? 'Save Changes' : 'Create Product'}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {(saveError || Object.keys(formErrors).length > 0) && (
                <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start space-x-3">
                    <i className="ri-error-warning-line text-xl text-red-600 mt-0.5"></i>
                    <div className="text-sm text-red-800">
                        {saveError ? (
                            <>
                                <p className="font-semibold">Something was not saved</p>
                                <p className="mt-1">{saveError}</p>
                            </>
                        ) : (
                            <>
                                <p className="font-semibold">Fix this before saving</p>
                                <ul className="mt-1 list-disc list-inside space-y-0.5">
                                    {Object.entries(formErrors).map(([field, message]) => (
                                        <li key={field}>{message}</li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </div>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200 overflow-x-auto">
                    <div className="flex">
                        {tabs.map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center space-x-2 px-6 py-4 font-semibold whitespace-nowrap transition-colors border-b-2 cursor-pointer ${activeTab === tab.id
                                    ? 'border-blue-700 text-blue-700 bg-blue-50'
                                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                                    }`}
                            >
                                <i className={`${tab.icon} text-xl`}></i>
                                <span>{tab.label}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="p-8">
                    {activeTab === 'general' && (
                        <div className="space-y-6 max-w-3xl">
                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Product Name *
                                </label>
                                <input
                                    type="text"
                                    value={productName}
                                    onChange={(e) => { setProductName(e.target.value); clearFormError('name'); }}
                                    aria-invalid={!!formErrors.name}
                                    className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${formErrors.name ? 'border-red-400' : 'border-gray-300'}`}
                                    placeholder="Enter product name"
                                />
                                {formErrors.name && <p className="text-sm text-red-600 mt-2">{formErrors.name}</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Description
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    rows={6}
                                    maxLength={500}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                                    placeholder="Describe your product..."
                                />
                                <p className="text-sm text-gray-500 mt-2">{description.length}/500 characters</p>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Category *
                                    </label>
                                    <select
                                        value={categoryId}
                                        onChange={(e) => setCategoryId(e.target.value)}
                                        className="w-full px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                                    >
                                        {categories.length === 0 && <option value="">Loading categories...</option>}
                                        {categories.length > 0 && <option value="">Select a category</option>}
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Status
                                    </label>
                                    <select
                                        value={status}
                                        onChange={(e) => setStatus(e.target.value)}
                                        className="w-full px-4 py-3 pr-8 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                                    >
                                        <option value="active">Active</option>
                                        <option value="draft">Draft</option>
                                        <option value="archived">Archived</option>
                                    </select>
                                </div>
                            </div>

                            <div className="flex items-center space-x-3">
                                <input
                                    type="checkbox"
                                    checked={featured}
                                    onChange={(e) => setFeatured(e.target.checked)}
                                    className="w-5 h-5 text-blue-700 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                                />
                                <label className="text-gray-900 font-medium">
                                    Feature this product on homepage
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Pre-order / Estimated Shipping
                                </label>
                                <input
                                    type="text"
                                    value={preorderShipping}
                                    onChange={(e) => setPreorderShipping(e.target.value)}
                                    placeholder="e.g., Ships in 14 days, Available March 15"
                                    className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                />
                                <p className="text-xs text-gray-500 mt-1">Leave empty if product ships immediately. Otherwise, enter estimated shipping time.</p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'pricing' && (
                        <div className="space-y-6 max-w-3xl">
                            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg mb-2">
                                <p className="text-amber-900 text-sm">
                                  Set <strong>two prices</strong> — they are never auto-converted at checkout.
                                  <br />
                                  <strong>USD</strong> → international customers (PayPal).{' '}
                                  <strong>Ghana (GH₵)</strong> → Ghana visitors (Mobile Money).
                                  Fill both so shop and online stay aligned.
                                </p>
                            </div>

                            {formErrors.price && (
                                <p role="alert" className="text-sm text-red-600 font-medium">{formErrors.price}</p>
                            )}

                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Price (USD)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">$</span>
                                        <input
                                            type="number"
                                            value={price}
                                            onChange={(e) => {
                                                const next = e.target.value;
                                                setPrice(next);
                                                clearFormError('price');
                                                // Keep uniform variant prices in sync with product price
                                                setVariantData((prev) => {
                                                    const updated: typeof prev = {};
                                                    for (const [k, row] of Object.entries(prev)) {
                                                        updated[k] = { ...row, price: next };
                                                    }
                                                    return updated;
                                                });
                                            }}
                                            className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            step="0.01"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Compare at Price (USD)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">$</span>
                                        <input
                                            type="number"
                                            value={comparePrice}
                                            onChange={(e) => setComparePrice(e.target.value)}
                                            className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            step="0.01"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <p className="text-sm text-gray-500 mt-2">Show original price for comparison</p>
                                </div>
                            </div>

                            <div className="grid md:grid-cols-2 gap-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Ghana Price (GH₵)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">GH₵</span>
                                        <input
                                            type="number"
                                            value={priceGhs}
                                            onChange={(e) => {
                                                const next = e.target.value;
                                                setPriceGhs(next);
                                                clearFormError('price');
                                                setVariantData((prev) => {
                                                    const updated: typeof prev = {};
                                                    for (const [k, row] of Object.entries(prev)) {
                                                        updated[k] = { ...row, price_ghs: next };
                                                    }
                                                    return updated;
                                                });
                                            }}
                                            className="w-full pl-16 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            step="0.01"
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">
                                      Required for Ghana customers. If empty, Ghana storefront will fall back to a rough USD×rate — set this explicitly for best control.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                                        Ghana Compare Price (GH₵)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 font-semibold">GH₵</span>
                                        <input
                                            type="number"
                                            value={comparePriceGhs}
                                            onChange={(e) => setComparePriceGhs(e.target.value)}
                                            className="w-full pl-16 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            step="0.01"
                                            placeholder="0.00"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                <p className="text-blue-900 font-semibold mb-1">Discount Calculation</p>
                                {price && comparePrice && parseFloat(comparePrice) > parseFloat(price) ? (
                                    <p className="text-blue-800">
                                        Savings: ${money(parseFloat(comparePrice) - parseFloat(price))}
                                        <span className="ml-2">
                                            ({(((parseFloat(comparePrice) - parseFloat(price)) / parseFloat(comparePrice)) * 100).toFixed(0)}% off)
                                        </span>
                                    </p>
                                ) : (
                                    <p className="text-blue-800 text-sm">Enter a valid compare price higher than the price to see discount.</p>
                                )}
                            </div>

                            <div className="pt-6 border-t border-gray-200">
                                <h3 className="text-lg font-bold text-gray-900 mb-4">Inventory</h3>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            SKU (Auto-generated)
                                        </label>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={sku}
                                                onChange={(e) => setSku(e.target.value)}
                                                className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono bg-gray-50"
                                                placeholder="Auto-generated"
                                                readOnly
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setSku(generateSku())}
                                                className="px-4 py-3 border-2 border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
                                                title="Generate new SKU"
                                            >
                                                <i className="ri-refresh-line text-lg"></i>
                                            </button>
                                        </div>
                                        <p className="text-sm text-gray-500 mt-1">SKU is auto-generated. Click refresh to generate a new one.</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            Stock Quantity *
                                        </label>
                                        {variants.length > 0 ? (
                                            <div>
                                                <input
                                                    type="number"
                                                    value={variants.reduce((sum: number, v: any) => sum + (parseInt(v.stock) || 0), 0)}
                                                    readOnly
                                                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed"
                                                />
                                                <p className="text-sm text-amber-600 mt-1 flex items-center">
                                                    <i className="ri-information-line mr-1"></i>
                                                    Stock is managed per variant. Edit stock in the Variants tab.
                                                </p>
                                            </div>
                                        ) : (
                                            <>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={stock}
                                                    onChange={(e) => { setStock(e.target.value); clearFormError('stock'); }}
                                                    aria-invalid={!!formErrors.stock}
                                                    className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${formErrors.stock ? 'border-red-400' : 'border-gray-300'}`}
                                                    placeholder="0"
                                                />
                                                {formErrors.stock && <p className="text-sm text-red-600 mt-2">{formErrors.stock}</p>}
                                            </>
                                        )}
                                    </div>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6 mt-6">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            Minimum Order Quantity (MOQ)
                                        </label>
                                        <input
                                            type="number"
                                            value={moq}
                                            onChange={(e) => setMoq(e.target.value)}
                                            min="1"
                                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                            placeholder="1"
                                        />
                                        <p className="text-sm text-gray-500 mt-1">Minimum quantity customers must order</p>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                                            Low Stock Threshold
                                        </label>
                                        <input
                                            type="number"
                                            value={lowStockThreshold}
                                            onChange={(e) => setLowStockThreshold(e.target.value)}
                                            className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                        />
                                        <p className="text-sm text-gray-500 mt-1">Get notified when stock falls below this number</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'variants' && (
                        <div className="space-y-8">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900">Product Variants</h3>
                                <p className="text-gray-600 mt-1">Select colors and sizes below — variants are generated automatically</p>
                            </div>

                            {/* STEP 1: Colors */}
                            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                                <h4 className="text-sm font-bold text-gray-900 mb-1 flex items-center">
                                    <i className="ri-palette-line mr-2 text-lg text-blue-700"></i>
                                    Step 1: Select Colors
                                    {selectedColors.length > 0 && (
                                        <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                                            {selectedColors.length} selected
                                        </span>
                                    )}
                                </h4>
                                <p className="text-xs text-gray-500 mb-4">Click colors to add/remove. Skip if product has no color options.</p>

                                <div className="flex flex-wrap gap-2 mb-4">
                                    {colorPresets.map(color => {
                                        const isSelected = selectedColors.some(c => c.name === color.name);
                                        return (
                                            <button
                                                key={color.name}
                                                onClick={() => toggleColor(color)}
                                                className={`flex items-center space-x-2 px-3 py-2 rounded-lg border-2 transition-all text-sm font-medium ${isSelected
                                                        ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                                                        : 'border-gray-200 hover:border-gray-300 bg-white'
                                                    }`}
                                                title={color.name}
                                            >
                                                <span
                                                    className="w-5 h-5 rounded-full border border-gray-300 flex-shrink-0"
                                                    style={{ backgroundColor: color.hex }}
                                                ></span>
                                                <span className={isSelected ? 'text-blue-800' : 'text-gray-700'}>{color.name}</span>
                                                {isSelected && <i className="ri-check-line text-blue-700"></i>}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Custom color */}
                                <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                                    <input
                                        type="color"
                                        value={customColorHex}
                                        onChange={(e) => setCustomColorHex(e.target.value)}
                                        className="w-10 h-10 rounded-lg border border-gray-300 cursor-pointer p-0.5"
                                        title="Pick a custom color"
                                    />
                                    <input
                                        type="text"
                                        value={customColorName}
                                        onChange={(e) => setCustomColorName(e.target.value)}
                                        placeholder="Custom color name"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        onKeyDown={(e) => e.key === 'Enter' && addCustomColor()}
                                    />
                                    <button
                                        onClick={addCustomColor}
                                        disabled={!customColorName.trim()}
                                        className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Add Color
                                    </button>
                                </div>

                                {/* Selected colors summary */}
                                {selectedColors.length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {selectedColors.map(color => (
                                            <span key={color.name} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm shadow-sm">
                                                <span className="w-3.5 h-3.5 rounded-full border border-gray-300" style={{ backgroundColor: color.hex }}></span>
                                                {color.name}
                                                <button onClick={() => toggleColor(color)} className="text-gray-400 hover:text-red-500 ml-1">
                                                    <i className="ri-close-line text-sm"></i>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* STEP 2: Sizes */}
                            <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                                <h4 className="text-sm font-bold text-gray-900 mb-1 flex items-center">
                                    <i className="ri-ruler-line mr-2 text-lg text-blue-600"></i>
                                    Step 2: Select Sizes
                                    {selectedSizes.length > 0 && (
                                        <span className="ml-2 bg-blue-100 text-blue-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                                            {selectedSizes.length} selected
                                        </span>
                                    )}
                                </h4>
                                <p className="text-xs text-gray-500 mb-4">Click sizes to add/remove. Use custom for volumes (100ml), weights, etc.</p>

                                <div className="flex flex-wrap gap-2 mb-4">
                                    {sizePresets.map(size => {
                                        const isSelected = selectedSizes.includes(size);
                                        return (
                                            <button
                                                key={size}
                                                onClick={() => toggleSize(size)}
                                                className={`px-5 py-2.5 rounded-lg border-2 font-semibold text-sm transition-all ${isSelected
                                                        ? 'border-blue-600 bg-blue-50 text-blue-800 ring-1 ring-blue-600'
                                                        : 'border-gray-200 hover:border-gray-300 bg-white text-gray-700'
                                                    }`}
                                            >
                                                {size}
                                                {isSelected && <i className="ri-check-line ml-1.5 text-blue-600"></i>}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Custom size */}
                                <div className="flex items-center gap-2 pt-3 border-t border-gray-200">
                                    <input
                                        type="text"
                                        value={customSize}
                                        onChange={(e) => setCustomSize(e.target.value)}
                                        placeholder="Custom size (e.g. 100ml, One Size, 42)"
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                        onKeyDown={(e) => e.key === 'Enter' && addCustomSize()}
                                    />
                                    <button
                                        onClick={addCustomSize}
                                        disabled={!customSize.trim()}
                                        className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                    >
                                        Add Size
                                    </button>
                                </div>

                                {/* Selected sizes summary */}
                                {selectedSizes.length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {selectedSizes.map(size => (
                                            <span key={size} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-sm shadow-sm font-medium">
                                                {size}
                                                <button onClick={() => toggleSize(size)} className="text-gray-400 hover:text-red-500 ml-1">
                                                    <i className="ri-close-line text-sm"></i>
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {formErrors.variants && (
                                <p role="alert" className="text-sm text-red-600 font-medium">{formErrors.variants}</p>
                            )}

                            {/* STEP 3: Variant Grid */}
                            {variantCombinations.length > 0 && (
                                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                                    <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                                        <div>
                                            <h4 className="text-sm font-bold text-gray-900 flex items-center">
                                                <i className="ri-grid-line mr-2 text-lg text-purple-600"></i>
                                                Step 3: Set Price & Stock ({variantCombinations.length} variant{variantCombinations.length > 1 ? 's' : ''})
                                            </h4>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => {
                                                    const val = prompt('Set price for ALL variants:', price?.toString() || '0');
                                                    if (val !== null) bulkSetField('price', val);
                                                }}
                                                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                                            >
                                                Bulk Set Price
                                            </button>
                                            <button
                                                onClick={() => {
                                                    const val = prompt('Set stock for ALL variants:', '0');
                                                    if (val !== null) bulkSetField('stock', val);
                                                }}
                                                className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 transition-colors"
                                            >
                                                Bulk Set Stock
                                            </button>
                                        </div>
                                    </div>

                                    <div className="overflow-x-auto">
                                        <table className="w-full">
                                            <thead className="bg-gray-50 border-b border-gray-200">
                                                <tr>
                                                    {selectedColors.length > 0 && (
                                                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Color</th>
                                                    )}
                                                    {selectedSizes.length > 0 && (
                                                        <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Size</th>
                                                    )}
                                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Price ($)</th>
                                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Ghana (GH₵)</th>
                                                    <th className="text-left py-3 px-4 text-sm font-semibold text-gray-700">Stock</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {variantCombinations.map((combo) => {
                                                    const d = variantData[combo.key] || { price: price, stock: '0', sku: '' };
                                                    return (
                                                        <tr key={combo.key} className="border-b border-gray-100 hover:bg-gray-50">
                                                            {selectedColors.length > 0 && (
                                                                <td className="py-3 px-4">
                                                                    <div className="flex items-center gap-2">
                                                                        <span
                                                                            className="w-5 h-5 rounded-full border border-gray-300 flex-shrink-0"
                                                                            style={{ backgroundColor: combo.colorHex }}
                                                                        ></span>
                                                                        <span className="text-sm font-medium text-gray-900">{combo.color}</span>
                                                                    </div>
                                                                </td>
                                                            )}
                                                            {selectedSizes.length > 0 && (
                                                                <td className="py-3 px-4">
                                                                    <span className="text-sm font-semibold text-gray-900 bg-gray-100 px-2.5 py-1 rounded">
                                                                        {combo.size}
                                                                    </span>
                                                                </td>
                                                            )}
                                                            <td className="py-3 px-4">
                                                                <input
                                                                    type="number"
                                                                    value={d.price}
                                                                    onChange={(e) => updateVariantField(combo.key, 'price', e.target.value)}
                                                                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                                                    step="0.01"
                                                                    placeholder={price?.toString() || '0'}
                                                                />
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <input
                                                                    type="number"
                                                                    value={d.price_ghs}
                                                                    onChange={(e) => updateVariantField(combo.key, 'price_ghs', e.target.value)}
                                                                    className="w-28 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                                                    step="0.01"
                                                                    placeholder="Auto"
                                                                />
                                                            </td>
                                                            <td className="py-3 px-4">
                                                                <input
                                                                    type="number"
                                                                    value={d.stock}
                                                                    onChange={(e) => updateVariantField(combo.key, 'stock', e.target.value)}
                                                                    className="w-24 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                                                                    placeholder="0"
                                                                />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    <div className="p-3 bg-blue-50 border-t border-blue-100">
                                        <p className="text-xs text-blue-800 flex items-center">
                                            <i className="ri-information-line mr-1.5"></i>
                                            Total stock across all variants: <strong className="ml-1">{variants.reduce((sum, v) => sum + (parseInt(v.stock) || 0), 0)}</strong>
                                        </p>
                                    </div>
                                </div>
                            )}

                            {variantCombinations.length === 0 && (
                                <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
                                    <i className="ri-palette-line text-4xl text-gray-300 mb-2 block"></i>
                                    <p className="font-medium">No variants configured</p>
                                    <p className="text-sm mt-1">Select colors and/or sizes above to create variant combinations.</p>
                                    <p className="text-xs mt-2 text-gray-400">You can add just colors, just sizes, or both for a full grid.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'images' && (
                        <div className="space-y-6">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">Product Images</h3>
                                <p className="text-gray-600">Add up to 10 images. First image will be the primary image.</p>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {images.map((img: any, index: number) => (
                                    <div key={index} className="relative group">
                                        <div className="aspect-square bg-gray-100 rounded-xl overflow-hidden border-2 border-gray-200">
                                            <img src={img.url} alt={`Product ${index + 1}`} className="w-full h-full object-cover" />
                                        </div>
                                        {index === 0 && (
                                            <span className="absolute top-2 left-2 bg-blue-700 text-white px-2 py-1 rounded text-xs font-semibold whitespace-nowrap">
                                                Primary
                                            </span>
                                        )}
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center space-x-2 rounded-xl">
                                            <a href={img.url} target="_blank" rel="noreferrer" className="w-9 h-9 flex items-center justify-center bg-white text-gray-900 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                                                <i className="ri-eye-line"></i>
                                            </a>
                                            <button
                                                onClick={() => handleRemoveImage(index)}
                                                className="w-9 h-9 flex items-center justify-center bg-white text-red-600 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                                            >
                                                <i className="ri-delete-bin-line"></i>
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                <label className={`aspect-square border-2 border-dashed border-gray-300 rounded-xl hover:border-blue-700 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center space-y-2 text-gray-600 hover:text-blue-700 cursor-pointer ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                    {uploading ? (
                                        <i className="ri-loader-4-line animate-spin text-3xl"></i>
                                    ) : (
                                        <i className="ri-upload-2-line text-3xl"></i>
                                    )}
                                    <span className="text-sm font-semibold">{uploading ? 'Uploading...' : 'Upload Image'}</span>
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleImageUpload}
                                        disabled={uploading}
                                    />
                                </label>
                            </div>

                            <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                                <p className="text-sm text-gray-700">
                                    <strong>Image Guidelines:</strong> Use high-quality images (min 1000x1000px), white or neutral backgrounds work best.
                                    Supported formats: JPG, PNG, WebP (max 5MB each).
                                </p>
                            </div>
                        </div>
                    )}

                    {activeTab === 'seo' && (
                        <div className="space-y-6 max-w-3xl">
                            <div>
                                <h3 className="text-lg font-bold text-gray-900 mb-1">Search Engine Optimization</h3>
                                <p className="text-gray-600">Optimize how this product appears in search results</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Page Title
                                </label>
                                <input
                                    type="text"
                                    value={seoTitle}
                                    onChange={(e) => setSeoTitle(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Seo friendly title"
                                />
                                <p className="text-sm text-gray-500 mt-2">60 characters recommended</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Meta Description
                                </label>
                                <textarea
                                    rows={3}
                                    maxLength={500}
                                    value={metaDescription}
                                    onChange={(e) => setMetaDescription(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                                    placeholder="Seo friendly description"
                                />
                                <p className="text-sm text-gray-500 mt-2">160 characters recommended</p>
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    URL Slug
                                </label>
                                <div className="flex items-center">
                                    <span className="text-gray-600 bg-gray-100 px-4 py-3 border-2 border-r-0 border-gray-300 rounded-l-lg">
                                        /product/
                                    </span>
                                    <input
                                        type="text"
                                        value={urlSlug}
                                        onChange={(e) => {
                                            setUrlSlug(e.target.value);
                                            setSlugEdited(true);
                                            clearFormError('slug');
                                        }}
                                        aria-invalid={!!formErrors.slug}
                                        className={`flex-1 px-4 py-3 border-2 rounded-r-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${formErrors.slug ? 'border-red-400' : 'border-gray-300'}`}
                                        placeholder="product-slug"
                                    />
                                </div>
                                {formErrors.slug ? (
                                    <p className="text-sm text-red-600 mt-2">{formErrors.slug}</p>
                                ) : (
                                    <p className="text-sm text-gray-500 mt-2">
                                        {slugEdited
                                            ? 'This is the product\'s web address. Changing it breaks links people have already saved or shared.'
                                            : 'Filled in from the product name. Type here to set your own; leave it empty to use the name.'}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-900 mb-2">
                                    Keywords
                                </label>
                                <input
                                    type="text"
                                    value={keywords}
                                    onChange={(e) => setKeywords(e.target.value)}
                                    className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="keyword1, keyword2"
                                />
                                <p className="text-sm text-gray-500 mt-2">Separate keywords with commas</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
