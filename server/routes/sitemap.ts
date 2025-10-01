import { Router } from "express";

import { productsRepository } from "../storage";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/$/, "");
}

function buildAbsoluteUrl(baseUrl: string, path: string): string {
  if (path === "/") {
    return baseUrl;
  }
  return `${baseUrl}${path}`;
}

export function createSitemapRouter() {
  const router = Router();

  router.get("/sitemap.xml", async (_req, res) => {
    try {
      const configuredBaseUrl =
        process.env.SITEMAP_BASE_URL || process.env.BASE_URL || "http://localhost:3000";
      const baseUrl = normalizeBaseUrl(configuredBaseUrl);

      const staticPaths = [
        "/",
        "/products",
        "/cart",
        "/checkout",
        "/payment",
        "/thank-you",
        "/orders",
      ];

      const staticUrls = staticPaths.map((path) => buildAbsoluteUrl(baseUrl, path));

      const products = await productsRepository.getProducts();
      const productUrls = products.map((product) =>
        `${baseUrl}/product/${encodeURIComponent(product.id)}`,
      );

      const uniqueUrls = Array.from(new Set([...staticUrls, ...productUrls]));

      const urlEntries = uniqueUrls
        .map((loc) => `  <url>\n    <loc>${loc}</loc>\n  </url>`)
        .join("\n");

      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>`;

      res.type("application/xml").status(200).send(xml);
    } catch (error) {
      console.error("Failed to generate sitemap", error);
      res.status(500).json({ message: "Failed to generate sitemap" });
    }
  });

  return router;
}
