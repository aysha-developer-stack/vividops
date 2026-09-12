import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cliqSenderDisplayName,
  normalizeMirroredCliqText,
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
