import { assertEquals } from "jsr:@std/assert@1";
import { iconLinks, logoKey, parseDomains } from "./logos.ts";

Deno.test("iconLinks picks the smallest sharp icon and resolves relative links", () => {
  const html = `<link rel="icon" href="/f16.png" sizes="16x16">
    <link rel="apple-touch-icon" sizes="152x152" href="/touch-152.png">
    <link rel="apple-touch-icon" sizes="57x57" href="/touch-57.png">
    <link rel="shortcut icon" href="/f.ico">
    <link rel="icon" type="image/png" sizes="192x192" href="https://cdn.example.com/a.png?x=1&amp;y=2">
    <link rel="icon" href="/logo.svg" sizes="512x512">
    <link rel=apple-touch-icon href=/bare.png>`;
  assertEquals(iconLinks(html, "https://shop.dk/da/"), [
    "https://shop.dk/touch-152.png",
    "https://shop.dk/bare.png",
    "https://cdn.example.com/a.png?x=1&y=2",
  ]);
});

Deno.test("logoKey matches names regardless of case and padding", () => {
  assertEquals(logoKey("  Føtex "), "føtex");
});

Deno.test("parseDomains keeps known keys and cleans or drops bad domains", () => {
  const got = parseDomains('noise {"results":[{"key":"netto","domain":"https://www.Netto.dk/"},{"key":"anna","domain":null},{"key":"x","domain":"not a domain"},{"key":"ghost","domain":"a.dk"}]}', new Set(["netto", "anna", "x"]));
  assertEquals([...got], [["netto", "netto.dk"], ["anna", null], ["x", null]]);
});
