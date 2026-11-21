import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mediaFilename, checkEmailList, isBlockedHost, parseDdgResults } from "./providers.js";

describe("mediaFilename", () => {
  it("slugs names and allows only image extensions", () => {
    assert.equal(mediaFilename("My Hero Image!"), "my-hero-image.jpg");
    assert.equal(mediaFilename("logo", "png"), "logo.png");
    assert.equal(mediaFilename("x", "exe"), "x.jpg");
    assert.equal(mediaFilename(""), "image.jpg");
  });
});

describe("checkEmailList", () => {
  it("accepts singles and lists, rejects junk", () => {
    assert.deepEqual(checkEmailList("a@b.co"), ["a@b.co"]);
    assert.deepEqual(checkEmailList(["a@b.co", "c@d.io"]), ["a@b.co", "c@d.io"]);
    assert.throws(() => checkEmailList([]), /recipient/);
    assert.throws(() => checkEmailList(["nope"]), /invalid email/);
    assert.throws(() => checkEmailList(new Array(21).fill("a@b.co")), /capped/);
  });
});

describe("isBlockedHost", () => {
  it("blocks loopback, private ranges and link-local", () => {
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "172.16.0.1", "172.31.9.9", "192.168.1.1", "169.254.169.254", "0.0.0.0", "::1", "[::1]", ""]) {
      assert.equal(isBlockedHost(h), true, h);
    }
  });
  it("allows public IPs and normal domains", () => {
    for (const h of ["8.8.8.8", "1.1.1.1", "172.15.0.1", "172.32.0.1", "192.167.1.1", "example.com", "api.resend.com"]) {
      assert.equal(isBlockedHost(h), false, h);
    }
  });
});

describe("parseDdgResults", () => {
  it("extracts decoded result links", () => {
    const html = `<a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fbakery&amp;rut=1">Best <b>Bakery</b> Ideas</a>
<a class="result__a" href="https://other.io/x">Other</a>
<a class="result__a" href="/relative/skip">Skip</a>`;
    const r = parseDdgResults(html);
    assert.equal(r.length, 2);
    assert.equal(r[0].url, "https://example.com/bakery");
    assert.ok(r[0].title.includes("Bakery"));
    assert.equal(r[1].url, "https://other.io/x");
  });
  it("returns empty when nothing parses", () => {
    assert.deepEqual(parseDdgResults("<html>no results here</html>"), []);
  });
});
