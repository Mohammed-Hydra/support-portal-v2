const express = require("express");
const { authRequired, roleRequired } = require("../../middleware/auth");
const { getMany, query } = require("../../db/client");

function contactsRoutes() {
  const router = express.Router();

  router.get("/contacts", authRequired, roleRequired("admin"), async (req, res) => {
    const contacts = await getMany(
      `SELECT c.*, COUNT(t.id) AS tickets_count
       FROM contacts c
       LEFT JOIN tickets t ON t.requester_contact_id = c.id
       GROUP BY c.id
       ORDER BY c.created_at DESC`
    );
    res.json(contacts);
  });

  router.post("/contacts", authRequired, roleRequired("admin"), async (req, res) => {
    const inserted = await query(
      `
        INSERT INTO contacts (name, email, phone, company, notes)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `,
      [
        (req.body.name || "").trim(),
        (req.body.email || "").trim().toLowerCase() || null,
        (req.body.phone || "").trim() || null,
        (req.body.company || "").trim() || null,
        req.body.notes || null,
      ]
    );
    res.status(201).json(inserted.rows[0]);
  });

  return router;
}

module.exports = { contactsRoutes };
