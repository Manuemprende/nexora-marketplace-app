"use client";

import React, { useState } from "react";
import Image from "next/image";
import { X, ShieldCheck, Truck, MessageSquare, Check, Sparkles, Loader2 } from "lucide-react";
import confetti from "canvas-confetti";
import { TODAS_LAS_COMUNAS_CHILE } from "./comunasChile";
import { NexoraClient, NexoraOrderPayload } from "./nexoraClient";
import { PixelTracker } from "./pixelTracker";

export interface PackOption {
  id: string;
  qty: number;
  title: string;
  price: number;
  originalPrice: number;
  badge?: string;
  savings?: string;
  popular?: boolean;
}

interface QuickCheckoutChileModalProps {
  product: {
    sku: string;
    dropi_id?: number;
    name: string;
    image: string;
    variants?: Array<{ id: string; name: string; options: string[] }>;
  };
  packs: PackOption[];
  whatsappPhone?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (orderId: string, pack: PackOption) => void;
  nexoraClient: NexoraClient;
  pixelTracker?: PixelTracker;
}

export const QuickCheckoutChileModal: React.FC<QuickCheckoutChileModalProps> = ({
  product,
  packs,
  whatsappPhone = "56912345678",
  isOpen,
  onClose,
  onSuccess,
  nexoraClient,
  pixelTracker,
}) => {
  const [selectedPack, setSelectedPack] = useState<PackOption>(() => {
    return packs.find((p) => p.popular) || packs[0] || {
      id: "pack-1",
      qty: 1,
      title: "1 Unidad",
      price: 19990,
      originalPrice: 29990,
    };
  });

  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    product.variants?.forEach((v) => {
      if (v.options.length > 0) init[v.name] = v.options[0];
    });
    return init;
  });

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [comuna, setComuna] = useState("Santiago");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cod" | "whatsapp">("cod");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const formatCLP = (val: number) => {
    return "$" + val.toLocaleString("es-CL");
  };

  const variantString = Object.entries(selectedVariants)
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !phone.trim() || !comuna.trim() || !address.trim()) {
      alert("Por favor completa tu nombre, teléfono, comuna y dirección de entrega.");
      return;
    }

    setIsSubmitting(true);

    const payload: NexoraOrderPayload = {
      customerName: name.trim(),
      customerPhone: phone.trim(),
      customerCity: comuna.trim(),
      customerAddress: address.trim(),
      customerNotes: notes.trim() ? `${notes.trim()} | Variante: ${variantString}` : `Variante: ${variantString}`,
      paymentMethod,
      sku: product.sku,
      dropiProductId: product.dropi_id,
      quantity: selectedPack.qty,
      packId: selectedPack.id,
      totalAmount: selectedPack.price,
      currency: "CLP",
    };

    const res = await nexoraClient.submitOrder(payload);

    if (res.success) {
      const finalOrderId = res.orderId || `ORD-${Date.now()}`;

      // Dispara Pixels de Meta & TikTok
      if (pixelTracker) {
        pixelTracker.trackPurchase(finalOrderId, selectedPack.price, "CLP", product.name);
      }

      // Celebración visual
      confetti({
        particleCount: 90,
        spread: 80,
        origin: { y: 0.6 },
      });

      setIsSubmitting(false);
      onSuccess(finalOrderId, selectedPack);

      // Redirección si eligió cerrar por WhatsApp
      if (paymentMethod === "whatsapp") {
        const msg = encodeURIComponent(
          `¡Hola! Acabo de registrar mi pedido en el Live:\n\n*Producto:* ${product.name}\n*Pack:* ${selectedPack.title}\n*Total:* ${formatCLP(selectedPack.price)}\n*Nombre:* ${name}\n*Comuna:* ${comuna}\n*Dirección:* ${address}\n*Variante:* ${variantString || "Estándar"}`
        );
        window.open(`https://wa.me/${whatsappPhone}?text=${msg}`, "_blank");
      }
    } else {
      setIsSubmitting(false);
      alert(`Hubo un detalle: ${res.error || "No se pudo registrar. Intenta por WhatsApp."}`);
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-black/85 backdrop-blur-md animate-fade-in-up p-2 select-none">
      <div className="w-full max-w-sm bg-neutral-950 border border-neutral-700/80 rounded-3xl max-h-[92vh] overflow-y-auto p-4 text-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <h2 className="text-xs font-black uppercase tracking-wider text-neutral-100">
              Pide Ahora y Paga en Casa
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="w-7 h-7 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Product Compact Badge */}
        <div className="flex items-center gap-2.5 py-2 border-b border-neutral-800/80 my-1">
          <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-neutral-700 flex-shrink-0">
            <Image src={product.image} alt={product.name} fill className="object-cover" sizes="48px" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-xs font-bold truncate text-white">{product.name}</h4>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-sm font-black text-emerald-400 tabular-nums">
                {formatCLP(selectedPack.price)}
              </span>
              <span className="text-[9px] text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1 font-extrabold">
                <Truck className="w-2.5 h-2.5" /> Envío Gratis Chile
              </span>
            </div>
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="space-y-3 mt-2 text-xs">
          {/* Selector de Packs (Ofertas 1, 2 o 3 Unidades) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-neutral-300 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" /> Selecciona tu Promoción:
            </label>
            <div className="space-y-1.5">
              {packs.map((pack) => {
                const isSelected = selectedPack.id === pack.id;
                return (
                  <div
                    key={pack.id}
                    onClick={() => setSelectedPack(pack)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition flex items-center justify-between ${
                      isSelected
                        ? "bg-emerald-950/70 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                        : "bg-neutral-900/80 border-neutral-800 hover:border-neutral-600"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                          isSelected ? "bg-emerald-500 border-emerald-500 text-black" : "border-neutral-600"
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-[11px] text-white">{pack.title}</span>
                          {pack.badge && (
                            <span className="text-[8px] bg-red-600 text-white font-black px-1.5 py-0.2 rounded-md">
                              {pack.badge}
                            </span>
                          )}
                        </div>
                        {pack.savings && (
                          <span className="text-[9px] text-emerald-300 font-medium">Ahorras {pack.savings}</span>
                        )}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-xs font-black text-emerald-400 tabular-nums">
                        {formatCLP(pack.price)}
                      </span>
                      {pack.originalPrice > pack.price && (
                        <div className="text-[9px] text-neutral-500 line-through tabular-nums">
                          {formatCLP(pack.originalPrice)}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Variantes (si aplican) */}
          {product.variants && product.variants.length > 0 && (
            <div className="space-y-1">
              {product.variants.map((v) => (
                <div key={v.id} className="space-y-1">
                  <label className="text-[10px] font-bold text-neutral-300 uppercase">{v.name}:</label>
                  <div className="flex flex-wrap gap-1">
                    {v.options.map((opt) => (
                      <button
                        type="button"
                        key={opt}
                        onClick={() => setSelectedVariants((prev) => ({ ...prev, [v.name]: opt }))}
                        className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition ${
                          selectedVariants[v.name] === opt
                            ? "bg-emerald-500 text-black border-emerald-500 shadow"
                            : "bg-neutral-900 border-neutral-700 text-neutral-300 hover:border-neutral-500"
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Datos de Despacho Chile */}
          <div className="space-y-2 pt-1">
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre y Apellido *"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
            />

            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Teléfono / WhatsApp (+569...) *"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
            />

            {/* Selector de Comunas de Chile */}
            <div className="relative">
              <input
                list="comunas-chile-list"
                required
                value={comuna}
                onChange={(e) => setComuna(e.target.value)}
                placeholder="Comuna de Despacho (ej. Maipú, Viña del Mar) *"
                className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
              />
              <datalist id="comunas-chile-list">
                {TODAS_LAS_COMUNAS_CHILE.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>

            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Calle, Número y Depto/Casa *"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
            />

            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Referencia de entrega (opcional)"
              className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-[11px] text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Método de Pago */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => setPaymentMethod("cod")}
              className={`p-2 rounded-xl border flex flex-col items-center gap-0.5 text-center transition ${
                paymentMethod === "cod"
                  ? "bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow"
                  : "bg-neutral-900 border-neutral-700 text-neutral-400"
              }`}
            >
              <Truck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="font-extrabold text-[10px]">Pago Contra Entrega</span>
              <span className="text-[8px] text-neutral-400">Pagas al recibir</span>
            </button>

            <button
              type="button"
              onClick={() => setPaymentMethod("whatsapp")}
              className={`p-2 rounded-xl border flex flex-col items-center gap-0.5 text-center transition ${
                paymentMethod === "whatsapp"
                  ? "bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow"
                  : "bg-neutral-900 border-neutral-700 text-neutral-400"
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-green-400" />
              <span className="font-extrabold text-[10px]">Pedir por WhatsApp</span>
              <span className="text-[8px] text-neutral-400">Atención directa</span>
            </button>
          </div>

          {/* Botón CTA */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-[0_0_20px_rgba(16,185,129,0.4)] active:scale-[0.98] transition"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Confirmando con Blue Express...</span>
              </>
            ) : (
              <>
                <span>CONFIRMAR PEDIDO ({formatCLP(selectedPack.price)})</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
