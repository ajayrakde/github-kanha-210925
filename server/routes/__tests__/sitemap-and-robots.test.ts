import express from "express";
import path from "path";
import request from "supertest";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createSitemapRouter } from "../sitemap";

const getProductsMock = vi.hoisted(() => vi.fn());

vi.mock("../../storage", () => ({
  productsRepository: {
    getProducts: getProductsMock,
  },
}));

describe("seo endpoints", () => {
  const originalBaseUrl = process.env.SITEMAP_BASE_URL;

  beforeEach(() => {
    getProductsMock.mockReset();
    process.env.SITEMAP_BASE_URL = "https://kanha.store";
  });

  afterAll(() => {
    process.env.SITEMAP_BASE_URL = originalBaseUrl;
  });

  it("returns a populated sitemap.xml", async () => {
    getProductsMock.mockResolvedValue([
      { id: "rose-tea" },
      { id: "ginger-honey" },
    ]);

    const app = express();
    app.use(createSitemapRouter());

    const response = await request(app).get("/sitemap.xml");

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/xml");
    expect(response.text).toContain("<loc>https://kanha.store</loc>");
    expect(response.text).toContain("<loc>https://kanha.store/products</loc>");
    expect(response.text).toContain("<loc>https://kanha.store/product/rose-tea</loc>");
    expect(response.text).toContain("<loc>https://kanha.store/product/ginger-honey</loc>");
  });

  it("serves robots.txt with crawl directives", async () => {
    const app = express();
    const staticDir = path.resolve(import.meta.dirname, "../../..", "client", "public");
    app.use(express.static(staticDir));

    const response = await request(app).get("/robots.txt");

    expect(response.status).toBe(200);
    expect(response.text).toContain("User-agent: *");
    expect(response.text).toContain("Disallow: /admin");
    expect(response.text).toContain("Sitemap: https://kanha.store/sitemap.xml");
  });
});
