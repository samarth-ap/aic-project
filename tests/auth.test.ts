import { afterEach, describe, expect, it } from "vitest";
import { allowedDomains, devLoginEnabled, emailAllowed, safeNext } from "../lib/auth";

const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

describe("emailAllowed", () => {
  it("allows only UW accounts by default", () => {
    delete process.env.ALLOWED_EMAIL_DOMAINS;
    expect(emailAllowed("netid@uw.edu")).toBe(true);
    expect(emailAllowed("NetID@UW.EDU")).toBe(true);
    expect(emailAllowed("someone@gmail.com")).toBe(false);
    expect(emailAllowed("x@cs.uw.edu")).toBe(false); // subdomains need to be listed explicitly
    expect(emailAllowed("x@uw.edu.evil.com")).toBe(false);
    expect(emailAllowed("no-at-sign")).toBe(false);
  });
  it("reads ALLOWED_EMAIL_DOMAINS", () => {
    process.env.ALLOWED_EMAIL_DOMAINS = "uw.edu, @cs.washington.edu";
    expect(allowedDomains()).toEqual(["uw.edu", "cs.washington.edu"]);
    expect(emailAllowed("a@cs.washington.edu")).toBe(true);
  });
});

describe("safeNext (no open redirects after login)", () => {
  it("keeps same-site paths", () => {
    expect(safeNext("/c/ABC123")).toBe("/c/ABC123");
    expect(safeNext("/s/K7Q2MX?x=1")).toBe("/s/K7Q2MX?x=1");
  });
  it("rejects other sites", () => {
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext("//evil.com")).toBe("/dashboard");
    expect(safeNext("/\\evil.com")).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
  });
});

describe("devLoginEnabled", () => {
  it("is off in production unless forced", () => {
    process.env = { ...saved, NODE_ENV: "production" } as NodeJS.ProcessEnv;
    delete process.env.DEV_LOGIN;
    delete process.env.GOOGLE_CLIENT_ID;
    expect(devLoginEnabled()).toBe(false);
  });
  it("is off once Google is configured", () => {
    process.env = { ...saved, NODE_ENV: "development", GOOGLE_CLIENT_ID: "id", GOOGLE_CLIENT_SECRET: "s" } as NodeJS.ProcessEnv;
    delete process.env.DEV_LOGIN;
    expect(devLoginEnabled()).toBe(false);
  });
});
