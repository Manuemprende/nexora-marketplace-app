"use client";

import { useState, useEffect } from "react";

export interface SubdomainConfigResult {
  slug: string;
  config: any | null;
  loading: boolean;
  error: string | null;
  isCustomSubdomain: boolean;
}

/**
 * Hook que detecta automáticamente el subdominio desde el navegador
 * Ejemplos:
 *   - "taladro.wentixai.digital"  -> slug = "taladro"
 *   - "palas.mykiastore.com"      -> slug = "palas"
 *   - "localhost:3000?p=taladro"  -> slug = "taladro" (para pruebas en local)
 */
export function useSubdomainConfig(fallbackSlug: string = "destornillador-pro"): SubdomainConfigResult {
  const [slug, setSlug] = useState<string>(fallbackSlug);
  const [config, setConfig] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isCustomSubdomain, setIsCustomSubdomain] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let detectedSlug = fallbackSlug;
    const hostname = window.location.hostname; // ej: "taladro.wentixai.digital" o "localhost"
    const searchParams = new URLSearchParams(window.location.search);

    // 1. Prioridad: Parámetro de prueba en URL (?p=taladro o ?slug=taladro)
    const urlOverride = searchParams.get("p") || searchParams.get("slug");
    if (urlOverride) {
      detectedSlug = urlOverride.toLowerCase();
      setIsCustomSubdomain(true);
    } 
    // 2. Extracción de subdominio en producción (ej: taladro.wentixai.digital)
    else if (hostname && !hostname.includes("localhost") && !hostname.startsWith("127.0.0.1")) {
      const parts = hostname.split(".");
      // Si tiene al menos 3 partes (subdominio.dominio.tld), ej: ["taladro", "wentixai", "digital"]
      if (parts.length >= 3 && parts[0] !== "www") {
        detectedSlug = parts[0].toLowerCase();
        setIsCustomSubdomain(true);
      }
    }

    setSlug(detectedSlug);

    // 3. Cargar la configuración del producto para este subdominio
    async function loadConfig() {
      setLoading(true);
      setError(null);

      try {
        // Intento A: Cargar desde la API de Nexora ERP en vivo
        const nexoraEndpoint = `https://nexora.wentixai.cyou/api/landings/${detectedSlug}`;
        const res = await fetch(nexoraEndpoint, {
          headers: { "Accept": "application/json" }
        });

        if (res.ok) {
          const remoteData = await res.json();
          if (remoteData && remoteData.product) {
            setConfig(remoteData);
            setLoading(false);
            return;
          }
        }
      } catch {
        // Silencioso: pasamos al Intento B
      }

      try {
        // Intento B: Cargar archivo estático local (/configs/[slug].json)
        const localRes = await fetch(`/configs/${detectedSlug}.json`);
        if (localRes.ok) {
          const localData = await localRes.json();
          setConfig(localData);
          setLoading(false);
          return;
        }
      } catch {
        // Silencioso: pasamos al Intento C
      }

      try {
        // Intento C: Fallback al archivo maestro template.config.json
        const fallbackRes = await fetch(`/configs/template.config.json`);
        if (fallbackRes.ok) {
          const defaultData = await fallbackRes.json();
          setConfig(defaultData);
          setLoading(false);
          return;
        }
      } catch (err: any) {
        setError(`No se pudo cargar la configuración para el subdominio: ${detectedSlug}`);
      }

      setLoading(false);
    }

    loadConfig();
  }, [fallbackSlug]);

  return { slug, config, loading, error, isCustomSubdomain };
}
