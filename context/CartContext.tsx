'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useIsGhana } from '@/lib/currency';
import { formatMoney } from '@/lib/format-money';
import type { Market } from '@/lib/market';

export type CartItem = {
    /** Product id. */
    id: string;
    /** The exact variant chosen, when the product has variants. */
    variantId?: string | null;
    name: string;
    /** Unit price in `currency`. Kept current by the server (see refresh below). */
    price: number;
    /** The currency `price` is in. Items saved before this existed have none and are re-priced on load. */
    currency?: Market;
    image: string;
    quantity: number;
    /** Variant label shown to the shopper, e.g. "Black / M". */
    variant?: string;
    slug: string;
    maxStock: number;
    moq?: number; // Minimum Order Quantity
    /** Why this line cannot be bought right now (sold out, removed, ...). */
    problem?: string | null;
};

type CartContextType = {
    cart: CartItem[];
    addToCart: (item: CartItem) => void;
    removeFromCart: (itemId: string, variant?: string) => void;
    updateQuantity: (itemId: string, quantity: number, variant?: string) => void;
    clearCart: () => void;
    cartCount: number;
    subtotal: number;
    isCartOpen: boolean;
    setIsCartOpen: (isOpen: boolean) => void;
    /** The market every cart amount is in: cedis in Ghana, dollars elsewhere. */
    currency: Market;
    /** Formats a cart amount in the cart's currency. Use this for anything from the cart. */
    formatCartMoney: (amount: number) => string;
    /** Discount code typed in the cart, carried to checkout. */
    couponCode: string;
    setCouponCode: (code: string) => void;
    /** What to send to the server to price or order this cart. */
    cartLines: { productId: string; variantId: string | null; variantLabel: string | null; quantity: number }[];
    /** True until the saved cart has been read from this device. */
    isReady: boolean;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUPON_KEY = 'cart_coupon';

export function CartProvider({ children }: { children: ReactNode }) {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [isCartOpen, setIsCartOpen] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);
    const [couponCode, setCouponCodeState] = useState('');
    const isGhana = useIsGhana();
    const currency: Market = isGhana ? 'GHS' : 'USD';

    // Load cart from localStorage on mount
    useEffect(() => {
        const savedCart = localStorage.getItem('cart');
        if (savedCart) {
            try {
                const parsed: CartItem[] = JSON.parse(savedCart);
                const cleaned = (Array.isArray(parsed) ? parsed : []).filter((item) => {
                    if (!item?.id || !item.name) return false;
                    // Very old carts used the slug as id; those cannot be priced, so drop them.
                    if (!UUID_RE.test(item.id)) return false;
                    if (!(Number(item.quantity) >= 1)) return false;
                    if (!item.slug) item.slug = item.id;
                    return true;
                });
                setCart(cleaned);
            } catch (e) {
                console.error('Failed to parse cart:', e);
                localStorage.removeItem('cart');
            }
        }
        try {
            setCouponCodeState(localStorage.getItem(COUPON_KEY) || '');
        } catch {
            /* ignore */
        }
        setIsInitialized(true);
    }, []);

    // Save cart to localStorage whenever it changes
    useEffect(() => {
        if (isInitialized) {
            localStorage.setItem('cart', JSON.stringify(cart));
            window.dispatchEvent(new Event('cartUpdated')); // Keep compatibility with legacy listeners if any
        }
    }, [cart, isInitialized]);

    const setCouponCode = useCallback((code: string) => {
        const next = code.trim().toUpperCase();
        setCouponCodeState(next);
        try {
            if (next) localStorage.setItem(COUPON_KEY, next);
            else localStorage.removeItem(COUPON_KEY);
        } catch {
            /* ignore */
        }
    }, []);

    /**
     * Keep prices and stock current. The server prices the cart whenever its
     * contents or the shopper's market change, so a sale that starts or ends,
     * or a switch between cedis and dollars, shows the right amounts at once.
     */
    const contentsKey = useMemo(
        () => cart.map((i) => `${i.id}:${i.variantId || ''}:${i.variant || ''}`).join('|'),
        [cart]
    );
    const cartRef = useRef(cart);
    cartRef.current = cart;

    useEffect(() => {
        if (!isInitialized || !contentsKey) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            const sent = cartRef.current;
            try {
                const res = await fetch('/api/storefront/quote', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        currency,
                        items: sent.map((i) => ({
                            productId: i.id,
                            variantId: i.variantId || null,
                            variantLabel: i.variant || null,
                            quantity: i.quantity,
                        })),
                    }),
                });
                if (!res.ok || cancelled) return;
                const json = await res.json();
                const lines: any[] = json?.quote?.lines || [];
                if (cancelled || lines.length !== sent.length) return;

                setCart((current) => {
                    // The cart changed while we were asking: the next run will handle it.
                    if (current.length !== sent.length || current.some((c, i) => c.id !== sent[i].id || c.variant !== sent[i].variant)) {
                        return current;
                    }
                    let changed = false;
                    const next = current.map((item, i) => {
                        const line = lines[i];
                        if (!line || line.productId !== item.id) return item;
                        const updated: CartItem = {
                            ...item,
                            name: line.name || item.name,
                            variantId: line.variantId ?? item.variantId ?? null,
                            price: Number(line.unitPrice) || 0,
                            currency,
                            image: item.image || line.image || '',
                            maxStock: Number(line.stock) > 0 ? Number(line.stock) : item.maxStock,
                            moq: line.moq || item.moq,
                            problem: line.problem || null,
                        };
                        if (
                            updated.price !== item.price ||
                            updated.currency !== item.currency ||
                            updated.variantId !== (item.variantId ?? null) ||
                            updated.maxStock !== item.maxStock ||
                            (updated.problem || null) !== (item.problem || null) ||
                            updated.name !== item.name
                        ) {
                            changed = true;
                            return updated;
                        }
                        return item;
                    });
                    return changed ? next : current;
                });
            } catch {
                /* offline or server busy: keep what we have, checkout prices again anyway */
            }
        }, 150);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [contentsKey, currency, isInitialized]);

    const addToCart = (newItem: CartItem) => {
        setCart((prevCart) => {
            const existingItemIndex = prevCart.findIndex(
                (item) => item.id === newItem.id && item.variant === newItem.variant
            );

            if (existingItemIndex > -1) {
                const newCart = [...prevCart];
                const existingItem = newCart[existingItemIndex];
                const limit = Math.max(existingItem.maxStock || 0, newItem.maxStock || 0) || existingItem.quantity + newItem.quantity;
                newCart[existingItemIndex] = {
                    ...existingItem,
                    variantId: newItem.variantId ?? existingItem.variantId ?? null,
                    price: newItem.price,
                    currency: newItem.currency ?? currency,
                    maxStock: limit,
                    quantity: Math.min(existingItem.quantity + newItem.quantity, limit),
                };
                return newCart;
            }
            const limit = newItem.maxStock > 0 ? newItem.maxStock : newItem.quantity;
            return [
                ...prevCart,
                { ...newItem, currency: newItem.currency ?? currency, quantity: Math.min(newItem.quantity, limit) },
            ];
        });

        setIsCartOpen(true); // Open cart when item is added
    };

    const removeFromCart = (itemId: string, variant?: string) => {
        setCart((prevCart) =>
            prevCart.filter((item) => !(item.id === itemId && item.variant === variant))
        );
    };

    const updateQuantity = (itemId: string, quantity: number, variant?: string) => {
        setCart((prevCart) => {
            const item = prevCart.find(i => i.id === itemId && i.variant === variant);
            if (!item) return prevCart;

            const minQty = item.moq || 1;

            // If trying to reduce below MOQ, remove the item
            if (quantity < minQty) {
                return prevCart.filter(i => !(i.id === itemId && i.variant === variant));
            }

            // Clamp quantity between MOQ and maxStock
            const clampedQty = Math.min(Math.max(quantity, minQty), item.maxStock);

            return prevCart.map((i) =>
                i.id === itemId && i.variant === variant
                    ? { ...i, quantity: clampedQty }
                    : i
            );
        });
    };

    const clearCart = useCallback(() => {
        setCart([]);
        setCouponCode('');
    }, [setCouponCode]);

    const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const formatCartMoney = useCallback((amount: number) => formatMoney(amount, currency), [currency]);
    const cartLines = useMemo(
        () =>
            cart.map((i) => ({
                productId: i.id,
                variantId: i.variantId || null,
                variantLabel: i.variant || null,
                quantity: i.quantity,
            })),
        [cart]
    );

    return (
        <CartContext.Provider value={{
            cart,
            addToCart,
            removeFromCart,
            updateQuantity,
            clearCart,
            cartCount,
            subtotal,
            isCartOpen,
            setIsCartOpen,
            currency,
            formatCartMoney,
            couponCode,
            setCouponCode,
            cartLines,
            isReady: isInitialized,
        }}>
            {children}
        </CartContext.Provider>
    );
}

export function useCart() {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error('useCart must be used within a CartProvider');
    }
    return context;
}
