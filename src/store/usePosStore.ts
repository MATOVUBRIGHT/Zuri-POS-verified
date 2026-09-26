import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Product, StockItem, Customer, TaxConfig, PaymentMethod } from '@/types';
import { calculateTransaction } from '@/services/posCalculator';

interface CartItem extends Product {
  sellType: 'item' | 'sachet';
  itemsPerSachet: number;
}

interface PosState {
  // Common State
  storeId: string | null;
  saleType: 'retail' | 'wholesale';
  
  // Cart State
  cart: CartItem[];
  
  // Customer State
  customerName: string;
  customerPhone: string;
  selectedCustomerId: string | null;
  
  // Financial State
  discountAmount: string;
  discountType: 'fixed' | 'percentage';
  selectedTaxId: string | null;
  selectedPaymentMethodId: string | null;
  amountReceived: string;
  // Split payment UI
  splitOpen: boolean;
  splits: Array<{ methodId: string | null; amount: string }>;
  
  // Forms/UI
  formData: {
    paidInCash: boolean | null;
    mobileMoneyNumber: string;
    bankName: string;
    accountNumber: string;
    accountName: string;
    tillNumber: string;
    paybillNumber: string;
    transactionReference: string;
    payerName: string;
    notes: string;
  };

  // Actions
  setStoreId: (id: string | null) => void;
  setSaleType: (type: 'retail' | 'wholesale') => void;
  addToCart: (stockItem: StockItem, sellType: 'item' | 'sachet') => void;
  updateCartQty: (productName: string, sellType: 'item' | 'sachet', quantity: number, maxQty: number) => void;
  updateCartPrice: (productName: string, sellType: 'item' | 'sachet', price: number) => void;
  removeFromCart: (productName: string, sellType: 'item' | 'sachet') => void;
  clearCart: () => void;
  
  setCustomer: (name: string, phone?: string, id?: string | null) => void;
  setDiscount: (amount: string, type: 'fixed' | 'percentage') => void;
  setTaxId: (id: string | null) => void;
  setPaymentMethodId: (id: string | null) => void;
  setAmountReceived: (amount: string) => void;
  setFormData: (data: Partial<PosState['formData']>) => void;
  setSplitOpen: (open: boolean) => void;
  setSplits: (splits: Array<{ methodId: string | null; amount: string }>) => void;
  addSplitRow: () => void;
  updateSplit: (idx: number, field: 'methodId' | 'amount', value: any) => void;
  removeSplit: (idx: number) => void;
  applySplits: () => void;
  resetForm: () => void;
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => ({
      storeId: null,
      saleType: 'retail',
      cart: [],
      customerName: '',
      customerPhone: '',
      selectedCustomerId: null,
      discountAmount: '0',
      discountType: 'fixed',
      selectedTaxId: null,
      selectedPaymentMethodId: null,
      amountReceived: '',
      splitOpen: false,
      splits: [],
      formData: {
        paidInCash: null,
        mobileMoneyNumber: '',
        bankName: '',
        accountNumber: '',
        accountName: '',
        tillNumber: '',
        paybillNumber: '',
        transactionReference: '',
        payerName: '',
        notes: '',
      },

      setStoreId: (id) => set({ storeId: id }),
      setSaleType: (type) => set({ saleType: type }),

      addToCart: (stockItem, sellType) => {
        const { cart } = get();
        const itemsPerSachet = stockItem.items_per_sachet || 1;
        const existingIndex = cart.findIndex(
          (p) => p.productName === stockItem.productName && p.sellType === sellType
        );

        const totalQuantity = stockItem.quantity || 0;
        const maxQty = sellType === 'sachet' 
          ? Math.floor(totalQuantity / itemsPerSachet) 
          : totalQuantity;

        if (maxQty < 1) return;

        const sellingPrice = Math.max(
          (sellType === 'sachet' ? stockItem.wholesale_price : stockItem.retail_price) || 0,
          0
        );

        if (existingIndex !== -1) {
          const updated = [...cart];
          updated[existingIndex] = {
            ...updated[existingIndex],
            quantity: Math.min(updated[existingIndex].quantity + 1, maxQty),
          };
          set({ cart: updated });
        } else {
          set({
            cart: [
              {
                id: stockItem.id,
                productName: stockItem.productName,
                quantity: 1,
                sellingPrice,
                sellType,
                itemsPerSachet,
              },
              ...cart,
            ],
          });
        }
      },

      updateCartQty: (productName, sellType, quantity, maxQty) => {
        const { cart } = get();
        set({
          cart: cart.map((p) =>
            p.productName === productName && p.sellType === sellType
              ? { ...p, quantity: Math.min(Math.max(1, quantity), maxQty) }
              : p
          ),
        });
      },

      updateCartPrice: (productName, sellType, price) => {
        const { cart } = get();
        set({
          cart: cart.map((p) =>
            p.productName === productName && p.sellType === sellType
              ? { ...p, sellingPrice: Math.max(0, price) }
              : p
          ),
        });
      },

      removeFromCart: (productName, sellType) => {
        const { cart } = get();
        set({
          cart: cart.filter((p) => !(p.productName === productName && p.sellType === sellType)),
        });
      },

      clearCart: () => set({ cart: [] }),

      setCustomer: (name, phone, id) =>
        set({ customerName: name, customerPhone: phone || '', selectedCustomerId: id || null }),

      setDiscount: (amount, type) => set({ discountAmount: amount, discountType: type }),
      setTaxId: (id) => set({ selectedTaxId: id }),
      setPaymentMethodId: (id) => set({ selectedPaymentMethodId: id }),
      setAmountReceived: (amount) => set({ amountReceived: amount }),
      
      setFormData: (data) =>
        set((state) => ({ formData: { ...state.formData, ...data } })),
      setSplitOpen: (open) => set({ splitOpen: open }),
      setSplits: (splits) => set({ splits }),
      addSplitRow: () => set((state) => ({ splits: [...state.splits, { methodId: state.selectedPaymentMethodId || null, amount: '' }] })),
      updateSplit: (idx, field, value) => set((state) => ({ splits: state.splits.map((r, i) => i === idx ? ({ ...r, [field]: value }) : r) })),
      removeSplit: (idx) => set((state) => ({ splits: state.splits.filter((_, i) => i !== idx) })),
      applySplits: () => set((state) => {
        const totalApplied = state.splits.reduce((s, sp) => s + (parseFloat(sp.amount) || 0), 0);
        return { amountReceived: String(totalApplied), splitOpen: false };
      }),

      resetForm: () =>
        set({
          customerName: '',
          customerPhone: '',
          selectedCustomerId: null,
          cart: [],
          amountReceived: '',
          discountAmount: '0',
          formData: {
            paidInCash: null,
            mobileMoneyNumber: '',
            bankName: '',
            accountNumber: '',
            accountName: '',
            tillNumber: '',
            paybillNumber: '',
            transactionReference: '',
            payerName: '',
            notes: '',
          },
        }),
    }),
    {
      name: 'pos-draft-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        cart: state.cart,
        customerName: state.customerName,
        customerPhone: state.customerPhone,
        selectedCustomerId: state.selectedCustomerId,
        discountAmount: state.discountAmount,
        discountType: state.discountType,
        saleType: state.saleType,
        formData: state.formData,
      }),
    }
  )
);
