/**
 * PAC-119 (contract §7.4): the editor's branch for a failed create and the
 * exact texts. [unit]
 */
import { describe, expect, it } from "vitest";

import { ApiGatewayError, ApiHttpError, ApiUnreachableError } from "@/api/client";
import { LINK_CREATE_TEXT, classifyCreateFailure, linkRefusalText } from "./linkCreateRetry";

const L = "7b0e7c1e-4a49-4d7e-9a43-2f4e0a6b5c11";

describe("classifyCreateFailure", () => {
  it.each([
    ["a network failure", new ApiUnreachableError("network")],
    ["the client bound", new ApiUnreachableError("timeout")],
    ["a non-JSON 2xx", new ApiUnreachableError("non-json", 200)],
    ["a gateway page", new ApiGatewayError(502)],
    ["the budget 503", new ApiHttpError(503, { error: "request timed out" })],
    ["a 500", new ApiHttpError(500, { error: "internal error" })],
    ["a 503 without the budget body", new ApiHttpError(503, { error: "unavailable" })],
  ])("AC-19: %s is an unknown outcome", (_label, e) => {
    expect(classifyCreateFailure(e)).toEqual({ kind: "outcome-unknown" });
  });

  it("the two link refusals name the link", () => {
    expect(classifyCreateFailure(new ApiHttpError(409, { error: "idempotency key already used", link_id: L }))).toEqual({
      kind: "link-refusal", refusal: "used", linkId: L,
    });
    expect(classifyCreateFailure(new ApiHttpError(409, { error: "idempotency key expired", link_id: L }))).toEqual({
      kind: "link-refusal", refusal: "expired", linkId: L,
    });
  });

  it("the deleted refusal names nothing", () => {
    expect(classifyCreateFailure(new ApiHttpError(409, { error: "idempotency key already used by a deleted link" }))).toEqual({
      kind: "deleted",
    });
  });

  it.each([
    ["slug already exists", new ApiHttpError(409, { error: "slug already exists" })],
    ["an unknown 409", new ApiHttpError(409, { error: "something else" })],
    ["the key 400", new ApiHttpError(400, { error: "invalid Idempotency-Key header" })],
    ["a 422", new ApiHttpError(422, { error: "title is required" })],
    ["a 401", new ApiHttpError(401, { error: "unauthorized" })],
    ["a local error", new Error("boom")],
  ])("%s keeps today's handling", (_label, e) => {
    expect(classifyCreateFailure(e)).toEqual({ kind: "other" });
  });
});

describe("texts (contract §7.4, exact)", () => {
  it("are the contract's strings", () => {
    expect(LINK_CREATE_TEXT.outcomeUnknown).toBe(
      "Paceday didn't confirm that this link was created. Press Create link again — it won't create a second link.",
    );
    expect(linkRefusalText("used", false)).toBe(
      "Your earlier save already created this link. What you changed since, co-hosts included, is not saved yet — press Save changes to apply it to this link.",
    );
    expect(linkRefusalText("used", true)).toBe(
      "Your earlier save already created this link. Its co-hosts couldn't be loaded, so your co-host changes can't be applied yet. Press Save changes to apply your other changes to this link, then open it from the Links page to change its co-hosts.",
    );
    expect(linkRefusalText("expired", false)).toBe(
      "Your earlier save, more than a day ago, already created this link. This form now edits it — press Save changes to save the form to this link.",
    );
    expect(linkRefusalText("expired", true)).toBe(
      "Your earlier save, more than a day ago, already created this link. This form now edits it, but its co-hosts couldn't be loaded, so co-host changes can't be applied yet. Press Save changes to save the other fields to this link, then open it from the Links page to change its co-hosts.",
    );
    expect(LINK_CREATE_TEXT.keyDeleted).toBe(
      "The link your earlier save created has since been deleted. Press Create link to create a new link.",
    );
  });

  it("AC-19: the unknown-outcome text never asks to refresh; the expired texts claim no change; nothing says reopen", () => {
    expect(LINK_CREATE_TEXT.outcomeUnknown).not.toMatch(/refresh/i);
    expect(linkRefusalText("expired", false)).not.toMatch(/changed/i);
    expect(linkRefusalText("expired", true)).not.toMatch(/what you changed/i);
    for (const text of Object.values(LINK_CREATE_TEXT)) expect(text).not.toMatch(/reopen/i);
  });
});
