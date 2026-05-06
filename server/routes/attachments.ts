// Attachment upload — accepts a JSON body with a base64-encoded payload
// (the same data URLs the prototype already produces in the composer),
// uploads the bytes to the `case-attachments` Supabase Storage bucket,
// and returns a signed URL the message thread can use to render and
// download the file. Replaces the previous "store the entire data URL
// in the messages.attachments JSON column" approach.

import { Router, Response } from 'express';
import crypto from 'crypto';
import { extractMultiTenant, MultiTenantRequest } from '../middleware/multiTenant.js';
import { getSupabaseAdmin } from '../db/supabase.js';

const router = Router();
router.use(extractMultiTenant);

// Limit incoming request body — 8 MB JSON (~5.6 MB raw file once base64
// overhead is removed). Using a route-local express.json so we don't bump
// the global limit for every API.
import express from 'express';
router.use(express.json({ limit: '8mb' }));

const BUCKET = 'case-attachments';
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

router.post('/upload', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { name, type, dataUrl } = req.body ?? {};
    if (!name || !dataUrl) {
      return res.status(400).json({ error: 'name and dataUrl are required' });
    }
    // Strip the data:<mime>;base64, prefix and decode.
    const m = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
    if (!m) return res.status(400).json({ error: 'dataUrl must be a base64 data URI' });
    const detectedType = m[1] || type || 'application/octet-stream';
    const buffer = Buffer.from(m[2], 'base64');
    if (buffer.length === 0) return res.status(400).json({ error: 'empty payload' });
    if (buffer.length > 5 * 1024 * 1024) {
      return res.status(413).json({ error: 'attachment exceeds 5 MB' });
    }

    const supabase = getSupabaseAdmin();
    const bucket = supabase.storage.from(BUCKET);
    // Path: tenant/workspace/<random>-<safe-name>. Random prefix avoids
    // collisions if two agents upload the same filename to the same case.
    const safeName = String(name).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
    const key = `${req.tenantId}/${req.workspaceId}/${crypto.randomUUID()}-${safeName}`;

    const { error: upErr } = await bucket.upload(key, buffer, {
      upsert: false,
      contentType: detectedType,
    });
    if (upErr) {
      console.error('Attachment upload failed:', upErr);
      return res.status(500).json({ error: upErr.message || 'Upload failed' });
    }

    const { data: signed, error: signErr } = await bucket.createSignedUrl(key, SIGNED_URL_TTL_SECONDS);
    if (signErr || !signed?.signedUrl) {
      return res.status(500).json({ error: 'Could not create signed URL' });
    }

    res.status(201).json({
      key,
      url:  signed.signedUrl,
      name,
      type: detectedType,
      size: buffer.length,
    });
  } catch (error) {
    console.error('Error uploading attachment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh a signed URL for an existing key — useful when the original 7-day
// link has expired and the message is re-rendered.
router.post('/sign', async (req: MultiTenantRequest, res: Response) => {
  try {
    const { key } = req.body ?? {};
    if (!key) return res.status(400).json({ error: 'key is required' });
    // Don't let a tenant sign URLs for another tenant's prefix.
    const expectedPrefix = `${req.tenantId}/${req.workspaceId}/`;
    if (!String(key).startsWith(expectedPrefix)) {
      return res.status(403).json({ error: 'forbidden' });
    }
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(key, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) {
      return res.status(500).json({ error: error?.message || 'Could not refresh signed URL' });
    }
    res.json({ key, url: data.signedUrl });
  } catch (error) {
    console.error('Error refreshing signed URL:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
