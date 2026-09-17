import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cliqDedupeKey,
  cliqExternalIdCandidates,
  cliqSenderDisplayName,
  isWithinCliqDedupeWindow,
  normalizeMirroredCliqText,
  parseCliqCreatedAt,
  parseCliqHistoryMessage,
} from "./cliq-history-parse";

describe("parseCliqHistoryMessage", () => {
  it("reads text, sender, and timestamp from a Cliq history row", () => {
    const parsed = parseCliqHistoryMessage({
      id: "1599387839188_1",
      time: 1599387839188,
      type: "text",
      sender: { name: "Farjan Faizid", email: "farjan@example.com", id: "u1" },
      content: { text: "Ok, Sir" },
    });
    assert.ok(parsed);
    assert.equal(parsed?.text, "Ok, Sir");
    assert.equal(parsed?.senderEmail, "farjan@example.com");
    assert.equal(parsed?.senderName, "Farjan Faizid");
    assert.equal(parsed?.externalMessageId, "1599387839188_1");
    assert.equal(parsed?.createdAt?.getTime(), 1599387839188);
  });

  it("uses file comment when the message is an attachment", () => {
    const parsed = parseCliqHistoryMessage({
      id: "file-1",
      type: "file",
      sender: { name: "Vivid Ops" },
      content: {
        comment: "Please check",
        file: { id: "fid-9", name: "plan.pdf" },
      },
    });
    assert.ok(parsed);
    assert.equal(parsed?.text, "Please check");
  });
});

describe("normalizeMirroredCliqText", () => {
  it("strips the OPS prefix so website-originated Cliq copies are not duplicated", () => {
    const job = {
      jobNumber: "1548022",
      serial: 1548022,
      title: "Engineering",
    };
    const text = "JOB-1548022 - Engineering\nVivid OPS (Admin): Please change";
    assert.equal(normalizeMirroredCliqText(job, text).text, "Please change");
    assert.equal(normalizeMirroredCliqText(job, text).wasMirrored, true);
  });
});

describe("cliq duplicate detection", () => {
  it("treats timestamp and timestamp_index Cliq ids as the same message", () => {
    const ids = cliqExternalIdCandidates("1599387839188_1");
    assert.ok(ids.includes("1599387839188"));
    assert.ok(ids.includes("1599387839188_1"));
  });

  it("uses the same dedupe key for webhook and history copies of a file", () => {
    const webhook = cliqDedupeKey("Shared a file", {
      fileId: "fid-9",
      fileName: "IMG_5168.JPG",
    });
    const history = cliqDedupeKey("Please check", {
      type: "file",
      content: { file: { id: "fid-9", name: "IMG_5168.JPG" } },
    });
    assert.equal(webhook, history);
    assert.equal(webhook, "file:fid-9");
  });

  it("treats messages a few seconds apart as the same Cliq post", () => {
    assert.equal(
      isWithinCliqDedupeWindow("2026-09-16T14:48:00.000Z", "2026-09-16T14:48:26.000Z"),
      true,
    );
    assert.equal(
      isWithinCliqDedupeWindow("2026-09-16T14:48:00.000Z", "2026-09-16T15:20:00.000Z"),
      false,
    );
  });

  it("reads created time from a webhook payload", () => {
    const created = parseCliqCreatedAt({
      text: "Okay let me confirm",
      message: { id: "1599387839188_1", time: 1599387839188 },
    });
    assert.equal(created?.getTime(), 1599387839188);
  });
});
describe("cliqSenderDisplayName", () => {
  it("uses the Cliq sender name when the row was stored as the sync user", () => {
    assert.equal(
      cliqSenderDisplayName("zoho_cliq", { opsUsedSyncUser: true, opsSenderName: "Guest Worker" }, "Zoho Cliq"),
      "Guest Worker",
    );
  });

  it("keeps the mapped OPS user name otherwise", () => {
    assert.equal(
      cliqSenderDisplayName("zoho_cliq", { opsUsedSyncUser: false, opsSenderName: "Guest" }, "Farjan Faizid"),
      "Farjan Faizid",
    );
  });
});
