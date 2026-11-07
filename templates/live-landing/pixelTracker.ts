declare global {
  interface Window {
    fbq?: any;
    _fbq?: any;
    ttq?: any;
  }
}

export class PixelTracker {
  private metaPixelId?: string;
  private tiktokPixelId?: string;
  private initialized = false;

  constructor(metaPixelId?: string, tiktokPixelId?: string) {
    this.metaPixelId = metaPixelId;
    this.tiktokPixelId = tiktokPixelId;
  }

  /**
   * Inyecta de forma asíncrona los scripts oficiales de Meta y TikTok en el navegador
   */
  init() {
    if (typeof window === "undefined" || this.initialized) return;

    // --- Meta Pixel ---
    if (this.metaPixelId && !window.fbq) {
      /* eslint-disable */
      (function (f: any, b: any, e: any, v: any, n?: any, t?: any, s?: any) {
        if (f.fbq) return;
        n = f.fbq = function () {
          n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
        };
        if (!f._fbq) f._fbq = n;
        n.push = n;
        n.loaded = !0;
        n.version = "2.0";
        n.queue = [];
        t = b.createElement(e);
        t.async = !0;
        t.src = v;
        s = b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t, s);
      })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
      /* eslint-enable */

      window.fbq("init", this.metaPixelId);
      window.fbq("track", "PageView");
    }

    // --- TikTok Pixel ---
    if (this.tiktokPixelId && !window.ttq) {
      /* eslint-disable */
      (function (w: any, d: any, t: any) {
        w.TiktokAnalyticsObject = t;
        var ttq = (w[t] = w[t] || []);
        ttq.methods = [
          "page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"
        ];
        ttq.setAndDefer = function (t: any, e: any) {
          t[e] = function () {
            t.push([e].concat(Array.prototype.slice.call(arguments, 0)));
          };
        };
        for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
        ttq.instance = function (t: any) {
          for (var e = ttq._i[t] || [], n = 0; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
          return e;
        };
        ttq.load = function (e: any, n: any) {
          var i = "https://analytics.tiktok.com/i18n/pixel/events.js";
          (ttq._i = ttq._i || {}), (ttq._i[e] = []), (ttq._i[e]._u = i);
          var s = d.createElement("script");
          (s.type = "text/javascript"), (s.async = !0), (s.src = i + "?sdkid=" + e + "&lib=" + t);
          var a = d.getElementsByTagName("script")[0];
          a.parentNode.insertBefore(s, a);
        };
      })(window, document, "ttq");
      /* eslint-enable */

      window.ttq.load(this.tiktokPixelId);
      window.ttq.page();
    }

    this.initialized = true;
  }

  /**
   * Dispara evento de vista de producto (ViewContent)
   */
  trackViewContent(productName: string, price: number, currency = "CLP") {
    if (typeof window === "undefined") return;

    if (window.fbq) {
      window.fbq("track", "ViewContent", {
        content_name: productName,
        value: price,
        currency,
      });
    }

    if (window.ttq) {
      window.ttq.track("ViewContent", {
        content_name: productName,
        value: price,
        currency,
      });
    }
  }

  /**
   * Dispara evento al abrir el formulario de compra (InitiateCheckout)
   */
  trackInitiateCheckout(productName: string, price: number, currency = "CLP") {
    if (typeof window === "undefined") return;

    if (window.fbq) {
      window.fbq("track", "InitiateCheckout", {
        content_name: productName,
        value: price,
        currency,
      });
    }

    if (window.ttq) {
      window.ttq.track("InitiateCheckout", {
        content_name: productName,
        value: price,
        currency,
      });
    }
  }

  /**
   * Dispara evento de conversión final (Purchase / PlaceAnOrder)
   */
  trackPurchase(orderId: string, totalAmount: number, currency = "CLP", productName?: string) {
    if (typeof window === "undefined") return;

    if (window.fbq) {
      window.fbq("track", "Purchase", {
        content_name: productName,
        value: totalAmount,
        currency,
        order_id: orderId,
      });
    }

    if (window.ttq) {
      window.ttq.track("PlaceAnOrder", {
        content_name: productName,
        value: totalAmount,
        currency,
        order_id: orderId,
      });
    }
  }
}
