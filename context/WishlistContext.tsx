'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type WishlistItem = {
    id: string;
    name: string;
    price: number;
    originalPrice?: number;
    image: string;
    rating?: number;
    reviewCount?: number;
    badge?: string;
    inStock: boolean;
    slug: string;
    // The rest of what a product card shows (see mapProductToCard).
    price_ghs?: number | null;
    originalPrice_ghs?: number | null;
    maxStock?: number;
    moq?: number;
    hasVariants?: boolean;
    minVariantPrice?: number;
    minVariantPrice_ghs?: number | null;
    colorVariants?: { name: string; hex: string }[];
};

type WishlistContextType = {
    wishlist: WishlistItem[];
    addToWishlist: (item: WishlistItem) => void;
    /** Replace saved snapshots with current product data; drop products that no longer exist. */
    refreshWishlist: (fresh: WishlistItem[], removedIds?: string[]) => void;
    removeFromWishlist: (itemId: string) => void;
    isInWishlist: (itemId: string) => boolean;
    clearWishlist: () => void;
    wishlistCount: number;
};

const WishlistContext = createContext<WishlistContextType | undefined>(undefined);

export function WishlistProvider({ children }: { children: ReactNode }) {
    const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
    const [isInitialized, setIsInitialized] = useState(false);

    // Load wishlist from localStorage on mount, and follow changes made in
    // another tab so every open page shows the same list.
    useEffect(() => {
        const readSaved = (): WishlistItem[] => {
            try {
                const parsed = JSON.parse(localStorage.getItem('wishlist') || '[]');
                return Array.isArray(parsed) ? parsed.filter((item) => item && item.id) : [];
            } catch (e) {
                console.error('Failed to read wishlist:', e);
                return [];
            }
        };

        setWishlist(readSaved());
        setIsInitialized(true);

        const onStorage = (event: StorageEvent) => {
            if (event.key === 'wishlist') setWishlist(readSaved());
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, []);

    // Save wishlist to localStorage whenever it changes, then tell the header
    // (it counts from localStorage on the 'wishlistUpdated' event).
    useEffect(() => {
        if (!isInitialized) return;
        try {
            const next = JSON.stringify(wishlist);
            if (localStorage.getItem('wishlist') !== next) {
                localStorage.setItem('wishlist', next);
            }
        } catch (e) {
            console.error('Failed to save wishlist:', e);
        }
        window.dispatchEvent(new Event('wishlistUpdated'));
    }, [wishlist, isInitialized]);

    const addToWishlist = (item: WishlistItem) => {
        setWishlist((prev) => {
            if (prev.some((i) => i.id === item.id)) return prev;
            return [...prev, item];
        });
    };

    const refreshWishlist = (fresh: WishlistItem[], removedIds: string[] = []) => {
        setWishlist((prev) => {
            const byId = new Map(fresh.map((item) => [item.id, item]));
            const next = prev
                .filter((item) => !removedIds.includes(item.id))
                .map((item) => byId.get(item.id) ?? item);
            // Same content: keep the old array so nothing re-renders or re-saves.
            return JSON.stringify(next) === JSON.stringify(prev) ? prev : next;
        });
    };

    const removeFromWishlist = (itemId: string) => {
        setWishlist((prev) => prev.filter((item) => item.id !== itemId));
    };

    const isInWishlist = (itemId: string) => {
        return wishlist.some((item) => item.id === itemId);
    };

    const clearWishlist = () => {
        setWishlist([]);
    };

    const wishlistCount = wishlist.length;

    return (
        <WishlistContext.Provider value={{
            wishlist,
            addToWishlist,
            refreshWishlist,
            removeFromWishlist,
            isInWishlist,
            clearWishlist,
            wishlistCount,
        }}>
            {children}
        </WishlistContext.Provider>
    );
}

export function useWishlist() {
    const context = useContext(WishlistContext);
    if (context === undefined) {
        throw new Error('useWishlist must be used within a WishlistProvider');
    }
    return context;
}
