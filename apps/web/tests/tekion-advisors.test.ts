import { describe, expect, it } from "vitest";

import { extractUserDisplayName } from "../lib/sources/tekion/client";

// Real shape returned by GET /openapi/v4.0.0/users/{id} (verified live 2026-06-18,
// dealer americanmotorscorporation_876_0).
const realUser74 = {
  data: {
    userRoleDetails: {
      primaryRole: { persona: "SERVICE_ADVISOR", roleName: "U/C and Maintenance Managers" },
    },
    userNameDetails: {
      firstName: "Brian",
      lastName: "Keat",
      completeNames: [{ nameType: "DISPLAY_NAME", value: "Brian Keat" }],
    },
    employeeDetails: { employeeDisplayNumber: "4272", employeeId: "876_4272" },
    active: true,
    id: "74",
    email: "bkeat@sctoyota.com",
  },
  meta: { total: "1" },
};

describe("extractUserDisplayName — public OpenAPI /users/{id}", () => {
  it("prefers completeNames[DISPLAY_NAME].value", () => {
    const { name, sourceField } = extractUserDisplayName(realUser74);
    expect(name).toBe("Brian Keat");
    expect(sourceField).toBe("data.userNameDetails.completeNames[DISPLAY_NAME]");
  });

  it("falls back to userNameDetails.firstName + lastName when no completeNames", () => {
    const raw = {
      data: { userNameDetails: { firstName: "Jon", lastName: "Vu" } },
    };
    const { name, sourceField } = extractUserDisplayName(raw);
    expect(name).toBe("Jon Vu");
    expect(sourceField).toBe("data.userNameDetails.firstName + lastName");
  });

  it("ignores non-DISPLAY_NAME completeNames and uses first/last", () => {
    const raw = {
      data: {
        userNameDetails: {
          firstName: "Angel",
          lastName: "Gutierrez",
          completeNames: [{ nameType: "LEGAL_NAME", value: "Angel R Gutierrez" }],
        },
      },
    };
    expect(extractUserDisplayName(raw).name).toBe("Angel Gutierrez");
  });

  it("still supports legacy flat displayName fallback", () => {
    expect(extractUserDisplayName({ data: { displayName: "Jane Doe" } }).name).toBe("Jane Doe");
  });

  it("returns null for empty / unrecognized payloads", () => {
    expect(extractUserDisplayName({}).name).toBeNull();
    expect(extractUserDisplayName(null).name).toBeNull();
    expect(extractUserDisplayName({ data: { userNameDetails: {} } }).name).toBeNull();
  });
});
