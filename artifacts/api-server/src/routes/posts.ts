import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, posts, users, sql } from "@workspace/db";
import { logger } from "../lib/logger";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { supabase, upload, uploadToSupabase } from "../lib/storage";
import { createNotification } from "../lib/notifications";

const router = Router();

let schemaEnsured = false;
let attachmentsBackfilled = false;
async function ensureSchema() {
  if (schemaEnsured) return;
  schemaEnsured = true;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_attachments (
      id uuid PRIMARY KEY,
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind text NOT NULL,
      file_name text NOT NULL,
      mime_type text NOT NULL,
      size bigint NOT NULL,
      file_key text NOT NULL,
      url text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS post_attachments_post_idx ON post_attachments (post_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS post_attachments_user_idx ON post_attachments (user_id);`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS post_attachments_post_filekey_uniq ON post_attachments (post_id, file_key);`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_likes (
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (post_id, user_id)
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS post_likes_post_idx ON post_likes (post_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS post_likes_user_idx ON post_likes (user_id);`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS post_comments (
      id uuid PRIMARY KEY,
      post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS post_comments_post_idx ON post_comments (post_id);`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS post_comments_user_idx ON post_comments (user_id);`);

  if (!attachmentsBackfilled) {
    attachmentsBackfilled = true;
    try {
      const candidates = await db
        .select({ id: posts.id, authorId: posts.authorId, attachments: posts.attachments })
        .from(posts)
        .where(sql`${posts.attachments} is not null and ${posts.attachments} <> '[]'`)
        .limit(2000);

      for (const p of candidates) {
        const exists = await db.execute(sql`
          SELECT 1 FROM post_attachments WHERE post_id = ${p.id} LIMIT 1;
        `);
        const existsRows = (exists as any)?.rows ?? exists;
        const hasAny = Array.isArray(existsRows) ? existsRows.length > 0 : false;
        if (hasAny) continue;

        let parsed: any[] = [];
        try {
          parsed = p.attachments ? (JSON.parse(p.attachments) as any[]) : [];
          if (!Array.isArray(parsed)) parsed = [];
        } catch {
          parsed = [];
        }
        if (parsed.length === 0) continue;

        for (const a of parsed) {
          const fileKey = typeof a?.fileKey === "string" ? a.fileKey : "";
          const url = typeof a?.url === "string" ? a.url : "";
          if (!fileKey || !url) continue;
          const kind = typeof a?.kind === "string" ? a.kind : "file";
          const fileName = typeof a?.fileName === "string" ? a.fileName : "file";
          const mimeType = typeof a?.mimeType === "string" ? a.mimeType : "application/octet-stream";
          const size = typeof a?.size === "number" ? a.size : 0;
          const id = typeof a?.id === "string" ? a.id : randomUUID();
          await db.execute(sql`
            INSERT INTO post_attachments (
              id, post_id, user_id,
              kind, file_name, mime_type, size,
              file_key, url
            ) VALUES (
              ${id}, ${p.id}, ${p.authorId},
              ${kind}, ${fileName}, ${mimeType}, ${BigInt(size)},
              ${fileKey}, ${url}
            )
            ON CONFLICT (post_id, file_key) DO NOTHING;
          `);
        }
      }
    } catch (err) {
      logger.warn({ err }, "Post attachments backfill failed");
    }
  }
}

async function deletePostInternal(postId: string, actor: { id: string; role: string }) {
  const [postRow] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
  if (!postRow) return { status: 404 as const, body: { error: "Post not found" } as const };

  if (actor.role === "supervisor" && postRow.authorId !== actor.id) {
    return { status: 403 as const, body: { error: "Forbidden" } as const };
  }

  const bucketName = process.env.SUPABASE_STORAGE_BUCKET || "vivid-ops-files";
  const keys: string[] = [];
  try {
    const raw = postRow.attachments ? JSON.parse(postRow.attachments) : [];
    if (Array.isArray(raw)) {
      for (const a of raw) {
        if (typeof a?.fileKey === "string" && a.fileKey) keys.push(a.fileKey);
      }
    }
  } catch {
  }

  if (keys.length > 0) {
    try {
      await supabase.storage.from(bucketName).remove(keys);
    } catch (err) {
      logger.warn({ err, postId }, "Failed to delete some post files from storage");
    }
  }

  await db.delete(posts).where(eq(posts.id, postId));
  return { status: 204 as const };
}

router.get("/posts", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const rows = await db
      .select({
        post: posts,
        author: { id: users.id, name: users.name, role: users.role },
        likeCount: sql<number>`(select count(*)::int from post_likes pl where pl.post_id = ${posts.id})`,
        commentCount: sql<number>`(select count(*)::int from post_comments pc where pc.post_id = ${posts.id})`,
        likedByMe: sql<boolean>`exists(select 1 from post_likes pl where pl.post_id = ${posts.id} and pl.user_id = ${actor.id})`,
      })
      .from(posts)
      .innerJoin(users, eq(users.id, posts.authorId))
      .orderBy(desc(posts.createdAt));

    res.json(
      rows.map((r) => ({
        ...r.post,
        author: r.author,
        likeCount: Number(r.likeCount ?? 0),
        commentCount: Number(r.commentCount ?? 0),
        likedByMe: Boolean(r.likedByMe),
      })),
    );
  } catch (err) {
    logger.error({ err }, "Failed to fetch posts");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/posts", requireRole("super-admin", "admin", "supervisor"), async (req, res) => {
  try {
    const user = req.session!.user;
    await ensureSchema();

    const { title, body, category } = req.body;
    const [newPost] = await db.insert(posts).values({
      title,
      body,
      category,
      authorId: user.id,
      attachments: "[]",
    }).returning();

    // Notify all active users about new training/update
    const activeUsers = await db.select({ id: users.id }).from(users).where(eq(users.status, "active"));
    for (const u of activeUsers) {
      if (u.id === user.id) continue;
      await createNotification(
        u.id,
        `New Training Assignment: ${title}`,
        `A new training update has been posted: ${title}. Category: ${category}`,
        "training"
      );
    }

    res.status(201).json(newPost);
  } catch (err) {
    logger.error({ err }, "Failed to create post");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post(
  "/posts/:id/attachments",
  requireRole("super-admin", "admin", "supervisor"),
  upload.single("file"),
  async (req, res) => {
    try {
      await ensureSchema();
      const actor = req.session!.user;
      const postId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      const [postRow] = await db.select().from(posts).where(eq(posts.id, postId)).limit(1);
      if (!postRow) {
        res.status(404).json({ error: "Post not found" });
        return;
      }

      const kind = file.mimetype.startsWith("image/")
        ? "image"
        : file.mimetype.startsWith("video/")
          ? "video"
          : "file";

      const prefix = `training/posts/${postId}/${kind}s`;
      const { key, location } = await uploadToSupabase(file, { prefix });

      const attachmentId = randomUUID();
      await db.execute(sql`
        INSERT INTO post_attachments (
          id, post_id, user_id,
          kind, file_name, mime_type, size,
          file_key, url
        ) VALUES (
          ${attachmentId}, ${postId}, ${actor.id},
          ${kind}, ${file.originalname}, ${file.mimetype}, ${BigInt(file.size)},
          ${key}, ${location}
        )
        ON CONFLICT (post_id, file_key) DO NOTHING;
      `);

      let attachments: any[] = [];
      try {
        attachments = postRow.attachments ? (JSON.parse(postRow.attachments) as any[]) : [];
        if (!Array.isArray(attachments)) attachments = [];
      } catch {
        attachments = [];
      }

      const attachment = {
        id: attachmentId,
        kind,
        fileName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        fileKey: key,
        url: location,
        createdAt: new Date().toISOString(),
      };

      const next = [attachment, ...attachments].slice(0, 50);
      await db.update(posts).set({ attachments: JSON.stringify(next) }).where(eq(posts.id, postId));

      res.status(201).json(attachment);
      return;
    } catch (err) {
      logger.error({ err }, "Failed to upload post attachment");
      res.status(500).json({ error: "Internal server error" });
      return;
    }
  },
);

router.get("/posts/:id/likes", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const postId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const rows = await db.execute(sql`
      SELECT u.id, u.name, u.role, pl.created_at as "createdAt"
      FROM post_likes pl
      INNER JOIN users u ON u.id = pl.user_id
      WHERE pl.post_id = ${postId}
      ORDER BY pl.created_at DESC
      LIMIT 100;
    `);
    const result = (rows as any)?.rows ?? rows;
    res.json(
      Array.isArray(result)
        ? result.map((r: any) => ({ id: r.id, name: r.name, role: r.role, createdAt: r.createdAt }))
        : [],
    );
  } catch (err) {
    logger.error({ err }, "Failed to list post likes");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/posts/:id/likes", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const postId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

    const existing = await db.execute(sql`
      SELECT 1 FROM post_likes WHERE post_id = ${postId} AND user_id = ${actor.id} LIMIT 1;
    `);
    const rows = (existing as any)?.rows ?? existing;
    const has = Array.isArray(rows) ? rows.length > 0 : false;

    if (has) {
      await db.execute(sql`DELETE FROM post_likes WHERE post_id = ${postId} AND user_id = ${actor.id};`);
    } else {
      await db.execute(sql`INSERT INTO post_likes (post_id, user_id) VALUES (${postId}, ${actor.id}) ON CONFLICT DO NOTHING;`);

      // Notify Author on "Completion" (Like)
      const [postRow] = await db.select({ authorId: posts.authorId, title: posts.title }).from(posts).where(eq(posts.id, postId)).limit(1);
      if (postRow && postRow.authorId !== actor.id) {
        await createNotification(
          postRow.authorId,
          `Training Completed: ${postRow.title}`,
          `${actor.name} has completed/acknowledged the training: ${postRow.title}`,
          "training"
        );
      }
    }

    const countRes = await db.execute(sql`SELECT count(*)::int AS count FROM post_likes WHERE post_id = ${postId};`);
    const countRows = (countRes as any)?.rows ?? countRes;
    const likeCount = Array.isArray(countRows) && countRows[0]?.count != null ? Number(countRows[0].count) : 0;
    res.json({ liked: !has, likeCount });
  } catch (err) {
    logger.error({ err }, "Failed to toggle post like");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/posts/:id/comments", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const postId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const rows = await db.execute(sql`
      SELECT pc.id, pc.body, pc.created_at as "createdAt",
             u.id as "authorId", u.name as "authorName", u.role as "authorRole"
      FROM post_comments pc
      INNER JOIN users u ON u.id = pc.user_id
      WHERE pc.post_id = ${postId}
      ORDER BY pc.created_at ASC
      LIMIT 200;
    `);
    const result = (rows as any)?.rows ?? rows;
    res.json(
      Array.isArray(result)
        ? result.map((r: any) => ({
            id: r.id,
            body: r.body,
            createdAt: r.createdAt,
            author: { id: r.authorId, name: r.authorName, role: r.authorRole },
          }))
        : [],
    );
  } catch (err) {
    logger.error({ err }, "Failed to list post comments");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/posts/:id/comments", requireAuth, async (req, res) => {
  try {
    await ensureSchema();
    const actor = req.session!.user;
    const postId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body) {
      res.status(400).json({ error: "body is required" });
      return;
    }
    if (body.length > 2000) {
      res.status(400).json({ error: "body too long" });
      return;
    }

    const id = randomUUID();
    await db.execute(sql`
      INSERT INTO post_comments (id, post_id, user_id, body)
      VALUES (${id}, ${postId}, ${actor.id}, ${body});
    `);

    res.status(201).json({
      id,
      body,
      createdAt: new Date().toISOString(),
      author: { id: actor.id, name: actor.name, role: actor.role },
    });
  } catch (err) {
    logger.error({ err }, "Failed to create post comment");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete(
  "/posts/:id",
  requireRole("super-admin", "admin", "supervisor"),
  async (req, res) => {
    try {
      await ensureSchema();
      const actor = req.session!.user;
      const postId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await deletePostInternal(postId, actor);
      if (result.status === 204) {
        res.status(204).end();
        return;
      }
      res.status(result.status).json(result.body);
      return;
    } catch (err) {
      logger.error({ err }, "Failed to delete post");
      res.status(500).json({ error: "Internal server error" });
      return;
    }
  },
);

router.post(
  "/posts/:id/delete",
  requireRole("super-admin", "admin", "supervisor"),
  async (req, res) => {
    try {
      await ensureSchema();
      const actor = req.session!.user;
      const postId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      const result = await deletePostInternal(postId, actor);
      if (result.status === 204) {
        res.status(204).end();
        return;
      }
      res.status(result.status).json(result.body);
      return;
    } catch (err) {
      logger.error({ err }, "Failed to delete post");
      res.status(500).json({ error: "Internal server error" });
      return;
    }
  },
);

export default router;
