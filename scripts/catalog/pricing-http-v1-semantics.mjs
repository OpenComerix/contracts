import assert from "node:assert/strict";
import {
  normalizedPriceRequest,
  validatePriceReplayHeaders,
  ownerContext,
  priceOwner,
  listRecord,
  required,
  instant,
  version,
  id,
} from "./pricing-http-v1-common.mjs";
import { validateReplayPair } from "./validate-http-v1.mjs";

const same = (a, b, reason) => assert.deepEqual(a, b, reason);
const scopeFields = {
  organization_id: "string",
  presentation_id: "string",
  price_list_id: "string",
  filters: "object",
  limit: "number",
  before_version: "number",
};
function sequence(rows, c) {
  assert(Array.isArray(rows), "PRICE_HISTORY_ARRAY");
  const seen = new Set();
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i];
    priceOwner(p, c);
    assert(!seen.has(p.price_id), "PRICE_HISTORY_DUPLICATE");
    seen.add(p.price_id);
    if (i) {
      assert(rows[i - 1].version > p.version, "PRICE_HISTORY_ORDER");
      assert.equal(
        rows[i - 1].version,
        p.version + 1,
        "PRICE_HISTORY_SEQUENCE",
      );
      assert(
        instant(rows[i - 1].valid_from) > instant(p.valid_from),
        "PRICE_HISTORY_TIME_ORDER",
      );
      assert(
        p.valid_to !== null &&
          instant(p.valid_to) <= instant(rows[i - 1].valid_from),
        "PRICE_HISTORY_OVERLAP",
      );
      if (rows[i - 1].version === p.version + 1)
        assert.equal(
          instant(p.valid_to),
          instant(rows[i - 1].valid_from),
          "PRICE_HISTORY_GAP",
        );
    }
  }
}
// A persisted interval can only contain changes already effective when observed.
// Replay compares persistence to replayed_at, never to the captured original_at.
function historyAt(rows, observedAt, reason) {
  const cutoff = instant(observedAt);
  for (const p of rows)
    assert(
      instant(p.valid_from) <= cutoff &&
        (p.valid_to === null || instant(p.valid_to) <= cutoff),
      reason,
    );
}
function authority(c) {
  required(c, { authority_current: "boolean" }, "authority");
  assert.equal(c.authority_current, true, "PRICE_AUTHORITY");
}
function canonical(c, policy, operation) {
  required(c, { request: "object" }, "request");
  const n = normalizedPriceRequest(c.request, policy).request;
  assert.equal(n.operation_id, operation, "PRICE_OPERATION");
  assert.deepEqual(n, c.request, "PRICE_REQUEST_NORMALIZED");
  if (n.path.includes("/presentations/"))
    assert.equal(
      n.path.split("/")[5],
      c.presentation.presentation_id,
      "PRICE_PATH_PRESENTATION",
    );
  return n;
}
export function validatePriceSemantic(f, policy) {
  required(f, { kind: "string", context: "object" }, "fixture");
  const c = f.context;
  authority(c);
  switch (f.kind) {
    case "price-change": {
      ownerContext(c, true);
      required(
        c,
        {
          before_history: "array",
          after_history: "array",
          list_after: "object",
          result: "object",
          written_at: "string",
          product_after: "object",
          presentation_after: "object",
          previous_etag: "string",
          closed_etag: "string",
        },
        "change",
      );
      const r = canonical(c, policy, "createPresentationPrice"),
        body = r.body;
      assert(
        c.product.status !== "discontinued" &&
          c.presentation.status !== "discontinued",
        "PRICE_DISCONTINUED",
      );
      same(c.product_after, c.product, "PRICE_PRODUCT_UNCHANGED");
      same(
        c.presentation_after,
        c.presentation,
        "PRICE_PRESENTATION_UNCHANGED",
      );
      listRecord(c.list_after);
      assert.equal(
        c.list_after.organization_id,
        c.organization_id,
        "PRICE_LIST_TENANT",
      );
      if (c.list === null) {
        assert.equal(
          c.before_history.length,
          0,
          "PRICE_LIST_MISSING_WITH_HISTORY",
        );
        assert.equal(c.list_after.version, 1, "PRICE_LIST_FIRST_VERSION");
        assert.equal(
          instant(c.list_after.created_at),
          instant(c.written_at),
          "PRICE_LIST_CREATION_TIME",
        );
        assert.equal(
          instant(c.list_after.updated_at),
          instant(c.written_at),
          "PRICE_LIST_CREATION_TIME",
        );
      } else same(c.list_after, c.list, "PRICE_LIST_UNCHANGED");
      const linked = { ...c, list: c.list_after };
      sequence(c.before_history, linked);
      sequence(c.after_history, linked);
      const previous = c.before_history[0];
      assert.equal(
        body.expected_version,
        previous?.version ?? 0,
        "PRICE_VERSION_CONFLICT",
      );
      const p = c.result;
      priceOwner(p, linked);
      assert.equal(p.version, body.expected_version + 1, "PRICE_NEXT_VERSION");
      assert.equal(p.amount, body.amount, "PRICE_NORMALIZED_AMOUNT");
      assert.equal(p.valid_to, null, "PRICE_NEW_OPEN_INTERVAL");
      assert.equal(
        instant(p.valid_from),
        instant(c.written_at),
        "PRICE_SERVER_TIME",
      );
      assert(
        !c.before_history.some((x) => x.price_id === p.price_id),
        "PRICE_NEW_ID",
      );
      assert.equal(
        c.after_history.length,
        c.before_history.length + 1,
        "PRICE_EFFECT_COUNT",
      );
      same(c.after_history[0], p, "PRICE_RESULT_HISTORY");
      for (let i = 0; i < c.before_history.length; i++) {
        const old = c.before_history[i],
          after = c.after_history[i + 1];
        if (i === 0) {
          assert.equal(old.valid_to, null, "PRICE_PREVIOUS_CURRENT");
          assert(
            instant(p.valid_from) > instant(old.valid_from),
            "PRICE_PROSPECTIVE",
          );
          same(
            after,
            { ...old, valid_to: p.valid_from },
            "PRICE_CLOSE_PREVIOUS_ONLY",
          );
          assert.notEqual(
            c.previous_etag,
            c.closed_etag,
            "PRICE_CLOSED_ETAG_CHANGED",
          );
        } else same(after, old, "PRICE_HISTORY_IMMUTABLE");
      }
      break;
    }
    case "price-current": {
      ownerContext(c);
      required(
        c,
        { history: "array", result: "object", read_at: "string" },
        "current",
      );
      canonical(c, policy, "getPresentationCurrentPrice");
      sequence(c.history, c);
      assert(c.history.length > 0, "PRICE_CURRENT_ABSENT");
      priceOwner(c.result, c);
      same(c.result, c.history[0], "PRICE_CURRENT_LATEST");
      assert.equal(c.result.valid_to, null, "PRICE_CURRENT_CLOSED");
      assert(
        instant(c.result.valid_from) <= instant(c.read_at),
        "PRICE_CURRENT_FUTURE",
      );
      historyAt(c.history, c.read_at, "PRICE_CURRENT_FUTURE");
      break;
    }
    case "price-get": {
      ownerContext(c);
      required(
        c,
        { history: "array", result: "object", read_at: "string" },
        "get",
      );
      const r = canonical(c, policy, "getPrice");
      sequence(c.history, c);
      priceOwner(c.result, c);
      assert.equal(
        r.path.split("/").at(-1),
        c.result.price_id,
        "PRICE_PATH_ID",
      );
      const persisted = c.history.find((p) => p.price_id === c.result.price_id);
      assert(persisted, "PRICE_GET_ABSENT");
      same(c.result, persisted, "PRICE_GET_HISTORY");
      assert(
        instant(c.result.valid_from) <= instant(c.read_at),
        "PRICE_GET_FUTURE",
      );
      historyAt(c.history, c.read_at, "PRICE_GET_FUTURE");
      break;
    }
    case "price-list": {
      ownerContext(c);
      required(
        c,
        { result: "object", effects_before: "number", effects_after: "number" },
        "list-read",
      );
      canonical(c, policy, "getDefaultPriceList");
      listRecord(c.result);
      same(c.result, c.list, "PRICE_LIST_READ");
      assert(
        Number.isSafeInteger(c.effects_before) && c.effects_before >= 0,
        "PRICE_EFFECT_COUNT",
      );
      assert.equal(c.effects_before, c.effects_after, "PRICE_GET_NO_EFFECT");
      break;
    }
    case "price-history": {
      ownerContext(c);
      required(c, { page: "object", read_at: "string" }, "history");
      const r = canonical(c, policy, "listPresentationPrices");
      required(c.page, { items: "array", page: "object" }, "page");
      required(
        c.page.page,
        { has_more: "boolean", limit: "number" },
        "page.metadata",
      );
      const page = c.page.page;
      const effectiveLimit = r.query.limit ? Number(r.query.limit) : 50;
      if (r.query.cursor) {
        required(c, { cursor: "object" }, "history");
        required(
          c.cursor,
          {
            value: "string",
            bound: "object",
            presented: "object",
            signature_verified: "boolean",
            version_supported: "boolean",
            issued_at: "string",
            expires_at: "string",
          },
          "history.cursor",
        );
        assert.equal(c.cursor.value, r.query.cursor, "PRICE_CURSOR_VALUE");
        validatePriceSemantic(
          {
            kind: "price-cursor",
            context: {
              organization_id: c.organization_id,
              product: c.product,
              presentation: c.presentation,
              list: c.list,
              authority_current: c.authority_current,
              read_at: c.read_at,
              bound: c.cursor.bound,
              presented: c.cursor.presented,
              signature_verified: c.cursor.signature_verified,
              version_supported: c.cursor.version_supported,
              issued_at: c.cursor.issued_at,
              expires_at: c.cursor.expires_at,
            },
          },
          policy,
        );
        // The ordinary default remains 50; an explicitly different limit cannot
        // silently reuse a cursor bound to the previous request.
        assert.equal(
          effectiveLimit,
          c.cursor.bound.limit,
          "PRICE_CURSOR_REQUEST_LIMIT",
        );
        for (const p of c.page.items)
          assert(
            p.version < c.cursor.bound.before_version,
            "PRICE_CURSOR_BOUNDARY",
          );
      }
      assert(
        Object.hasOwn(page, "next_cursor") &&
          (page.next_cursor === null ||
            (typeof page.next_cursor === "string" &&
              page.next_cursor.length > 0 &&
              [...page.next_cursor].length <= 2048)),
        "PRICE_PAGE_CURSOR",
      );
      assert(
        Number.isInteger(page.limit) && page.limit >= 1 && page.limit <= 100,
        "PRICE_PAGE_LIMIT",
      );
      assert.equal(page.limit, effectiveLimit, "PRICE_PAGE_REQUEST_LIMIT");
      assert(c.page.items.length <= page.limit, "PRICE_PAGE_SIZE");
      assert.equal(page.has_more, page.next_cursor !== null, "PRICE_PAGE_MORE");
      if (page.has_more)
        assert(c.page.items.length > 0, "PRICE_PAGE_EMPTY_MORE");
      sequence(c.page.items, c);
      if (r.query.cursor) {
        const nextVersion = c.cursor.bound.before_version - 1;
        if (nextVersion === 0)
          assert.equal(c.page.items.length, 0, "PRICE_CURSOR_EXHAUSTED");
        else {
          assert(c.page.items.length > 0, "PRICE_CURSOR_MISSING_NEXT");
          assert.equal(
            c.page.items[0].version,
            nextVersion,
            "PRICE_CURSOR_NEXT_VERSION",
          );
          assert(
            c.page.items[0].valid_to !== null,
            "PRICE_CURSOR_HISTORICAL_CLOSED",
          );
        }
      }
      // Versions are retained from 1; ending a non-empty history before 1
      // silently loses data. Conversely no older page exists after version 1.
      if (c.page.items.length) {
        const last = c.page.items.at(-1).version;
        assert.equal(page.has_more, last > 1, "PRICE_PAGE_COMPLETENESS");
      }
      if (!r.query.cursor && c.page.items.length)
        assert.equal(
          c.page.items[0].valid_to,
          null,
          "PRICE_HISTORY_FIRST_PAGE_CURRENT",
        );
      historyAt(c.page.items, c.read_at, "PRICE_HISTORY_FUTURE");
      break;
    }
    case "price-absence": {
      ownerContext(c, true);
      required(
        c,
        {
          history: "array",
          result: "nullable-object",
          error_code: "string",
          effects_before: "number",
          effects_after: "number",
        },
        "absence",
      );
      const op = c.request?.operation_id;
      assert(
        ["getDefaultPriceList", "getPresentationCurrentPrice"].includes(op),
        "PRICE_ABSENCE_OPERATION",
      );
      canonical(c, policy, op);
      assert.equal(c.result, null, "PRICE_ABSENCE_NO_FALLBACK");
      assert.equal(c.effects_before, c.effects_after, "PRICE_GET_NO_EFFECT");
      assert(
        Number.isSafeInteger(c.effects_before) && c.effects_before >= 0,
        "PRICE_EFFECT_COUNT",
      );
      if (op === "getDefaultPriceList") {
        assert.equal(c.list, null, "PRICE_ABSENCE_LIST");
        assert.equal(c.history.length, 0, "PRICE_LIST_MISSING_WITH_HISTORY");
        assert.equal(
          c.error_code,
          "pricing_default_list_not_initialized",
          "PRICE_ABSENCE_ERROR",
        );
      } else {
        if (c.list !== null) sequence(c.history, c);
        else
          assert.equal(c.history.length, 0, "PRICE_LIST_MISSING_WITH_HISTORY");
        assert.equal(c.history.length, 0, "PRICE_ABSENCE_HAS_CURRENT");
        assert.equal(
          c.error_code,
          "pricing_price_not_set",
          "PRICE_ABSENCE_ERROR",
        );
      }
      break;
    }
    case "price-replay": {
      ownerContext(c);
      required(
        c,
        {
          original: "object",
          replay: "object",
          history_before: "array",
          history_after: "array",
          list_after: "object",
          original_request: "object",
          replay_request: "object",
          original_at: "string",
          replayed_at: "string",
        },
        "replay",
      );
      const a = normalizedPriceRequest(c.original_request, policy),
        b = normalizedPriceRequest(c.replay_request, policy);
      assert.equal(
        a.request.operation_id,
        "createPresentationPrice",
        "PRICE_OPERATION",
      );
      assert.equal(
        a.request.path.split("/")[5],
        c.presentation.presentation_id,
        "PRICE_PATH_PRESENTATION",
      );
      assert.equal(a.hash, b.hash, "PRICE_REPLAY_REQUEST");
      assert(
        instant(c.replayed_at) >= instant(c.original_at) &&
          instant(c.replayed_at) - instant(c.original_at) <= 604800000000n,
        "PRICE_REPLAY_RETENTION",
      );
      validatePriceReplayHeaders(c.original.headers);
      validatePriceReplayHeaders(c.replay.headers);
      validateReplayPair(c.original, c.replay);
      assert.equal(c.original.status, "201", "PRICE_REPLAY_STATUS");
      assert.equal(
        c.original.media_type,
        "application/json",
        "PRICE_REPLAY_MEDIA",
      );
      assert.equal(
        c.original.headers["Cache-Control"],
        "no-store",
        "PRICE_REPLAY_CACHE",
      );
      assert.equal(
        c.original.schema_pointer,
        "/paths/~1pricing~1presentations~1{presentation_id}~1prices/post/responses/201/content/application~1json/schema",
        "PRICE_REPLAY_SELECTOR",
      );
      priceOwner(c.original.body, c);
      assert.equal(
        c.original.body.valid_to,
        null,
        "PRICE_REPLAY_ORIGINAL_OPEN",
      );
      assert.equal(
        c.original.body.amount,
        a.request.body.amount,
        "PRICE_REPLAY_AMOUNT",
      );
      assert.equal(
        c.original.body.version,
        a.request.body.expected_version + 1,
        "PRICE_REPLAY_VERSION",
      );
      assert.equal(
        instant(c.original.body.valid_from),
        instant(c.original_at),
        "PRICE_REPLAY_ORIGINAL_TIME",
      );
      assert.equal(
        c.original.headers.Location,
        "/api/v1/pricing/prices/" + c.original.body.price_id,
        "PRICE_REPLAY_LOCATION",
      );
      same(c.history_after, c.history_before, "PRICE_REPLAY_NO_EFFECT");
      same(c.list_after, c.list, "PRICE_REPLAY_LIST");
      sequence(c.history_before, c);
      historyAt(c.history_before, c.replayed_at, "PRICE_REPLAY_HISTORY_FUTURE");
      const persisted = c.history_before.find(
        (p) => p.price_id === c.original.body.price_id,
      );
      assert(persisted, "PRICE_REPLAY_PERSISTED");
      same(
        { ...persisted, valid_to: null },
        c.original.body,
        "PRICE_REPLAY_ORIGINAL_RECORD",
      );
      break;
    }
    case "price-cursor": {
      ownerContext(c);
      required(
        c,
        {
          bound: "object",
          presented: "object",
          signature_verified: "boolean",
          version_supported: "boolean",
          issued_at: "string",
          expires_at: "string",
          read_at: "string",
        },
        "cursor",
      );
      for (const name of ["bound", "presented"]) {
        required(c[name], scopeFields, "cursor." + name);
        for (const k of ["presentation_id", "price_list_id"]) id(c[name][k]);
        version(c[name].before_version);
        assert(
          Number.isInteger(c[name].limit) &&
            c[name].limit >= 1 &&
            c[name].limit <= 100,
          "PRICE_CURSOR_LIMIT",
        );
        same(c[name].filters, {}, "PRICE_CURSOR_FILTERS");
      }
      same(c.bound, c.presented, "PRICE_CURSOR_BINDING");
      for (const [key, v] of Object.entries({
        organization_id: c.organization_id,
        presentation_id: c.presentation.presentation_id,
        price_list_id: c.list.price_list_id,
      }))
        assert.equal(c.presented[key], v, "PRICE_CURSOR_SCOPE");
      assert.equal(c.signature_verified, true, "PRICE_CURSOR_SIGNATURE");
      assert.equal(c.version_supported, true, "PRICE_CURSOR_VERSION");
      const i = instant(c.issued_at),
        e = instant(c.expires_at),
        now = instant(c.read_at);
      assert(
        i <= now && now < e && e > i && e - i <= 1800000000n,
        "PRICE_CURSOR_EXPIRY",
      );
      break;
    }
    default:
      assert.fail("PRICE_SEMANTIC_KIND");
  }
}
