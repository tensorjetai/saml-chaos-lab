import { describe, expect, it } from "vitest";
import {
  generateResponse,
  generateSigningMaterial,
  signXml,
  verifyXmlSignature,
} from "@saml-chaos/saml-core";
import { parseFailureUrls, parseSignMode } from "../packages/cli/src/helpers.js";

describe("XML signature known-answer behavior", () => {
  it("validates a signed assertion and rejects a post-sign mutation", () => {
    const material = generateSigningMaterial();
    const unsigned =
      '<saml:Assertion xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion" ID="_a"><saml:Issuer>https://idp.test</saml:Issuer></saml:Assertion>';
    const signed = signXml(unsigned, material, "//*[local-name(.)='Assertion']");
    expect(verifyXmlSignature(signed, material.certificate)).toBe(true);
    expect(
      verifyXmlSignature(
        signed.replace("https://idp.test", "https://evil.test"),
        material.certificate,
      ),
    ).toBe(false);
  });

  it("supports response-level and dual assertion+response signing modes", () => {
    const signing = generateSigningMaterial();
    const basePlan = {
      issuer: "https://idp.test/metadata",
      requestId: "_req",
      destination: "https://sp.test/acs",
      audience: "urn:sp",
      nameId: "user@test.example",
      nameIdFormat: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
      attributes: {},
      signing,
    };
    const responseSigned = generateResponse({ ...basePlan, signMode: "response" });
    expect(responseSigned.xml.match(/<(?:ds:)?Signature\b/g)).toHaveLength(1);
    expect(verifyXmlSignature(responseSigned.xml, signing.certificate)).toBe(true);

    const bothSigned = generateResponse({ ...basePlan, signMode: "both" });
    expect(bothSigned.xml.match(/<(?:ds:)?Signature\b/g)).toHaveLength(2);
    expect(verifyXmlSignature(bothSigned.xml, signing.certificate)).toBe(true);

    expect(parseSignMode(undefined)).toBe("assertion");
    expect(parseSignMode("both")).toBe("both");
    expect(() => parseSignMode("invalid")).toThrow("invalid_sign_mode");
    expect(parseFailureUrls("/auth/failed$")[0]!.test("/auth/failed")).toBe(true);
    expect(() => parseFailureUrls("[unclosed")).toThrow("invalid_failure_url_pattern");
  });
});
