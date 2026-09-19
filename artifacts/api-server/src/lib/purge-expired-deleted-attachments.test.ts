import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DELETED_ATTACHMENT_RETENTION_MS,
  isDeletedAttachmentExpired,
} from "./deleted-attachment-retention.ts";

describe("isDeletedAttachmentExpired", () => {
  const nowMs = 1_700_000_000_000;

  it("keeps files inside the 1-week restore window", () => {
    assert.equal(isDeletedAttachmentExpired(new Date(nowMs - DELETED_ATTACHMENT_RETENTION_MS + 1), nowMs), false);
    assert.equal(isDeletedAttachmentExpired(new Date(nowMs - 3 * 24 * 60 * 60 * 1000), nowMs), false);
  });

  it("expires files once they are a week old", () => {
    assert.equal(isDeletedAttachmentExpired(new Date(nowMs - DELETED_ATTACHMENT_RETENTION_MS), nowMs), true);
    assert.equal(isDeletedAttachmentExpired(new Date(nowMs - DELETED_ATTACHMENT_RETENTION_MS - 1), nowMs), true);
  });

  it("does not expire active or unparseable rows", () => {
    assert.equal(isDeletedAttachmentExpired(null, nowMs), false);
    assert.equal(isDeletedAttachmentExpired(undefined, nowMs), false);
    assert.equal(isDeletedAttachmentExpired("not-a-date", nowMs), false);
  });
});
