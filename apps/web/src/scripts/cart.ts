/* Cart — état persisté en localStorage (zéro tracker, zéro tiers — CDC §1).
 * Le back-end n'arrive qu'en J3, donc panier 100% client en attendant. Les
 * lignes de commande seront re-validées côté API au moment du checkout.
 */

export interface CartItem {
  productSlug: string;
  productName: string;
  colorSlug: string;
  colorName: string;
  colorImage: string;
  storageSlug: string;
  storageLabel: string;
  unitPrice: number;
  qty: number;
  /* Modifications matérielles (ALARTIC, suppression physique). */
  mods: {
    mic: boolean;
    frontCam: boolean;
    rearCam: boolean;
  };
}

const STORAGE_KEY = "alartic.cart.v1";
const EVENT_NAME = "alartic:cart-change";
const ADD_EVENT_NAME = "alartic:cart-add";

function read(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function write(items: CartItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

/* Une ligne = même produit + même couleur + même stockage + mêmes mods.
 * Deux ajouts identiques sont fusionnés en incrémentant la quantité. */
function sameLine(a: CartItem, b: Omit<CartItem, "qty">) {
  return (
    a.productSlug === b.productSlug &&
    a.colorSlug === b.colorSlug &&
    a.storageSlug === b.storageSlug &&
    a.mods.mic === b.mods.mic &&
    a.mods.frontCam === b.mods.frontCam &&
    a.mods.rearCam === b.mods.rearCam
  );
}

export const cart = {
  list(): CartItem[] {
    return read();
  },
  count(): number {
    return read().reduce((sum, it) => sum + it.qty, 0);
  },
  total(): number {
    return read().reduce((sum, it) => sum + it.unitPrice * it.qty, 0);
  },
  add(item: Omit<CartItem, "qty"> & { qty?: number }) {
    const items = read();
    const qty = item.qty ?? 1;
    const existing = items.find((it) => sameLine(it, item));
    if (existing) {
      existing.qty = Math.min(99, existing.qty + qty);
    } else {
      items.push({ ...item, qty });
    }
    write(items);
    window.dispatchEvent(
      new CustomEvent<CartItem>(ADD_EVENT_NAME, {
        detail: { ...item, qty },
      }),
    );
  },
  remove(index: number) {
    const items = read();
    items.splice(index, 1);
    write(items);
  },
  setQty(index: number, qty: number) {
    const items = read();
    if (!items[index]) return;
    items[index].qty = Math.max(1, Math.min(99, qty));
    write(items);
  },
  clear() {
    write([]);
  },
  onChange(handler: () => void): () => void {
    const fn = () => handler();
    window.addEventListener(EVENT_NAME, fn);
    /* Synchro multi-onglets — un changement dans un autre onglet déclenche
     * aussi le handler. */
    window.addEventListener("storage", (e) => {
      if (e.key === STORAGE_KEY) fn();
    });
    return () => {
      window.removeEventListener(EVENT_NAME, fn);
    };
  },
  onAdd(handler: (item: CartItem) => void): () => void {
    const fn = (e: Event) => handler((e as CustomEvent<CartItem>).detail);
    window.addEventListener(ADD_EVENT_NAME, fn);
    return () => {
      window.removeEventListener(ADD_EVENT_NAME, fn);
    };
  },
};
