import { assertEquals } from "jsr:@std/assert@1";
import { iconLinks, logoKey, parseDomains, pickApp } from "./logos.ts";
import { parsePlaces } from "./places.ts";

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

Deno.test("parsePlaces keeps located shops, nulls online ones and bad coordinates", () => {
  const got = parsePlaces('{"results":[{"key":0,"country":"es","city":"Barcelona","lat":41.39,"lng":2.17,"online":false},{"key":"1","country":"US","city":"Cupertino","lat":37.3,"lng":-122,"online":true},{"key":"2","country":"XX1","city":"A","lat":200,"lng":0},{"key":"9","country":"DK"}]}', new Set(["0", "1", "2"]));
  assertEquals(got.get("0"), { online: false, country_iso: "ES", city: "Barcelona", lat: 41.39, lng: 2.17 });
  assertEquals(got.get("1"), { online: true, country_iso: null, city: null, lat: null, lng: null });
  assertEquals(got.get("2"), { online: false, country_iso: null, city: null, lat: null, lng: null });
  assertEquals(got.has("9"), false);
});

Deno.test("pickApp takes the brand's own app, never a stranger's", () => {
  const amazon = [{ trackName: "Amazon Shopping", sellerName: "Amazon Europe Core SARL", sellerUrl: "https://www.amazon.co.uk/app", artworkUrl512: "a" }];
  assertEquals(pickApp(amazon, "amazon.com")?.artworkUrl512, "a");
  const netto = [{ trackName: "Netto+ | Scan&Go", sellerName: "Salling Group A/S", sellerUrl: "https://netto.dk/nettoplus/", artworkUrl512: "n" }];
  assertEquals(pickApp(netto, "netto.dk")?.artworkUrl512, "n");
  assertEquals(pickApp([{ trackName: "Snapchat", sellerName: "Snap, Inc.", sellerUrl: "http://www.snapchat.com", artworkUrl512: "s" }], "normal.dk"), null);
  assertEquals(pickApp([{ trackName: "OK Jazz", sellerName: "Someone", sellerUrl: "", artworkUrl512: "x" }], "ok.dk"), null);
});
