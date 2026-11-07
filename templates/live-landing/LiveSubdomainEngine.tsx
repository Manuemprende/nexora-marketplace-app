"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useSubdomainConfig } from "./useSubdomainConfig";
import { QuickCheckoutChileModal } from "./QuickCheckoutChileModal";
import { PixelTracker } from "./pixelTracker";
import { NexoraClient } from "./nexoraClient";
import { AiBotHandler } from "./AiBotHandler";
import { LiveVideoPlayer } from "../src/components/live/LiveVideoPlayer";
import { LiveHeader } from "../src/components/live/LiveHeader";
import { LiveChatFeed } from "../src/components/live/LiveChatFeed";
import { LiveChatInput } from "../src/components/live/LiveChatInput";
import { LiveProductPin } from "../src/components/live/LiveProductPin";
import { FloatingHearts } from "../src/components/live/FloatingHearts";
import { Loader2 } from "lucide-react";

interface LiveSubdomainEngineProps {
  initialConfig?: any;
}

/**
 * Motor maestro que se monta en el navegador, lee el subdominio de la URL
 * (ej: taladro.tudominio.com), inyecta los pixeles y corre la Live Landing.
 */
export const LiveSubdomainEngine: React.FC<LiveSubdomainEngineProps> = ({ initialConfig }) => {
  const { slug, config: dynamicConfig, loading, error } = useSubdomainConfig("destornillador-pro");
  const activeConfig = dynamicConfig || initialConfig;

  const [isMuted, setIsMuted] = useState(true);
  const [likeTrigger, setLikeTrigger] = useState(0);
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [comments, setComments] = useState<any[]>([]);

  // Inicializar clientes
  const nexoraClient = useMemo(() => {
    return new NexoraClient(activeConfig?.deployment?.nexoraApiUrl || "https://nexora.wentixai.cyou/api/orders");
  }, [activeConfig?.deployment?.nexoraApiUrl]);

  const pixelTracker = useMemo(() => {
    if (!activeConfig?.tracking) return undefined;
    return new PixelTracker(activeConfig.tracking.metaPixelId, activeConfig.tracking.tiktokPixelId);
  }, [activeConfig?.tracking]);

  const aiBotHandler = useMemo(() => {
    if (!activeConfig?.bot || !activeConfig?.product) return undefined;
    return new AiBotHandler(activeConfig.bot, activeConfig.product.name);
  }, [activeConfig?.bot, activeConfig?.product]);

  // Cargar píxeles y comentarios iniciales al montar la landing
  useEffect(() => {
    if (activeConfig && pixelTracker) {
      pixelTracker.init();
      pixelTracker.trackViewContent(activeConfig.product.name, activeConfig.product.price || 19990, "CLP");

      // Cargar comentarios simulados de prueba social
      if (activeConfig.socialProof?.simulatedComments) {
        const initialFeed = activeConfig.socialProof.simulatedComments.map((c: any, idx: number) => ({
          id: `sim-${idx}`,
          authorName: c.author,
          authorAvatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80",
          message: c.message,
          isSimulated: true,
          type: "general"
        }));
        setComments(initialFeed);
      }
    }
  }, [activeConfig, pixelTracker]);

  if (loading && !activeConfig) {
    return (
      <div className="w-full h-screen bg-black flex flex-col items-center justify-center text-emerald-400 gap-2">
        <Loader2 className="w-8 h-8 animate-spin" />
        <span className="text-xs text-neutral-400 font-mono tracking-wider">
          Cargando Live para: [{slug}]...
        </span>
      </div>
    );
  }

  if (error || !activeConfig) {
    return (
      <div className="w-full h-screen bg-black flex flex-col items-center justify-center text-white p-4 text-center">
        <h1 className="text-lg font-bold text-red-400">Subdominio no configurado</h1>
        <p className="text-xs text-neutral-400 mt-1 max-w-xs">
          No encontramos el producto para el subdominio: <code className="text-emerald-400">{slug}</code>
        </p>
      </div>
    );
  }

  const { product, packs, live, whatsapp } = activeConfig;

  const handleSendLike = () => {
    setLikeTrigger((prev) => prev + 1);
  };

  const handleSendMessage = async (msgText: string) => {
    // 1. Agregar comentario del usuario
    const userComment = {
      id: `usr-${Date.now()}`,
      authorName: "Tú",
      authorAvatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80",
      message: msgText,
      isSimulated: false,
      type: "question"
    };
    setComments((prev) => [...prev, userComment]);
    handleSendLike();

    // 2. Respuesta de la IA calibrada exclusivamente para este producto
    if (aiBotHandler && activeConfig.bot?.enabled) {
      setIsAiTyping(true);
      try {
        const replyText = await aiBotHandler.answerQuestion(msgText);
        setTimeout(() => {
          setComments((prev) => [
            ...prev,
            {
              id: `bot-${Date.now()}`,
              authorName: activeConfig.bot.name || "Asesora IA",
              authorAvatar: activeConfig.bot.avatar,
              message: replyText,
              isSimulated: false,
              isAiBot: true,
              type: "general"
            }
          ]);
          setIsAiTyping(false);
        }, 800);
      } catch {
        setIsAiTyping(false);
      }
    }
  };

  const handleOpenCheckout = () => {
    if (pixelTracker) {
      pixelTracker.trackInitiateCheckout(product.name, product.price || 19990, "CLP");
    }
    setIsCheckoutOpen(true);
  };

  return (
    <main className="relative w-full h-[100dvh] max-w-md mx-auto bg-black overflow-hidden shadow-2xl border-x border-neutral-900 select-none">
      {/* 1. Video Vertical 9:16 en Fullscreen */}
      <LiveVideoPlayer
        videoUrl={live.videoUrl}
        videoType={live.videoType}
        posterUrl={live.posterUrl}
        isMuted={isMuted}
        onUnmute={() => setIsMuted(false)}
        onDoubleTap={handleSendLike}
      />

      {/* 2. Corazones flotantes al interactuar */}
      <FloatingHearts triggerCount={likeTrigger} />

      {/* 3. Header con Badge 'EN VIVO' y Viewers */}
      <LiveHeader
        hostName={live.hostName}
        hostAvatar={live.hostAvatar}
        viewersCount={live.initialViewers || 240}
        isMuted={isMuted}
        onToggleMute={() => setIsMuted((m) => !m)}
      />

      {/* 4. Overlays inferiores: Chat + Pin de Producto + Input */}
      <div className="absolute bottom-0 left-0 right-0 z-30 flex flex-col justify-end bg-gradient-to-t from-black/95 via-black/50 to-transparent pt-8 pb-1 pointer-events-none">
        <LiveChatFeed comments={comments} />
        
        <LiveProductPin
          products={[product]}
          selectedProduct={product}
          onSelectProduct={() => {}}
          onOpenDetails={handleOpenCheckout}
          onQuickBuy={handleOpenCheckout}
        />

        <LiveChatInput
          onSendMessage={handleSendMessage}
          onSendLike={handleSendLike}
          isAiTyping={isAiTyping}
        />
      </div>

      {/* 5. Modal / Drawer de Compra Contra Entrega Chile con Packs y Comunas */}
      <QuickCheckoutChileModal
        product={product}
        packs={packs || []}
        whatsappPhone={whatsapp?.phone}
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        onSuccess={(orderId, pack) => {
          setIsCheckoutOpen(false);
          setComments((prev) => [
            ...prev,
            {
              id: `sale-${Date.now()}`,
              authorName: "Cliente Verificado",
              authorAvatar: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80",
              message: `¡Acabo de pedir el ${pack.title}! 🚚🎉`,
              isSimulated: false,
              type: "purchase"
            }
          ]);
        }}
        nexoraClient={nexoraClient}
        pixelTracker={pixelTracker}
      />
    </main>
  );
};
