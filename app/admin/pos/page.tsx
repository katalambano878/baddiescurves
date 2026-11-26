'use client';

import { formatMoney } from '@/lib/format-money';
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

// The till sells in Ghana cedis only. Every price here is a cedi price
// (price_ghs); the dollar price is never loaded, shown or charged.

interface Variant {
    id: string;
    label: string;            // e.g. "Black / 38"
    priceGhs: number | null;  // null = no cedi price set, cannot be sold here
    quantity: number;
    sku: string | null;
}

interface Product {
    id: string;
    name: string;
    priceGhs: number | null;  // the product's own cedi price
    quantity: number;         // stock on hand (the total of its variants when it has any)
    category: string;
    image: string;
    sku: string;
    variants: Variant[];
}

interface CartItem {
    key: string;              // one line per product, or per product + variant
    productId: string;
    variantId: string | null;
    name: string;
    variantName: string | null;
    price: number;            // cedis
    stock: number;            // stock on hand when it was added
    image: string;
    sku: string | null;
    cartQuantity: number;
}

interface Customer {
    id: string;
    full_name: string;
    email: string;
    phone?: string;
}

interface CompletedOrder {
    id: string;
    orderNumber: string;
    createdAt: string;
    items: CartItem[];
    subtotal: number;
    total: number;
    paymentMethod: string;
    paymentPending: boolean;
    paymentUrl?: string;
    tendered: number | null;
    change: number;
    customerName: string;
    warnings: string[];
}

/** A cedi price greater than 0, or null when none is set. */
function cediPrice(value: unknown): number | null {
    if (value === null || value === undefined || value === '') return null;
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
}

function stockNumber(value: unknown): number {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** "Colour / Size", the same wording the online shop saves on its orders. */
function variantLabel(v: { name?: string | null; option2?: string | null }): string {
    const color = (v.option2 || '').trim();
    const name = (v.name || '').trim();
    if (color && name && color !== name) return `${color} / ${name}`;
    return color || name || 'Default';
}

function hasCediPrice(product: Product): boolean {
    return product.variants.length > 0
        ? product.variants.some(v => v.priceGhs !== null)
        : product.priceGhs !== null;
}

/** The price shown on a product tile: its own price, or the range of its variants. */
function tilePrice(product: Product): string {
    if (product.variants.length === 0) return formatMoney(product.priceGhs, 'GHS');
    const prices = product.variants.map(v => v.priceGhs).filter((p): p is number => p !== null);
    const lowest = Math.min(...prices);
    const highest = Math.max(...prices);
    return lowest === highest ? formatMoney(lowest, 'GHS') : `From ${formatMoney(lowest, 'GHS')}`;
}

const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Cash',
    card: 'Card',
    momo: 'Mobile Money'
};

const PRODUCT_SELECT = `
    id, name, price_ghs, quantity, sku, status,
    categories(name),
    product_images(url, position),
    product_variants(id, name, option1, option2, price_ghs, quantity, sku)
`;

export default function POSPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [cart, setCart] = useState<CartItem[]>([]);
    const [activeCategory, setActiveCategory] = useState('All');
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
    // The product whose variant is being chosen, and a short message for the cashier.
    const [variantPicker, setVariantPicker] = useState<Product | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    // Checkout State
    const [showCheckoutModal, setShowCheckoutModal] = useState(false);
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [customerSearch, setCustomerSearch] = useState('');
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [amountTendered, setAmountTendered] = useState<string>('');
    const [processing, setProcessing] = useState(false);
    const [completedOrder, setCompletedOrder] = useState<CompletedOrder | null>(null);
    const [checkoutError, setCheckoutError] = useState<string | null>(null);
    const [deliveryMethod, setDeliveryMethod] = useState<'pickup' | 'doorstep'>('pickup');
    const [guestDetails, setGuestDetails] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        address: '',
        city: '',
        region: ''
    });

    const ghanaRegions = [
        'Greater Accra', 'Ashanti', 'Western', 'Central', 'Eastern',
        'Northern', 'Volta', 'Upper East', 'Upper West', 'Brong-Ahafo',
        'Ahafo', 'Bono', 'Bono East', 'North East', 'Savannah', 'Oti', 'Western North'
    ];

    useEffect(() => {
        fetchData();
    }, []);

    // Messages for the cashier clear themselves after a few seconds
    useEffect(() => {
        if (!notice) return;
        const timer = setTimeout(() => setNotice(null), 6000);
        return () => clearTimeout(timer);
    }, [notice]);

    // Only active products are sold at the till. Returns false when loading failed.
    const loadProducts = async (): Promise<boolean> => {
        const { data: prodData, error: prodError } = await supabase
            .from('products')
            .select(PRODUCT_SELECT)
            .eq('status', 'active')
            .order('name');

        if (prodError || !prodData) {
            console.error('Error fetching POS products:', prodError);
            return false;
        }

        const formatted: Product[] = prodData.map((p: any) => {
            const ownPrice = cediPrice(p.price_ghs);
            const variants: Variant[] = (Array.isArray(p.product_variants) ? p.product_variants : [])
                .map((v: any) => ({
                    id: v.id,
                    label: variantLabel(v),
                    // A variant without its own cedi price uses the product's cedi price,
                    // as the online shop does. Never the dollar price.
                    priceGhs: cediPrice(v.price_ghs) ?? ownPrice,
                    quantity: stockNumber(v.quantity),
                    sku: v.sku || null
                }))
                .sort((a: Variant, b: Variant) => a.label.localeCompare(b.label, undefined, { numeric: true }));
            // The category comes back as one object (older code expected a list)
            const category = Array.isArray(p.categories) ? p.categories[0] : p.categories;
            const images = [...(Array.isArray(p.product_images) ? p.product_images : [])]
                .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
            return {
                id: p.id,
                name: p.name,
                priceGhs: ownPrice,
                quantity: variants.length > 0
                    ? variants.reduce((sum, v) => sum + v.quantity, 0)
                    : stockNumber(p.quantity),
                category: category?.name || 'Uncategorized',
                image: images[0]?.url || '/placeholder-product.svg',
                sku: p.sku || '',
                variants
            };
        });
        setProducts(formatted);

        // Extract Categories
        const cats = Array.from(new Set(formatted.map(p => p.category))).sort();
        setCategories(['All', ...cats]);
        return true;
    };

    const loadCustomers = async () => {
        // Customers come from the customers table (not profiles)
        const { data: custData, error: custError } = await supabase
            .from('customers')
            .select('id, full_name, email, phone')
            .order('full_name')
            .limit(200);

        if (custError) {
            console.error('Error fetching POS customers:', custError);
            return;
        }
        if (custData) setCustomers(custData);
    };

    const fetchData = async () => {
        setLoading(true);
        setLoadError(null);
        try {
            const [productsLoaded] = await Promise.all([loadProducts(), loadCustomers()]);
            if (!productsLoaded) setLoadError('Could not load products. Check your connection and try again.');
        } catch (error) {
            console.error('Error fetching POS data:', error);
            setLoadError('Could not load products. Check your connection and try again.');
        } finally {
            setLoading(false);
        }
    };

    // Cart Functions
    const addToCart = (product: Product, variant?: Variant) => {
        const price = variant ? variant.priceGhs : product.priceGhs;
        const itemName = variant ? `${product.name} (${variant.label})` : product.name;
        if (price === null) {
            setNotice(`${itemName} has no cedi price set. Edit the product to add one.`);
            return;
        }

        const stock = variant ? variant.quantity : product.quantity;
        const key = variant ? `${product.id}:${variant.id}` : product.id;
        const alreadyInCart = cart.find(item => item.key === key)?.cartQuantity || 0;
        if (alreadyInCart + 1 > stock) {
            setNotice(stock <= 0
                ? `${itemName} is out of stock.`
                : `Only ${stock} of ${itemName} in stock, and all of them are already in this sale.`);
            return;
        }

        setCart(prev => {
            const existing = prev.find(item => item.key === key);
            if (existing) {
                if (existing.cartQuantity + 1 > stock) return prev;
                return prev.map(item =>
                    item.key === key
                        ? { ...item, cartQuantity: item.cartQuantity + 1, stock, price }
                        : item
                );
            }
            return [...prev, {
                key,
                productId: product.id,
                variantId: variant ? variant.id : null,
                name: product.name,
                variantName: variant ? variant.label : null,
                price,
                stock,
                image: product.image,
                sku: (variant?.sku || product.sku) || null,
                cartQuantity: 1
            }];
        });
    };

    // A product with variants asks which one first; the rest go straight in.
    const handleProductTap = (product: Product) => {
        if (!hasCediPrice(product)) return;
        if (product.variants.length > 0) {
            setVariantPicker(product);
        } else {
            addToCart(product);
        }
    };

    const removeFromCart = (key: string) => {
        setCart(prev => prev.filter(item => item.key !== key));
    };

    const updateQuantity = (key: string, delta: number) => {
        const line = cart.find(item => item.key === key);
        if (!line) return;
        if (delta > 0 && line.cartQuantity + delta > line.stock) {
            const itemName = line.variantName ? `${line.name} (${line.variantName})` : line.name;
            setNotice(`Only ${line.stock} of ${itemName} in stock.`);
            return;
        }
        setCart(prev => prev.map(item => {
            if (item.key === key) {
                const newQty = item.cartQuantity + delta;
                if (newQty > item.stock && delta > 0) return item;
                return newQty > 0 ? { ...item, cartQuantity: newQty } : item;
            }
            return item;
        }));
    };

    const emptyCart = () => setCart([]);

    // Just before charging, read the prices and stock again. The page may have been
    // open for hours while online orders came in or a sale was switched on.
    // Returns a message when the sale cannot go ahead as shown, or null when it can.
    const recheckCart = async (): Promise<string | null> => {
        const productIds = Array.from(new Set(cart.map(item => item.productId)));
        const variantIds = cart.map(item => item.variantId).filter((id): id is string => !!id);

        const { data: freshProducts, error: productsError } = await supabase
            .from('products')
            .select('id, status, quantity, price_ghs')
            .in('id', productIds);
        if (productsError || !freshProducts) {
            return 'Could not check stock before charging. Check your connection and try again.';
        }

        let freshVariants: any[] = [];
        if (variantIds.length > 0) {
            const { data, error: variantsError } = await supabase
                .from('product_variants')
                .select('id, quantity, price_ghs')
                .in('id', variantIds);
            if (variantsError || !data) {
                return 'Could not check stock before charging. Check your connection and try again.';
            }
            freshVariants = data;
        }

        const problems: string[] = [];
        let pricesChanged = false;
        const nextCart: CartItem[] = [];

        for (const item of cart) {
            const itemName = item.variantName ? `${item.name} (${item.variantName})` : item.name;
            const product = freshProducts.find((p: any) => p.id === item.productId);
            const variant = item.variantId ? freshVariants.find((v: any) => v.id === item.variantId) : null;

            if (!product || product.status !== 'active' || (item.variantId && !variant)) {
                problems.push(`${itemName} can no longer be sold (it was removed or switched off). Remove it from this sale.`);
                nextCart.push(item);
                continue;
            }

            const stock = stockNumber(variant ? variant.quantity : product.quantity);
            const price = variant
                ? cediPrice(variant.price_ghs) ?? cediPrice(product.price_ghs)
                : cediPrice(product.price_ghs);

            if (price === null) {
                problems.push(`${itemName} has no cedi price set. Remove it from this sale.`);
                nextCart.push({ ...item, stock });
                continue;
            }
            if (item.cartQuantity > stock) {
                problems.push(stock <= 0
                    ? `${itemName} is now out of stock. Remove it from this sale.`
                    : `Only ${stock} of ${itemName} left in stock. Lower the quantity.`);
            }
            if (price !== item.price) {
                pricesChanged = true;
                problems.push(`The price of ${itemName} is now ${formatMoney(price, 'GHS')}. The total has been updated.`);
            }
            nextCart.push({ ...item, stock, price });
        }

        if (problems.length === 0) return null;

        setCart(nextCart);
        if (pricesChanged) setAmountTendered('');
        return `${problems.join(' ')} Check the sale and charge again.`;
    };

    // Computed
    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                p.sku?.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesCat = activeCategory === 'All' || p.category === activeCategory;
            return matchesSearch && matchesCat;
        });
    }, [products, searchQuery, activeCategory]);

    // Filter customers by search
    const filteredCustomers = useMemo(() => {
        if (!customerSearch.trim()) return customers;
        const q = customerSearch.toLowerCase();
        return customers.filter(c =>
            c.full_name?.toLowerCase().includes(q) ||
            c.email?.toLowerCase().includes(q) ||
            c.phone?.includes(q)
        );
    }, [customers, customerSearch]);

    const cartTotal = Math.round(cart.reduce((sum, item) => sum + (item.price * item.cartQuantity), 0) * 100) / 100;
    const tax = cartTotal * 0.0;
    const grandTotal = cartTotal + tax;
    const changeDue = amountTendered ? (parseFloat(amountTendered) - grandTotal) : 0;

    // Get the customer email and phone for the order
    const getOrderEmail = () => {
        if (selectedCustomer) return selectedCustomer.email;
        return guestDetails.email || 'pos-walkin@store.local';
    };

    const getOrderPhone = () => {
        if (selectedCustomer) return selectedCustomer.phone || '';
        return guestDetails.phone || '';
    };

    const getCustomerFullName = () => {
        if (selectedCustomer) return selectedCustomer.full_name || '';
        return `${guestDetails.firstName} ${guestDetails.lastName}`.trim();
    };

    // Validate before checkout
    const validateCheckout = (): string | null => {
        if (cart.length === 0) return 'Cart is empty';

        if (paymentMethod === 'momo') {
            const phone = getOrderPhone();
            if (!phone) return 'Phone number is required for Mobile Money payment';
        }

        if (paymentMethod === 'cash') {
            const tendered = parseFloat(amountTendered || '0');
            if (tendered < grandTotal) return 'Insufficient amount tendered';
        }

        // For guest, require at least a name or phone
        if (!selectedCustomer) {
            const hasName = guestDetails.firstName.trim() || guestDetails.lastName.trim();
            const hasContact = guestDetails.email.trim() || guestDetails.phone.trim();
            if (!hasName && !hasContact) return 'Please enter customer name or contact info';
        }

        // Require address for doorstep delivery
        if (deliveryMethod === 'doorstep') {
            if (!guestDetails.address.trim()) return 'Delivery address is required';
            if (!guestDetails.city.trim()) return 'City is required for delivery';
            if (!guestDetails.region) return 'Region is required for delivery';
        }

        return null;
    };

    // Checkout Logic
    const handleCheckout = async () => {
        const validationError = validateCheckout();
        if (validationError) {
            setCheckoutError(validationError);
            return;
        }

        if (processing) return;
        setProcessing(true);
        setCheckoutError(null);

        try {
            // Prices and stock as they are right now, not as they were when the page opened
            const cartProblem = await recheckCart();
            if (cartProblem) {
                setCheckoutError(cartProblem);
                return;
            }

            // Things that went wrong after the sale itself was saved. Shown to the cashier.
            const warnings: string[] = [];
            const soldItems = cart;
            const tendered = paymentMethod === 'cash' ? parseFloat(amountTendered || '0') : null;

            const orderNumber = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
            const customerName = getCustomerFullName();
            const customerEmail = getOrderEmail();
            const customerPhone = getOrderPhone();

            const isCashOrCard = paymentMethod === 'cash' || paymentMethod === 'card';

            // Build shipping/billing address
            const addressData = selectedCustomer ? {
                firstName: selectedCustomer.full_name?.split(' ')[0] || '',
                lastName: selectedCustomer.full_name?.split(' ').slice(1).join(' ') || '',
                email: selectedCustomer.email,
                phone: selectedCustomer.phone || '',
                address: guestDetails.address,
                city: guestDetails.city,
                region: guestDetails.region,
                pos_sale: true
            } : {
                firstName: guestDetails.firstName,
                lastName: guestDetails.lastName,
                email: guestDetails.email,
                phone: guestDetails.phone,
                address: guestDetails.address,
                city: guestDetails.city,
                region: guestDetails.region,
                pos_sale: true
            };

            // 1. Create Order
            const { data: order, error: orderError } = await supabase
                .from('orders')
                .insert([{
                    order_number: orderNumber,
                    user_id: null,
                    email: customerEmail,
                    phone: customerPhone,
                    status: isCashOrCard ? 'processing' : 'pending',
                    payment_status: isCashOrCard ? 'paid' : 'pending',
                    currency: 'GHS',
                    subtotal: cartTotal,
                    tax_total: tax,
                    shipping_total: 0,
                    discount_total: 0,
                    total: grandTotal,
                    shipping_method: deliveryMethod,
                    payment_method: paymentMethod === 'momo' ? 'moolre' : paymentMethod,
                    shipping_address: addressData,
                    billing_address: addressData,
                    metadata: {
                        pos_sale: true,
                        first_name: addressData.firstName,
                        last_name: addressData.lastName,
                        phone: customerPhone
                    }
                }])
                .select()
                .single();

            if (orderError || !order) {
                throw new Error(`The sale was not saved: ${orderError?.message || 'no answer from the shop'}. No order was created. Try again.`);
            }

            // 2. Create Order Items (with product_name, the chosen variant, unit_price, total_price)
            const orderItems = soldItems.map(item => ({
                order_id: order.id,
                product_id: item.productId,
                variant_id: item.variantId,
                product_name: item.name,
                variant_name: item.variantName,
                sku: item.sku,
                quantity: item.cartQuantity,
                unit_price: item.price,
                total_price: Math.round(item.price * item.cartQuantity * 100) / 100,
                metadata: { image: item.image, pos_sale: true }
            }));

            const { error: itemsError } = await supabase
                .from('order_items')
                .insert(orderItems);

            if (itemsError) {
                // Do not leave a paid order with nothing in it behind
                const { error: cleanupError } = await supabase.from('orders').delete().eq('id', order.id);
                throw new Error(cleanupError
                    ? `The sale was not saved: ${itemsError.message}. An empty order ${orderNumber} was left behind. Cancel it on the Orders page, then try again.`
                    : `The sale was not saved: ${itemsError.message}. No order was created. Try again.`);
            }

            // 3. Upsert Customer Record (email is required in customers table)
            const hasRealEmail = customerEmail && customerEmail !== 'pos-walkin@store.local';
            const upsertEmail = hasRealEmail
                ? customerEmail
                : customerPhone
                    ? `${customerPhone.replace(/[^0-9]/g, '')}@pos.local`
                    : null;

            // The email the customer is filed under, for their order count and total spent
            let statsEmail: string | null = null;

            if (upsertEmail) {
                const { data: customerId, error: customerError } = await supabase.rpc('upsert_customer_from_order', {
                    p_email: upsertEmail,
                    p_phone: customerPhone || null,
                    p_full_name: customerName || null,
                    p_first_name: addressData.firstName || null,
                    p_last_name: addressData.lastName || null,
                    p_user_id: null,
                    p_address: addressData
                });
                if (customerError) {
                    console.error('Customer upsert error:', customerError);
                    warnings.push('Sale saved, but the customer was not added to the customer list. Add them by hand on the Customers page.');
                } else {
                    statsEmail = upsertEmail;
                    // A returning customer may be filed under another email (matched by phone)
                    if (customerId) {
                        const { data: customerRow, error: customerRowError } = await supabase
                            .from('customers')
                            .select('email')
                            .eq('id', customerId)
                            .maybeSingle();
                        if (!customerRowError && customerRow?.email) statsEmail = customerRow.email;
                    }
                    // Refresh customer list silently
                    loadCustomers();
                }
            }

            // 4. If Cash or Card — the order is already paid; reduce stock
            if (isCashOrCard) {
                // mark_order_paid reduces stock for a paid order that has not had its
                // stock reduced yet (uses order_number as order_ref)
                const { data: paidOrder, error: stockError } = await supabase.rpc('mark_order_paid', {
                    order_ref: orderNumber,
                    moolre_ref: `POS-${paymentMethod.toUpperCase()}-${Date.now()}`
                });
                // The function answers with the order; metadata.stock_reduced says the stock was taken off.
                const stockReduced = !stockError && !!paidOrder && paidOrder.metadata?.stock_reduced === true;
                if (!stockReduced) {
                    console.error('Stock reduction failed:', stockError || paidOrder);
                    warnings.push('Sale saved, but stock was not updated. Adjust stock by hand.');
                }

                if (statsEmail) {
                    const { error: statsError } = await supabase.rpc('update_customer_stats', {
                        p_customer_email: statsEmail,
                        p_order_total: grandTotal
                    });
                    if (statsError) {
                        console.error('Customer stats error:', statsError);
                        warnings.push('Sale saved, but the customer\'s order count and total spent were not updated.');
                    }
                }

                // Success — show completed
                setCompletedOrder({
                    id: order.id,
                    orderNumber,
                    createdAt: order.created_at || new Date().toISOString(),
                    items: soldItems,
                    subtotal: cartTotal,
                    total: grandTotal,
                    paymentMethod,
                    paymentPending: false,
                    tendered,
                    change: tendered !== null ? Math.max(0, Math.round((tendered - grandTotal) * 100) / 100) : 0,
                    customerName,
                    warnings
                });
                setCart([]);
                // Show the new stock levels on the product tiles
                loadProducts();

                // Send notification
                if (customerEmail && customerEmail !== 'pos-walkin@store.local') {
                    const { data: { session } } = await supabase.auth.getSession();
                    fetch('/api/notifications', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(session?.access_token && { 'Authorization': `Bearer ${session.access_token}` })
                        },
                        body: JSON.stringify({
                            type: 'order_created',
                            payload: {
                                ...order,
                                order_number: orderNumber,
                                email: customerEmail,
                                shipping_address: addressData
                            }
                        })
                    }).catch(err => console.error('POS Notification error:', err));
                }
            }

            // 5. If Momo — initiate Moolre payment
            if (paymentMethod === 'momo') {
                const paymentRes = await fetch('/api/payment/moolre', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId: orderNumber,
                        amount: grandTotal,
                        customerEmail: customerEmail
                    })
                });

                const paymentResult = await paymentRes.json();

                if (!paymentResult.success) {
                    throw new Error(paymentResult.message || 'Failed to initiate Mobile Money payment');
                }

                // Show completed with payment link
                setCompletedOrder({
                    id: order.id,
                    orderNumber,
                    createdAt: order.created_at || new Date().toISOString(),
                    items: soldItems,
                    subtotal: cartTotal,
                    total: grandTotal,
                    paymentMethod,
                    paymentPending: true,
                    paymentUrl: paymentResult.url,
                    tendered: null,
                    change: 0,
                    customerName,
                    warnings
                });
                setCart([]);
            }

        } catch (error: any) {
            console.error('Checkout failed:', error);
            setCheckoutError(error.message || 'Checkout failed. Please try again.');
        } finally {
            setProcessing(false);
        }
    };

    const resetCheckout = () => {
        setShowCheckoutModal(false);
        setCompletedOrder(null);
        setAmountTendered('');
        setSelectedCustomer(null);
        setCustomerSearch('');
        setCheckoutError(null);
        setPaymentMethod('cash');
        setDeliveryMethod('pickup');
        setGuestDetails({
            firstName: '',
            lastName: '',
            email: '',
            phone: '',
            address: '',
            city: '',
            region: ''
        });
    };

    return (
        <div className="flex flex-col lg:flex-row h-[calc(100vh-90px)] -m-4 lg:-m-6 overflow-hidden bg-gray-100 relative">

            {/* LEFT: Product Grid */}
            <div className={`flex-1 flex flex-col h-full min-w-0 ${isMobileCartOpen ? 'hidden lg:flex' : 'flex'}`}>
                {/* Header / Search */}
                <div className="bg-white p-4 border-b border-gray-200 flex items-center justify-between space-x-4 shrink-0">
                    <div className="relative flex-1 max-w-lg">
                        <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"></i>
                        <input
                            type="text"
                            placeholder="Search products..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                            autoFocus
                        />
                    </div>
                    <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar">
                        {categories.map(cat => (
                            <button
                                key={cat}
                                onClick={() => setActiveCategory(cat)}
                                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${activeCategory === cat
                                    ? 'bg-blue-700 text-white shadow-md'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Grid Area */}
                <div className="flex-1 overflow-y-auto p-4 content-start">
                    {loading ? (
                        <div className="flex items-center justify-center h-full text-gray-500">Loading products...</div>
                    ) : loadError ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-600 text-center">
                            <i className="ri-error-warning-line text-4xl mb-2 text-red-500"></i>
                            <p className="font-medium">{loadError}</p>
                            <button
                                type="button"
                                onClick={fetchData}
                                className="mt-4 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-lg text-sm font-semibold"
                            >
                                Try again
                            </button>
                        </div>
                    ) : filteredProducts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <i className="ri-inbox-line text-4xl mb-2"></i>
                            <p>No products found</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 pb-20 lg:pb-4">
                            {filteredProducts.map(product => {
                                const priced = hasCediPrice(product);
                                const inStock = product.quantity > 0;
                                const sellable = priced && inStock;
                                return (
                                    <div
                                        key={product.id}
                                        onClick={() => {
                                            if (sellable) handleProductTap(product);
                                            else if (priced) setNotice(`${product.name} is out of stock.`);
                                        }}
                                        className={`bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100 group flex flex-col h-full ${sellable ? 'hover:shadow-md transition-shadow cursor-pointer' : ''}`}
                                    >
                                        <div className="aspect-square relative bg-gray-50 shrink-0">
                                            <img
                                                src={product.image}
                                                alt={product.name}
                                                className={`w-full h-full object-cover ${sellable ? 'group-hover:scale-105 transition-transform duration-300' : 'opacity-50'}`}
                                            />
                                            <div className={`absolute top-2 right-2 text-white text-xs px-2 py-1 rounded-full backdrop-blur-sm ${inStock ? 'bg-black/60' : 'bg-red-600/90'}`}>
                                                {inStock ? `Qty: ${product.quantity}` : 'Out of stock'}
                                            </div>
                                        </div>
                                        <div className="p-3 flex flex-col flex-1">
                                            <h3 className="text-sm font-semibold text-gray-900 line-clamp-2 mb-auto">{product.name}</h3>
                                            {priced ? (
                                                <div className="flex items-center justify-between mt-2 pt-2">
                                                    <div>
                                                        <span className="text-blue-700 font-bold">{tilePrice(product)}</span>
                                                        {product.variants.length > 0 && (
                                                            <span className="block text-xs text-gray-500">{product.variants.length} options</span>
                                                        )}
                                                    </div>
                                                    {sellable && (
                                                        <button className="w-8 h-8 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center group-hover:bg-blue-700 group-hover:text-white transition-colors">
                                                            <i className="ri-add-line"></i>
                                                        </button>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="mt-2 pt-2">
                                                    <p className="text-sm font-semibold text-amber-700">No cedi price set</p>
                                                    <Link
                                                        href={`/admin/products/${product.id}`}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="text-xs font-medium text-blue-700 hover:text-blue-800 underline"
                                                    >
                                                        Edit product
                                                    </Link>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Mobile Bottom Cart Bar */}
                {cart.length > 0 && (
                    <div className="lg:hidden p-4 border-t border-gray-200 bg-white fixed bottom-0 left-0 right-0 z-30 shadow-2xl safe-area-bottom">
                        <button
                            onClick={() => setIsMobileCartOpen(true)}
                            className="w-full py-3 bg-blue-700 text-white rounded-xl font-bold flex justify-between px-6 shadow-lg active:scale-95 transition-transform"
                        >
                            <span className="flex items-center text-sm">
                                <span className="bg-white/20 px-2 py-0.5 rounded mr-2">{cart.reduce((a, b) => a + b.cartQuantity, 0)}</span>
                                Items
                            </span>
                            <span>View Cart</span>
                            <span>{formatMoney(grandTotal, 'GHS')}</span>
                        </button>
                    </div>
                )}
            </div>

            {/* RIGHT: Cart Panel */}
            <div className={`w-full lg:w-96 bg-white border-l border-gray-200 flex flex-col h-full shadow-lg z-20 absolute inset-0 lg:relative ${isMobileCartOpen ? 'flex' : 'hidden lg:flex'}`}>
                <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 shrink-0">
                    <div className="flex items-center">
                        <button onClick={() => setIsMobileCartOpen(false)} className="lg:hidden mr-3 p-2 -ml-2 text-gray-600 hover:bg-gray-200 rounded-full transition-colors">
                            <i className="ri-arrow-left-line text-xl"></i>
                        </button>
                        <h2 className="text-lg font-bold text-gray-900 flex items-center">
                            <i className="ri-shopping-basket-2-line mr-2"></i>
                            Current Order
                        </h2>
                    </div>
                    <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">
                        {cart.reduce((a, b) => a + b.cartQuantity, 0)} Items
                    </span>
                </div>

                {/* Cart Items */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {cart.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
                            <i className="ri-shopping-cart-line text-5xl opacity-20"></i>
                            <p className="text-sm">Cart is empty</p>
                            <button onClick={() => setIsMobileCartOpen(false)} className="lg:hidden text-blue-600 font-medium hover:underline">
                                Start Adding Products
                            </button>
                        </div>
                    ) : (
                        cart.map(item => (
                            <div key={item.key} className="flex gap-3 p-3 bg-gray-50 rounded-lg group hover:bg-gray-100 transition-colors">
                                <div className="w-16 h-16 bg-white rounded-md overflow-hidden flex-shrink-0 border border-gray-200">
                                    <img src={item.image} className="w-full h-full object-cover" alt="" />
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col justify-between">
                                    <div className="flex justify-between items-start">
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-gray-900 line-clamp-1">{item.name}</p>
                                            {item.variantName && (
                                                <p className="text-xs text-gray-600 line-clamp-1">{item.variantName}</p>
                                            )}
                                        </div>
                                        <button onClick={() => removeFromCart(item.key)} className="text-gray-400 hover:text-red-500">
                                            <i className="ri-delete-bin-line"></i>
                                        </button>
                                    </div>
                                    <div className="flex items-center justify-between mt-2">
                                        <div className="flex items-center space-x-2 bg-white rounded border border-gray-200 px-1 py-0.5">
                                            <button onClick={() => updateQuantity(item.key, -1)} className="w-6 h-6 flex items-center justify-center text-gray-500 hover:bg-gray-100 rounded">
                                                <i className="ri-subtract-line text-xs"></i>
                                            </button>
                                            <span className="text-sm font-semibold w-6 text-center">{item.cartQuantity}</span>
                                            <button
                                                onClick={() => updateQuantity(item.key, 1)}
                                                className={`w-6 h-6 flex items-center justify-center rounded ${item.cartQuantity >= item.stock ? 'text-gray-300' : 'text-gray-500 hover:bg-gray-100'}`}
                                            >
                                                <i className="ri-add-line text-xs"></i>
                                            </button>
                                        </div>
                                        <p className="text-sm font-bold text-gray-900">{formatMoney(item.price * item.cartQuantity, 'GHS')}</p>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Cart Footer */}
                <div className="p-4 bg-gray-50 border-t border-gray-200 space-y-4 shrink-0 safe-area-bottom">
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between text-gray-600">
                            <span>Subtotal</span>
                            <span>{formatMoney(cartTotal, 'GHS')}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                            <span>Tax (0%)</span>
                            <span>{formatMoney(0, 'GHS')}</span>
                        </div>
                        <div className="flex justify-between text-xl font-bold text-gray-900 pt-2 border-t border-gray-200 mt-2">
                            <span>Total</span>
                            <span>{formatMoney(grandTotal, 'GHS')}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={emptyCart}
                            disabled={cart.length === 0}
                            className="px-4 py-3 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Clear
                        </button>
                        <button
                            onClick={() => { setShowCheckoutModal(true); setCheckoutError(null); }}
                            disabled={cart.length === 0}
                            className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold text-sm shadow-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Charge {formatMoney(grandTotal, 'GHS')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Checkout Modal */}
            {showCheckoutModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        {completedOrder ? (
                            // SUCCESS STATE
                            <div className="p-8 text-center flex flex-col items-center justify-center space-y-6 overflow-y-auto">
                                <div className={`w-20 h-20 rounded-full flex items-center justify-center ${completedOrder.paymentPending ? 'bg-amber-100' : 'bg-blue-100'}`}>
                                    <i className={`text-5xl ${completedOrder.paymentPending ? 'ri-time-line text-amber-600' : 'ri-checkbox-circle-fill text-blue-600'}`}></i>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900">
                                        {completedOrder.paymentPending ? 'Payment Link Generated!' : 'Payment Successful!'}
                                    </h2>
                                    <p className="text-gray-500 mt-1">Order #{completedOrder.orderNumber}</p>
                                    <p className="text-gray-900 font-semibold mt-1">{formatMoney(completedOrder.total, 'GHS')}</p>

                                    {!completedOrder.paymentPending && completedOrder.paymentMethod === 'cash' && completedOrder.change > 0 && (
                                        <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-3">
                                            <p className="text-sm text-blue-700">Change Due</p>
                                            <p className="text-2xl font-bold text-blue-800">{formatMoney(completedOrder.change, 'GHS')}</p>
                                        </div>
                                    )}

                                    {completedOrder.warnings.length > 0 && (
                                        <div role="alert" className="mt-3 bg-amber-50 border border-amber-300 rounded-lg p-3 text-left space-y-1">
                                            {completedOrder.warnings.map((warning) => (
                                                <p key={warning} className="text-sm font-medium text-amber-900 flex items-start">
                                                    <i className="ri-alert-line mr-2 mt-0.5"></i>
                                                    <span>{warning}</span>
                                                </p>
                                            ))}
                                        </div>
                                    )}

                                    {completedOrder.paymentPending && completedOrder.paymentUrl && (
                                        <div className="mt-4 space-y-3">
                                            <p className="text-sm text-gray-600">
                                                Customer can pay using this link:
                                            </p>
                                            <a
                                                href={completedOrder.paymentUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center px-6 py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 transition-colors"
                                            >
                                                <i className="ri-external-link-line mr-2"></i>
                                                Open Payment Page
                                            </a>
                                            <div className="mt-2">
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(completedOrder.paymentUrl || '');
                                                        alert('Payment link copied!');
                                                    }}
                                                    className="text-sm text-blue-700 hover:text-blue-800 font-medium underline"
                                                >
                                                    <i className="ri-file-copy-line mr-1"></i>
                                                    Copy Link
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-4 w-full mt-4">
                                    <button onClick={() => window.print()} className="py-3 px-4 border border-gray-300 rounded-xl font-semibold hover:bg-gray-50 transition-colors">
                                        <i className="ri-printer-line mr-2"></i>
                                        Print Receipt
                                    </button>
                                    <button onClick={resetCheckout} className="py-3 px-4 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors">
                                        New Order
                                    </button>
                                </div>
                            </div>
                        ) : (
                            // CHECKOUT FORM
                            <>
                                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                                    <h3 className="text-xl font-bold text-gray-900">Finalize Payment</h3>
                                    <button onClick={() => setShowCheckoutModal(false)} className="w-8 h-8 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-500">
                                        <i className="ri-close-line text-xl"></i>
                                    </button>
                                </div>

                                <div className="p-6 space-y-6 overflow-y-auto">
                                    {/* Error Display */}
                                    {checkoutError && (
                                        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start space-x-2">
                                            <i className="ri-error-warning-line text-red-500 mt-0.5"></i>
                                            <p className="text-sm text-red-700">{checkoutError}</p>
                                        </div>
                                    )}

                                    {/* Total Display */}
                                    <div className="text-center py-4 bg-blue-50 rounded-xl border border-blue-100">
                                        <p className="text-sm text-blue-800 uppercase tracking-wide font-semibold">Amount to Pay</p>
                                        <p className="text-4xl font-extrabold text-blue-700 mt-1">{formatMoney(grandTotal, 'GHS')}</p>
                                    </div>

                                    {/* Customer Select */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Customer</label>

                                        {/* Customer search input */}
                                        <div className="relative mb-2">
                                            <i className="ri-search-line absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i>
                                            <input
                                                type="text"
                                                placeholder="Search customers by name, email, or phone..."
                                                value={customerSearch}
                                                onChange={(e) => setCustomerSearch(e.target.value)}
                                                className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                                            />
                                        </div>

                                        <select
                                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none mb-2"
                                            onChange={(e) => {
                                                setSelectedCustomer(customers.find(c => c.id === e.target.value) || null);
                                            }}
                                            value={selectedCustomer?.id || ''}
                                        >
                                            <option value="">Walk-in Customer / New Guest</option>
                                            {filteredCustomers.map(c => (
                                                <option key={c.id} value={c.id}>
                                                    {c.full_name || 'No Name'} — {c.phone || c.email}
                                                </option>
                                            ))}
                                        </select>

                                        {selectedCustomer && (
                                            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2 flex items-center justify-between">
                                                <div>
                                                    <p className="font-semibold text-gray-900 text-sm">{selectedCustomer.full_name}</p>
                                                    <p className="text-xs text-gray-600">{selectedCustomer.email} {selectedCustomer.phone && `| ${selectedCustomer.phone}`}</p>
                                                </div>
                                                <button
                                                    onClick={() => setSelectedCustomer(null)}
                                                    className="text-gray-400 hover:text-red-500 text-sm"
                                                >
                                                    <i className="ri-close-line"></i>
                                                </button>
                                            </div>
                                        )}

                                        {!selectedCustomer && (
                                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mt-2 space-y-3">
                                                <h4 className="text-sm font-bold text-gray-900 border-b border-gray-200 pb-2 mb-2">
                                                    New Customer Details
                                                    <span className="text-xs font-normal text-gray-500 ml-2">(will be saved to customer list)</span>
                                                </h4>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <input
                                                        type="text"
                                                        placeholder="First Name *"
                                                        value={guestDetails.firstName}
                                                        onChange={e => setGuestDetails({ ...guestDetails, firstName: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                                    />
                                                    <input
                                                        type="text"
                                                        placeholder="Last Name"
                                                        value={guestDetails.lastName}
                                                        onChange={e => setGuestDetails({ ...guestDetails, lastName: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                                    />
                                                </div>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <input
                                                        type="email"
                                                        placeholder="Email"
                                                        value={guestDetails.email}
                                                        onChange={e => setGuestDetails({ ...guestDetails, email: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                                    />
                                                    <input
                                                        type="tel"
                                                        placeholder={paymentMethod === 'momo' ? 'Phone (Required) *' : 'Phone'}
                                                        value={guestDetails.phone}
                                                        onChange={e => setGuestDetails({ ...guestDetails, phone: e.target.value })}
                                                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm ${paymentMethod === 'momo' && !guestDetails.phone ? 'border-amber-400 bg-amber-50' : 'border-gray-300'
                                                            }`}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Delivery Method */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Delivery Method</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <button
                                                onClick={() => setDeliveryMethod('pickup')}
                                                className={`p-3 rounded-lg border transition-all flex items-center space-x-3 ${deliveryMethod === 'pickup'
                                                    ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                <i className={`ri-store-2-line text-xl ${deliveryMethod === 'pickup' ? 'text-blue-700' : 'text-gray-400'}`}></i>
                                                <div className="text-left">
                                                    <p className={`text-sm font-semibold ${deliveryMethod === 'pickup' ? 'text-blue-800' : 'text-gray-700'}`}>Store Pickup</p>
                                                    <p className="text-xs text-gray-500">Customer picks up</p>
                                                </div>
                                            </button>
                                            <button
                                                onClick={() => setDeliveryMethod('doorstep')}
                                                className={`p-3 rounded-lg border transition-all flex items-center space-x-3 ${deliveryMethod === 'doorstep'
                                                    ? 'border-blue-600 bg-blue-50 ring-1 ring-blue-600'
                                                    : 'border-gray-200 hover:border-gray-300'
                                                    }`}
                                            >
                                                <i className={`ri-truck-line text-xl ${deliveryMethod === 'doorstep' ? 'text-blue-700' : 'text-gray-400'}`}></i>
                                                <div className="text-left">
                                                    <p className={`text-sm font-semibold ${deliveryMethod === 'doorstep' ? 'text-blue-800' : 'text-gray-700'}`}>Doorstep Delivery</p>
                                                    <p className="text-xs text-gray-500">Deliver to address</p>
                                                </div>
                                            </button>
                                        </div>

                                        {/* Delivery Address (shown for doorstep delivery) */}
                                        {deliveryMethod === 'doorstep' && (
                                            <div className="mt-3 bg-blue-50 p-4 rounded-lg border border-blue-200 space-y-3">
                                                <h4 className="text-sm font-bold text-gray-900 flex items-center">
                                                    <i className="ri-map-pin-line mr-2 text-blue-600"></i>
                                                    Delivery Address
                                                </h4>
                                                <input
                                                    type="text"
                                                    placeholder="Street Address / Location *"
                                                    value={guestDetails.address}
                                                    onChange={e => setGuestDetails({ ...guestDetails, address: e.target.value })}
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                                />
                                                <div className="grid grid-cols-2 gap-3">
                                                    <input
                                                        type="text"
                                                        placeholder="City / Town *"
                                                        value={guestDetails.city}
                                                        onChange={e => setGuestDetails({ ...guestDetails, city: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                                    />
                                                    <select
                                                        value={guestDetails.region}
                                                        onChange={e => setGuestDetails({ ...guestDetails, region: e.target.value })}
                                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                                    >
                                                        <option value="">Select Region *</option>
                                                        {ghanaRegions.map(r => (
                                                            <option key={r} value={r}>{r}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Payment Method */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-2">Payment Method</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {[
                                                { key: 'cash', label: 'Cash', icon: 'ri-money-cny-circle-line' },
                                                { key: 'card', label: 'Card', icon: 'ri-bank-card-line' },
                                                { key: 'momo', label: 'MoMo', icon: 'ri-smartphone-line' }
                                            ].map(method => (
                                                <button
                                                    key={method.key}
                                                    onClick={() => setPaymentMethod(method.key)}
                                                    className={`py-3 rounded-lg font-medium border transition-all flex flex-col items-center space-y-1 ${paymentMethod === method.key
                                                        ? 'border-blue-600 bg-blue-50 text-blue-800 ring-1 ring-blue-600'
                                                        : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                                        }`}
                                                >
                                                    <i className={`${method.icon} text-xl`}></i>
                                                    <span className="text-sm">{method.label}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Cash Tendered */}
                                    {paymentMethod === 'cash' && (
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">Amount Tendered</label>
                                            <div className="relative">
                                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 font-bold">GH₵</span>
                                                <input
                                                    type="number"
                                                    value={amountTendered}
                                                    onChange={(e) => setAmountTendered(e.target.value)}
                                                    className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold text-lg"
                                                    placeholder="0.00"
                                                    autoFocus
                                                />
                                            </div>
                                            {changeDue > 0 && (
                                                <p className="text-right text-blue-600 font-bold mt-2">Change: {formatMoney(changeDue, 'GHS')}</p>
                                            )}
                                            {changeDue < 0 && amountTendered && (
                                                <p className="text-right text-red-500 font-medium mt-2">Insufficient amount</p>
                                            )}
                                            {/* Quick amount buttons */}
                                            <div className="flex flex-wrap gap-2 mt-3">
                                                {[grandTotal, Math.ceil(grandTotal / 10) * 10, Math.ceil(grandTotal / 50) * 50, Math.ceil(grandTotal / 100) * 100].filter((v, i, a) => a.indexOf(v) === i).map(amount => (
                                                    <button
                                                        key={amount}
                                                        onClick={() => setAmountTendered(amount.toString())}
                                                        className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                                                    >
                                                        {formatMoney(amount, 'GHS')}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* MoMo info */}
                                    {paymentMethod === 'momo' && (
                                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                            <div className="flex items-start space-x-2">
                                                <i className="ri-information-line text-amber-600 mt-0.5"></i>
                                                <div className="text-sm text-amber-800">
                                                    <p className="font-semibold">Mobile Money Payment</p>
                                                    <p className="mt-1">A Moolre payment link will be generated. The customer can pay via their phone, or you can open the link on your device.</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Card info */}
                                    {paymentMethod === 'card' && (
                                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                            <div className="flex items-start space-x-2">
                                                <i className="ri-bank-card-line text-blue-600 mt-0.5"></i>
                                                <div className="text-sm text-blue-800">
                                                    <p className="font-semibold">Card Payment</p>
                                                    <p className="mt-1">Process the card payment on your POS terminal, then tap &quot;Complete Payment&quot; to confirm.</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="p-6 border-t border-gray-100 bg-gray-50 shrink-0">
                                    <button
                                        onClick={handleCheckout}
                                        disabled={processing}
                                        className="w-full py-4 bg-gray-900 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center space-x-2"
                                    >
                                        {processing ? (
                                            <>
                                                <i className="ri-loader-4-line animate-spin"></i>
                                                <span>Processing...</span>
                                            </>
                                        ) : paymentMethod === 'momo' ? (
                                            <>
                                                <i className="ri-smartphone-line"></i>
                                                <span>Generate Payment Link</span>
                                            </>
                                        ) : (
                                            <>
                                                <i className="ri-secure-payment-line"></i>
                                                <span>Complete Payment</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Variant picker: which colour / size is being sold */}
            {variantPicker && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setVariantPicker(null)}
                >
                    <div
                        className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-5 border-b border-gray-100 flex justify-between items-start bg-gray-50 shrink-0">
                            <div className="min-w-0 pr-3">
                                <h3 className="text-lg font-bold text-gray-900 line-clamp-2">{variantPicker.name}</h3>
                                <p className="text-sm text-gray-600 mt-0.5">Choose the colour / size being sold</p>
                            </div>
                            <button
                                onClick={() => setVariantPicker(null)}
                                aria-label="Close"
                                className="w-8 h-8 shrink-0 rounded-full hover:bg-gray-200 flex items-center justify-center text-gray-500"
                            >
                                <i className="ri-close-line text-xl"></i>
                            </button>
                        </div>

                        <div className="p-4 space-y-2 overflow-y-auto">
                            {variantPicker.variants.map(variant => {
                                const inSale = cart.find(item => item.key === `${variantPicker.id}:${variant.id}`)?.cartQuantity || 0;
                                const noPrice = variant.priceGhs === null;
                                const left = variant.quantity - inSale;
                                const blocked = noPrice || left <= 0;
                                const stockNote = noPrice
                                    ? 'No cedi price set'
                                    : variant.quantity <= 0
                                        ? 'Out of stock'
                                        : left <= 0
                                            ? `All ${variant.quantity} in stock are already in this sale`
                                            : `${variant.quantity} in stock${inSale > 0 ? `, ${inSale} already in this sale` : ''}`;
                                return (
                                    <button
                                        key={variant.id}
                                        type="button"
                                        disabled={blocked}
                                        onClick={() => {
                                            addToCart(variantPicker, variant);
                                            setVariantPicker(null);
                                        }}
                                        className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border text-left transition-colors ${blocked
                                            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
                                            : 'border-gray-200 hover:border-blue-600 hover:bg-blue-50'
                                            }`}
                                    >
                                        <div className="min-w-0">
                                            <p className={`text-sm font-semibold ${blocked ? 'text-gray-500' : 'text-gray-900'}`}>{variant.label}</p>
                                            <p className={`text-xs mt-0.5 ${noPrice ? 'text-amber-700 font-semibold' : variant.quantity <= 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>
                                                {stockNote}
                                            </p>
                                        </div>
                                        {!noPrice && (
                                            <span className={`font-bold whitespace-nowrap ${blocked ? 'text-gray-500' : 'text-blue-700'}`}>
                                                {formatMoney(variant.priceGhs, 'GHS')}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {variantPicker.variants.some(v => v.priceGhs === null) && (
                            <div className="p-4 border-t border-amber-200 bg-amber-50 text-sm text-amber-900 shrink-0">
                                Options with no cedi price cannot be sold at the till.{' '}
                                <Link href={`/admin/products/${variantPicker.id}`} className="font-semibold text-blue-700 hover:text-blue-800 underline">
                                    Edit product
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Short message for the cashier (stock limit, missing price) */}
            {notice && (
                <div
                    role="status"
                    className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md bg-amber-50 border border-amber-300 text-amber-900 rounded-lg shadow-lg px-4 py-3 flex items-start space-x-2"
                >
                    <i className="ri-alert-line mt-0.5"></i>
                    <p className="text-sm font-medium flex-1">{notice}</p>
                    <button onClick={() => setNotice(null)} aria-label="Dismiss" className="text-amber-700 hover:text-amber-900">
                        <i className="ri-close-line"></i>
                    </button>
                </div>
            )}

            {/* Receipt. Hidden on screen; when printing, it is the only thing on the page. */}
            {completedOrder && typeof document !== 'undefined' && createPortal(
                <div id="pos-receipt">
                    <style>{`
                        #pos-receipt { display: none; }
                        @media print {
                            @page { margin: 8mm; }
                            body > *:not(#pos-receipt) { display: none !important; }
                            #pos-receipt {
                                display: block !important;
                                width: 100%;
                                max-width: 80mm;
                                margin: 0 auto;
                                color: #000;
                                background: #fff;
                                font-family: ui-monospace, Menlo, Consolas, monospace;
                                font-size: 12px;
                                line-height: 1.45;
                            }
                            #pos-receipt .r-center { text-align: center; }
                            #pos-receipt .r-title { font-size: 18px; font-weight: 700; letter-spacing: 1px; }
                            #pos-receipt .r-rule { border-top: 1px dashed #000; margin: 6px 0; }
                            #pos-receipt .r-row { display: flex; justify-content: space-between; gap: 8px; }
                            #pos-receipt .r-row span:last-child { text-align: right; white-space: nowrap; }
                            #pos-receipt .r-line { margin-bottom: 4px; break-inside: avoid; }
                            #pos-receipt .r-sub { padding-left: 8px; }
                            #pos-receipt .r-total { font-size: 14px; font-weight: 700; }
                            #pos-receipt .r-thanks { margin-top: 10px; }
                        }
                    `}</style>
                    <div className="r-center r-title">BADDIECURVES</div>
                    <div className="r-center">Sales receipt</div>
                    <div className="r-rule"></div>
                    <div className="r-row"><span>Order</span><span>{completedOrder.orderNumber}</span></div>
                    <div className="r-row">
                        <span>Date</span>
                        <span>{new Date(completedOrder.createdAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                    </div>
                    {completedOrder.customerName && (
                        <div className="r-row"><span>Customer</span><span>{completedOrder.customerName}</span></div>
                    )}
                    <div className="r-rule"></div>
                    {completedOrder.items.map(item => (
                        <div key={item.key} className="r-line">
                            <div>{item.name}</div>
                            {item.variantName && <div className="r-sub">{item.variantName}</div>}
                            <div className="r-row">
                                <span>{item.cartQuantity} x {formatMoney(item.price, 'GHS')}</span>
                                <span>{formatMoney(item.price * item.cartQuantity, 'GHS')}</span>
                            </div>
                        </div>
                    ))}
                    <div className="r-rule"></div>
                    <div className="r-row"><span>Subtotal</span><span>{formatMoney(completedOrder.subtotal, 'GHS')}</span></div>
                    <div className="r-row r-total"><span>Total</span><span>{formatMoney(completedOrder.total, 'GHS')}</span></div>
                    <div className="r-rule"></div>
                    <div className="r-row">
                        <span>Payment</span>
                        <span>
                            {PAYMENT_LABELS[completedOrder.paymentMethod] || completedOrder.paymentMethod}
                            {completedOrder.paymentPending ? ' (not yet paid)' : ''}
                        </span>
                    </div>
                    {completedOrder.tendered !== null && (
                        <>
                            <div className="r-row"><span>Cash received</span><span>{formatMoney(completedOrder.tendered, 'GHS')}</span></div>
                            <div className="r-row"><span>Change</span><span>{formatMoney(completedOrder.change, 'GHS')}</span></div>
                        </>
                    )}
                    <div className="r-center r-thanks">Thank you for shopping with us.</div>
                </div>,
                document.body
            )}
        </div>
    );
}
