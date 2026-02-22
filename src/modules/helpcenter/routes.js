const express = require("express");
const { authRequired, roleRequired } = require("../../middleware/auth");
const { getMany, getOne, query } = require("../../db/client");

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function helpcenterRoutes() {
  const router = express.Router();

  router.get("/help-center/articles", async (req, res) => {
    const category = (req.query.category || "").trim();
    const params = [];
    let where = "WHERE is_published = TRUE";
    if (category) {
      params.push(category);
      where += ` AND category = $${params.length}`;
    }

    const articles = await getMany(
      `SELECT id, title, slug, category, created_at FROM kb_articles ${where} ORDER BY created_at DESC`,
      params
    );
    res.json(articles);
  });

  router.get("/help-center/articles/:slug", async (req, res) => {
    const article = await getOne(
      `SELECT id, title, slug, category, body, created_at FROM kb_articles WHERE slug = $1 AND is_published = TRUE`,
      [req.params.slug]
    );
    if (!article) {
      res.status(404).json({ error: "Article not found" });
      return;
    }
    res.json(article);
  });

  router.post("/help-center/articles", authRequired, roleRequired("admin", "agent"), async (req, res) => {
    const title = (req.body.title || "").trim();
    const category = (req.body.category || "").trim();
    const body = (req.body.body || "").trim();
    if (!title || !category || !body) {
      res.status(400).json({ error: "title, category, body are required" });
      return;
    }

    const slug = slugify(req.body.slug || title);
    const inserted = await query(
      `
        INSERT INTO kb_articles (title, slug, category, body, is_published, created_by)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, title, slug, category, body, is_published, created_at
      `,
      [title, slug, category, body, req.body.isPublished !== false, req.user.sub]
    );
    res.status(201).json(inserted.rows[0]);
  });

  return router;
}

module.exports = { helpcenterRoutes };
