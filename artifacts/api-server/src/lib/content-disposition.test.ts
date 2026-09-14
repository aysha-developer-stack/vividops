import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { contentDispositionHeader } from "./content-disposition";

describe("contentDispositionHeader", () => {
  it("keeps commas in ASCII download names", () => {
    const header = contentDispositionHeader(
      "attachment",
      "Lot 3770, New Road, Flagstone 14-09-2026.pdf",
    );
    assert.equal(
      header,
      'attachment; filename="Lot 3770, New Road, Flagstone 14-09-2026.pdf"',
    );
    assert.equal(header.includes("%2C"), false);
    assert.equal(header.includes("filename*"), false);
  });

  it("uses RFC 5987 only for non-ASCII names", () => {
    const header = contentDispositionHeader("attachment", "Straße.pdf");
    assert.match(header, /^attachment; filename="/);
    assert.match(header, /filename\*=UTF-8''/);
  });
});
