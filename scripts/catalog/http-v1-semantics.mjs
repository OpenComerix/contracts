import assert from "node:assert/strict";
import { decimal, text, sku, query } from "./security-v1-common.mjs";
import { quantities, barcodeKey, normalizeBody } from "./http-v1-common.mjs";
const record = (v, reason) =>
  assert(v && typeof v === "object" && !Array.isArray(v), reason);
const version = (v) =>
  assert(Number.isSafeInteger(v) && v >= 1, "EXPECTED_VERSION");

const string = (v) => typeof v === "string" && v.length > 0;
const integer = (v) => Number.isSafeInteger(v) && v >= 0;
const positive = (v) => integer(v) && v >= 1;
const object = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const boolean = (v) => typeof v === "boolean";
const nullableString = (v) => v === null || string(v);
const state = (v) =>
  ["draft", "active", "inactive", "discontinued"].includes(v);
function fields(v, shape) {
  record(v, "SEMANTIC_CONTEXT_FIELDS");
  for (const [k, valid] of Object.entries(shape))
    assert(Object.hasOwn(v, k) && valid(v[k]), "SEMANTIC_CONTEXT_FIELD:" + k);
}
const entity = (v) => {
  fields(v, { status: state, version: positive });
  return true;
};
const arrayOf = (check) => (v) => Array.isArray(v) && v.every(check);
const binding = (v) => {
  fields(v, {
    organization_id: string,
    filters: object,
    limit: (n) => positive(n) && n <= 100,
  });
  assert(
    Object.values(v.filters).every((x) => typeof x === "string"),
    "SEMANTIC_CURSOR_FILTERS",
  );
  if (Object.hasOwn(v, "presentation_id"))
    fields(v, { presentation_id: string });
  return true;
};
function validateContext(kind, x) {
  const shapes = {
    quantities: { presentation: object, base_unit: string },
    barcode: {
      type: string,
      value: string,
      organization_id: string,
      reservations: arrayOf((r) => {
        fields(r, { organization_id: string, type: string, value: string });
        return true;
      }),
    },
    "retire-barcode": {
      barcode: (r) => {
        fields(r, {
          presentation_id: string,
          organization_id: string,
          status: (v) => ["active", "retired"].includes(v),
        });
        return true;
      },
      presentation_id: string,
      organization_id: string,
    },
    transition: {
      entity: string,
      status: state,
      action: string,
      result_status: state,
      tax_supported: boolean,
      price_eligible: boolean,
      active_presentation: boolean,
    },
    "category-move": {
      organization_id: string,
      category_id: string,
      parent_id: nullableString,
      categories: arrayOf((r) => {
        fields(r, {
          category_id: string,
          organization_id: string,
          parent_id: nullableString,
          status: (v) => ["active", "inactive"].includes(v),
        });
        return true;
      }),
    },
    "category-inactivate": {
      children: arrayOf((r) => {
        fields(r, { status: (v) => ["active", "inactive"].includes(v) });
        return true;
      }),
    },
    "category-assignment": {
      category: (r) => {
        fields(r, {
          organization_id: string,
          status: (v) => ["active", "inactive"].includes(v),
        });
        return true;
      },
      organization_id: string,
    },
    "product-edit": {
      body: object,
      product: entity,
      base_presentation: entity,
      presentation_count: positive,
      ever_activated: boolean,
      base_ever_activated: boolean,
      tax_supported: boolean,
      step_up_remaining_ms: Number.isFinite,
    },
    "presentation-edit": {
      product: entity,
      body: object,
      presentation: entity,
      product_status: state,
      is_base: boolean,
      ever_activated: boolean,
      base_unit: string,
    },
    uniqueness: {
      code_type: string,
      value: string,
      organization_id: string,
      parent_id: nullableString,
      reservations: arrayOf((r) => {
        fields(r, { organization_id: string, value: string });
        if (x.code_type === "category")
          fields(r, {
            parent_id: nullableString,
            status: (v) => ["active", "inactive"].includes(v),
          });
        return true;
      }),
    },
    cursor: {
      signature_verified: boolean,
      version_supported: boolean,
      now: Number.isFinite,
      issued: Number.isFinite,
      expires: Number.isFinite,
      authority_current: boolean,
      bound: binding,
      presented: binding,
    },
    version: {
      expected_version: positive,
      before_version: positive,
      after_version: positive,
    },
    replay: {
      authority_current: boolean,
      effects_before: integer,
      effects_after: integer,
      original: object,
      replay: object,
    },
    lookup: { query_pairs: Array.isArray },
    "created-product": {
      product: (r) => {
        entity(r);
        fields(r, {
          product_id: string,
          organization_id: string,
          default_variant: (d) => {
            fields(d, { variant_id: string, base_unit: string });
            return true;
          },
          base_presentation_id: string,
        });
        return true;
      },
      presentation: (r) => {
        entity(r);
        fields(r, {
          presentation_id: string,
          product_id: string,
          variant_id: string,
          organization_id: string,
          unit_code: string,
          conversion_factor: string,
        });
        return true;
      },
    },
  };
  assert(Object.hasOwn(shapes, kind), "SEMANTIC_KIND");
  fields(x, shapes[kind]);
  if (kind === "transition" && x.entity === "presentation")
    fields(x, { parent_status: state });
  if (kind === "replay")
    for (const r of [x.original, x.replay]) {
      fields(r, {
        request: object,
        status: (n) => [200, 201].includes(n),
        body: object,
        location: nullableString,
        version: positive,
      });
      assert(
        Object.keys(r.request).length > 0 && Object.keys(r.body).length > 0,
        "SEMANTIC_REPLAY_EMPTY",
      );
      assert(
        (r.status === 201) === (r.location !== null),
        "SEMANTIC_REPLAY_LOCATION",
      );
      assert.equal(r.body.version, r.version, "SEMANTIC_REPLAY_VERSION");
    }
  if (kind === "product-edit") {
    fields(x.product, { tax_classification: (v) => v === null || object(v) });
    if (x.product.tax_classification !== null)
      fields(x.product.tax_classification, { code: string, version: positive });
    if (x.product.status === "active")
      assert(
        x.product.tax_classification !== null,
        "PRODUCT_CONTEXT_ACTIVE_TAX",
      );
  }
}
// Link complete owner records before applying edit preconditions.
function presentationOwner(product, presentation) {
  fields(product, {
    product_id: string,
    organization_id: string,
    base_presentation_id: string,
    default_variant: (v) => {
      fields(v, { variant_id: string, base_unit: string });
      return true;
    },
  });
  fields(presentation, {
    presentation_id: string,
    product_id: string,
    variant_id: string,
    organization_id: string,
    unit_code: string,
    conversion_factor: string,
  });
  assert.equal(
    presentation.organization_id,
    product.organization_id,
    "PRESENTATION_CONTEXT_TENANT",
  );
  assert.equal(
    presentation.product_id,
    product.product_id,
    "PRESENTATION_CONTEXT_PRODUCT",
  );
  assert.equal(
    presentation.variant_id,
    product.default_variant.variant_id,
    "PRESENTATION_CONTEXT_VARIANT",
  );
  return presentation.presentation_id === product.base_presentation_id;
}
function basePresentation(product, presentation) {
  assert(presentationOwner(product, presentation), "BASE_PRESENTATION_LINK");
  assert.equal(
    presentation.unit_code,
    product.default_variant.base_unit,
    "BASE_CONTEXT_UNIT",
  );
  assert.equal(
    decimal(presentation.conversion_factor, 6, true),
    "1",
    "BASE_CONTEXT_FACTOR",
  );
}

function history(status, ever) {
  assert(
    status === "discontinued" ||
      (status === "draft" ? ever === false : ever === true),
    "ENTITY_HISTORY",
  );
}

// Owner-verified context assertions, not a simulation of a transaction/DB/cache.
export function validateSemantic(f) {
  record(f, "SEMANTIC_FIXTURE");
  record(f.context, "SEMANTIC_CONTEXT");
  const x = f.context;
  if (f.kind === "transition")
    assert(["product", "presentation"].includes(x.entity), "TRANSITION_ENTITY");
  validateContext(f.kind, x);
  switch (f.kind) {
    case "quantities":
      quantities(x.presentation, x.base_unit);
      break;
    case "barcode": {
      const key = barcodeKey(x.type, x.value);
      assert(Array.isArray(x.reservations), "RESERVATIONS");
      assert(
        !x.reservations.some(
          (r) =>
            r.organization_id === x.organization_id &&
            barcodeKey(r.type, r.value) === key,
        ),
        "BARCODE_RESERVED",
      );
      break;
    }
    case "retire-barcode":
      assert.equal(
        x.barcode.presentation_id,
        x.presentation_id,
        "BARCODE_PRESENTATION",
      );
      assert.equal(
        x.barcode.organization_id,
        x.organization_id,
        "BARCODE_TENANT",
      );
      assert.equal(x.barcode.status, "active", "BARCODE_STATE");
      break;
    case "transition": {
      const matrix = {
        draft: ["activate", "discontinue"],
        active: ["inactivate", "discontinue"],
        inactive: ["reactivate", "discontinue"],
        discontinued: [],
      };
      assert(
        Object.hasOwn(matrix, x.status) && matrix[x.status].includes(x.action),
        "STATE_TRANSITION",
      );
      assert(x.parent_status !== "discontinued", "PARENT_DISCONTINUED");
      if (["activate", "reactivate"].includes(x.action)) {
        assert.equal(x.tax_supported, true, "ACTIVATION_TAX");
        assert.equal(x.price_eligible, true, "ACTIVATION_PRICE");
        if (x.entity === "product")
          assert.equal(x.active_presentation, true, "ACTIVATION_PRESENTATION");
      }
      const result = {
        activate: "active",
        inactivate: "inactive",
        reactivate: "active",
        discontinue: "discontinued",
      };
      assert.equal(x.result_status, result[x.action], "TRANSITION_RESULT");
      break;
    }
    case "category-move": {
      assert(Array.isArray(x.categories), "CATEGORY_RECORDS");
      const byId = new Map(x.categories.map((c) => [c.category_id, c]));
      assert.equal(byId.size, x.categories.length, "CATEGORY_DUPLICATE");
      const node = byId.get(x.category_id);
      assert(node, "CATEGORY_MISSING");
      assert.equal(node.organization_id, x.organization_id, "CATEGORY_TENANT");
      assert.equal(node.status, "active", "CATEGORY_STATE");
      const chain = (id, seen = new Set()) => {
        if (id === null) return 0;
        assert(!seen.has(id), "CATEGORY_CYCLE");
        seen.add(id);
        const n = byId.get(id);
        assert(n, "CATEGORY_PARENT");
        assert.equal(n.organization_id, x.organization_id, "CATEGORY_TENANT");
        assert.equal(n.status, "active", "CATEGORY_PARENT_ACTIVE");
        return 1 + chain(n.parent_id, seen);
      };
      if (x.parent_id !== null) {
        let cur = x.parent_id;
        const visited = new Set();
        while (cur !== null) {
          assert(cur !== x.category_id && !visited.has(cur), "CATEGORY_CYCLE");
          visited.add(cur);
          const n = byId.get(cur);
          assert(n, "CATEGORY_PARENT");
          cur = n.parent_id;
        }
      }
      const height = (id, seen = new Set()) => {
        assert(!seen.has(id), "CATEGORY_CYCLE");
        seen.add(id);
        const children = x.categories.filter((c) => c.parent_id === id);
        return (
          1 +
          Math.max(
            0,
            ...children.map((c) => {
              assert.equal(
                c.organization_id,
                x.organization_id,
                "CATEGORY_TENANT",
              );
              return height(c.category_id, new Set(seen));
            }),
          )
        );
      };
      assert(chain(x.parent_id) + height(x.category_id) <= 8, "CATEGORY_DEPTH");
      break;
    }
    case "category-inactivate":
      assert(Array.isArray(x.children), "CATEGORY_CHILDREN");
      assert(
        !x.children.some((c) => c.status === "active"),
        "CATEGORY_ACTIVE_CHILD",
      );
      break;
    case "category-assignment":
      assert.equal(
        x.category.organization_id,
        x.organization_id,
        "CATEGORY_TENANT",
      );
      assert.equal(x.category.status, "active", "CATEGORY_ASSIGNMENT_INACTIVE");
      break;
    case "product-edit": {
      basePresentation(x.product, x.base_presentation);
      const b = normalizeBody("updateCatalogProduct", x.body);
      assert(x.product.status !== "discontinued", "PRODUCT_DISCONTINUED");
      assert.equal(b.expected_version, x.product.version, "VERSION_CONFLICT");
      if (Object.hasOwn(b, "type"))
        assert.equal(x.ever_activated, false, "TYPE_AFTER_ACTIVATION");
      if (Object.hasOwn(b, "tax_classification")) {
        if (x.product.status === "active") {
          assert(
            b.tax_classification !== null && x.tax_supported === true,
            "ACTIVE_TAX",
          );
          assert(
            Number.isFinite(x.step_up_remaining_ms) &&
              x.step_up_remaining_ms > 0 &&
              x.step_up_remaining_ms <= 900000,
            "STEP_UP_REQUIRED",
          );
        } else if (b.tax_classification !== null)
          assert.equal(x.tax_supported, true, "TAX_UNSUPPORTED");
      }
      if (b.default_variant?.base_unit) {
        assert.equal(x.presentation_count, 1, "BASE_ONLY_PRESENTATION");
        assert.equal(x.product.status, "draft", "BASE_DRAFT_ONLY");
        assert.equal(x.base_presentation.status, "draft", "BASE_DRAFT_ONLY");
        assert.equal(x.ever_activated, false, "BASE_NEVER_ACTIVATED");
        assert.equal(x.base_ever_activated, false, "BASE_NEVER_ACTIVATED");
        assert.equal(
          b.expected_base_presentation_version,
          x.base_presentation.version,
          "BASE_VERSION_CONFLICT",
        );
      }
      history(x.product.status, x.ever_activated);
      history(x.base_presentation.status, x.base_ever_activated);
      break;
    }
    case "presentation-edit": {
      const actualBase = presentationOwner(x.product, x.presentation);
      assert.equal(x.is_base, actualBase, "PRESENTATION_CONTEXT_BASE_FLAG");
      assert.equal(
        x.product_status,
        x.product.status,
        "PRESENTATION_CONTEXT_PRODUCT_STATUS",
      );
      assert.equal(
        x.base_unit,
        x.product.default_variant.base_unit,
        "PRESENTATION_CONTEXT_BASE_UNIT",
      );
      if (actualBase) basePresentation(x.product, x.presentation);
      const b = normalizeBody("updateCatalogPresentation", x.body);
      assert(
        x.presentation.status !== "discontinued" &&
          x.product_status !== "discontinued",
        "PRESENTATION_DISCONTINUED",
      );
      assert.equal(
        b.expected_version,
        x.presentation.version,
        "VERSION_CONFLICT",
      );
      const locked = [
        "unit_code",
        "conversion_factor",
        "allows_fractions",
        "minimum_quantity",
        "quantity_increment",
      ];
      if (locked.some((k) => Object.hasOwn(b, k)))
        assert.equal(x.ever_activated, false, "PRESENTATION_AFTER_ACTIVATION");
      if (x.is_base)
        assert(
          !Object.hasOwn(b, "unit_code") &&
            !Object.hasOwn(b, "conversion_factor"),
          "BASE_INHERITED",
        );
      quantities({ ...x.presentation, ...b }, x.base_unit);
      history(x.presentation.status, x.ever_activated);
      break;
    }
    case "uniqueness": {
      assert(["sku", "plu", "category"].includes(x.code_type), "UNIQUE_KIND");
      assert(Array.isArray(x.reservations), "RESERVATIONS");
      const normalize = (v) =>
        x.code_type === "sku"
          ? sku(v)
          : x.code_type === "category"
            ? text(v.trim(), 80).toLowerCase()
            : v;
      const key = normalize(x.value);
      assert(
        !x.reservations.some(
          (r) =>
            r.organization_id === x.organization_id &&
            normalize(r.value) === key &&
            (x.code_type !== "category" ||
              (r.status === "active" && r.parent_id === x.parent_id)),
        ),
        "CODE_RESERVED",
      );
      break;
    }
    case "cursor":
      assert.equal(x.signature_verified, true, "CURSOR_SIGNATURE");
      assert.equal(x.version_supported, true, "CURSOR_VERSION");
      assert(
        Number.isFinite(x.now) &&
          Number.isFinite(x.issued) &&
          Number.isFinite(x.expires) &&
          x.now >= x.issued &&
          x.now < x.expires &&
          x.expires - x.issued <= 1800000,
        "CURSOR_LIFETIME",
      );
      for (const k of [
        "organization_id",
        "filters",
        "limit",
        "presentation_id",
      ]) {
        assert.equal(
          Object.hasOwn(x.bound, k),
          Object.hasOwn(x.presented, k),
          "CURSOR_BINDING",
        );
        if (Object.hasOwn(x.bound, k))
          assert.deepEqual(x.bound[k], x.presented[k], "CURSOR_BINDING");
      }
      assert.equal(x.authority_current, true, "CURSOR_AUTHORITY");
      break;
    case "version":
      version(x.expected_version);
      assert.equal(x.expected_version, x.before_version, "VERSION_CONFLICT");
      assert.equal(x.after_version, x.before_version + 1, "VERSION_INCREMENT");
      break;
    case "replay":
      assert.equal(x.authority_current, true, "REPLAY_AUTHORITY");
      assert.deepEqual(
        x.original.request,
        x.replay.request,
        "IDEMPOTENCY_MISMATCH",
      );
      for (const k of ["status", "body", "location", "version"])
        assert.deepEqual(x.original[k], x.replay[k], "REPLAY_RESULT");
      assert.equal(x.effects_before, x.effects_after, "REPLAY_EFFECT");
      break;
    case "lookup": {
      const q = query(x.query_pairs, {
        query: [
          "q",
          "sku",
          "plu",
          "barcode",
          "status",
          "category_id",
          "limit",
          "cursor",
        ],
      });
      if (Object.hasOwn(q, "barcode")) {
        barcodeKey(
          q.barcode.startsWith("OC:") ? "INTERNAL" : "GTIN_" + q.barcode.length,
          q.barcode,
        );
        fields(x, { barcode: object, presentation: object, result: object });
        fields(x.barcode, {
          type: string,
          value: string,
          presentation_id: string,
          organization_id: string,
        });
        fields(x.presentation, {
          presentation_id: string,
          product_id: string,
          variant_id: string,
          organization_id: string,
        });
        fields(x.result, {
          product_id: string,
          organization_id: string,
          default_variant: (d) => {
            fields(d, { variant_id: string });
            return true;
          },
        });
        assert.equal(
          barcodeKey(
            q.barcode.startsWith("OC:")
              ? "INTERNAL"
              : "GTIN_" + q.barcode.length,
            q.barcode,
          ),
          barcodeKey(x.barcode.type, x.barcode.value),
          "LOOKUP_BARCODE",
        );
        assert.equal(
          x.result.matched_presentation_id,
          x.presentation.presentation_id,
          "LOOKUP_MATCH_REQUIRED",
        );
        assert.equal(
          x.presentation.product_id,
          x.result.product_id,
          "LOOKUP_PRODUCT",
        );
        assert.equal(
          x.presentation.variant_id,
          x.result.default_variant.variant_id,
          "LOOKUP_VARIANT",
        );
        assert.equal(
          x.barcode.presentation_id,
          x.presentation.presentation_id,
          "LOOKUP_PRESENTATION",
        );
        assert.equal(
          x.barcode.organization_id,
          x.result.organization_id,
          "LOOKUP_TENANT",
        );
        assert.equal(
          x.presentation.organization_id,
          x.result.organization_id,
          "LOOKUP_TENANT",
        );
      }
      break;
    }
    case "created-product":
      assert.equal(x.product.status, "draft", "CREATE_DRAFT");
      assert.equal(x.presentation.status, "draft", "CREATE_DRAFT");
      assert.equal(
        x.presentation.product_id,
        x.product.product_id,
        "CREATE_PRODUCT_LINK",
      );
      assert.equal(
        x.presentation.variant_id,
        x.product.default_variant.variant_id,
        "CREATE_VARIANT_LINK",
      );
      assert.equal(
        x.presentation.presentation_id,
        x.product.base_presentation_id,
        "CREATE_BASE_LINK",
      );
      assert.equal(
        x.presentation.organization_id,
        x.product.organization_id,
        "CREATE_TENANT",
      );
      assert.equal(
        x.presentation.unit_code,
        x.product.default_variant.base_unit,
        "CREATE_BASE_UNIT",
      );
      assert.equal(
        decimal(x.presentation.conversion_factor, 6, true),
        "1",
        "CREATE_BASE_FACTOR",
      );
      assert.equal(x.product.version, 1, "CREATE_VERSION");
      assert.equal(x.presentation.version, 1, "CREATE_VERSION");
      quantities(x.presentation, x.product.default_variant.base_unit);
      break;
    default:
      assert.fail("SEMANTIC_KIND");
  }
}
