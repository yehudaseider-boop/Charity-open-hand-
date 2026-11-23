/**
 * A picture in a donor journey email (23/11/2026, step 5 of the Donor journeys plan): only a file we made in the
 * charity's own folder, always with a few words saying what it shows, shown above the words in the HTML email only.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { charityPictureUrl, checkJourneySteps, journeyEmail, journeyPicturePathOk, withPicture } from "@/lib/charity/journey";
import { pictureHtml, textEmailHtml } from "@/lib/email/html";
import { JourneyEditor } from "@/app/charity-admin/[id]/journey/editor";

const C = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";
const path = `${C}/journey-aaaaaaaa-1111-4111-8111-111111111111.jpg`;
const step = { subject: "Thank you", body: "Thank you for your gift to us.", waitDays: "2" };

describe("which pictures a journey email can have", () => {
  it("only a file we made, in this charity's own folder", () => {
    expect(journeyPicturePathOk(C, path)).toBe(true);
    expect(journeyPicturePathOk(C, path.replace(".jpg", ".webp"))).toBe(true);
    for (const bad of [path.replace(C, OTHER), `${C}/logo-aaaaaaaa-1111-4111-8111-111111111111.jpg`, `${C}/journey-x.jpg`, `${C}/journey-aaaaaaaa-1111-4111-8111-111111111111.svg`, `../${path}`, `${path}?x=1`]) {
      expect(journeyPicturePathOk(C, bad)).toBe(false);
    }
    expect(journeyPicturePathOk("not-a-charity", path)).toBe(false);
  });

  it("keeps a picture with its description, and leaves the keys out when there is none", () => {
    expect(withPicture({ subject: "a", body: "b", waitDays: 1 }, path, "  Children at our club ")).toEqual({ subject: "a", body: "b", waitDays: 1, imagePath: path, imageAlt: "Children at our club" });
    expect(withPicture({ subject: "a", body: "b", waitDays: 1 }, null, "ignored")).toEqual({ subject: "a", body: "b", waitDays: 1 });
  });

  it("saves a picture only with a description, and refuses another charity's file", () => {
    const ok = checkJourneySteps([{ ...step, imagePath: path, imageAlt: "Children at our after-school club" }], C);
    expect(ok).toMatchObject({ ok: true, steps: [{ imagePath: path, imageAlt: "Children at our after-school club" }] });
    const noWords = checkJourneySteps([{ ...step, imagePath: path, imageAlt: " " }], C);
    expect(noWords.ok).toBe(false);
    if (!noWords.ok) expect(noWords.errors[0].imageAlt).toMatch(/Describe the picture/);
    const foreign = checkJourneySteps([{ ...step, imagePath: path.replace(C, OTHER), imageAlt: "A picture" }], C);
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.errors[0].image).toMatch(/couldn't be used/);
    // Without a picture the saved email is exactly as before pictures existed.
    // Control and text-direction characters are taken out of the description (the database refuses control characters).
    const odd = checkJourneySteps([{ ...step, imagePath: path, imageAlt: "Children\u0001 at our\u202e club\u0085" }], C);
    expect(odd).toMatchObject({ ok: true, steps: [{ imageAlt: "Children at our club" }] });
    const plain = checkJourneySteps([{ ...step, imagePath: "", imageAlt: "left over" }], C);
    expect(plain).toEqual({ ok: true, steps: [{ subject: "Thank you", body: "Thank you for your gift to us.", waitDays: 2 }] });
  });
});

describe("the picture in the email", () => {
  const url = charityPictureUrl("https://proj.supabase.co", path);
  it("is served from the charity's public folder", () => {
    expect(url).toBe(`https://proj.supabase.co/storage/v1/object/public/charity-public/${path}`);
  });
  it("is shown above the words with its description, in the HTML version only", () => {
    const m = journeyEmail("d@x.co", { charityName: "Meals", firstName: "Thandi", subject: "Thank you", body: "Thank you for your gift.", pageUrl: "https://g.test/c/meals", stopUrl: "https://g.test/news/stop", replyTo: null, picture: { url, alt: "Children & friends" } });
    expect(m.picture).toEqual({ url, alt: "Children & friends" });
    expect(m.text).not.toContain(url);
    const html = textEmailHtml({ subject: m.subject, text: m.text, quoted: m.quoted, picture: m.picture });
    expect(html).toContain(`<img src="${url}" alt="Children &amp; friends"`);
    expect(html.indexOf("<img src=\"https://proj")).toBeLessThan(html.indexOf("Dear Thandi"));
    expect(journeyEmail("d@x.co", { charityName: "Meals", firstName: null, subject: "Hi there", body: "Thank you for your gift.", pageUrl: "p", stopUrl: "s", replyTo: null }).picture).toBeUndefined();
  });
  it("is left out unless it comes from a safe web address", () => {
    for (const bad of ["javascript:alert(1)", "http://evil.test/x.jpg", 'https://x.test/a.jpg" onerror="x', "data:image/png;base64,AAAA"]) expect(pictureHtml({ url: bad, alt: "x" })).toBe("");
    expect(pictureHtml({ url: "http://localhost:3000/a.jpg", alt: "x" })).toContain("<img");
  });
});

describe("the builder's picture controls", () => {
  const render = (saved: object[], upload = true) =>
    renderToStaticMarkup(
      createElement(JourneyEditor, {
        action: async () => ({ ok: true }) as never,
        charityName: "Meals",
        slug: "meals",
        saved: saved as never,
        canEdit: true,
        ...(upload ? { uploadPicture: async () => ({ ok: true, path, url: "https://x.test/p.jpg" }) as const } : {}),
      }),
    );
  it("offers an optional picture on each email", () => {
    const html = render([{ subject: "Thank you", body: "Thank you for your gift to us.", waitDays: 2 }]);
    expect(html).toContain("A picture <span");
    expect(html).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(html).toContain('name="image_path_1" value=""');
  });
  it("shows a saved picture with its description and a way to remove it", () => {
    const html = render([{ subject: "Thank you", body: "Thank you for your gift to us.", waitDays: 2, imagePath: path, imageAlt: "Children at our club" }]);
    expect(html).toContain(`name="image_path_1" value="${path}"`);
    expect(html).toContain('value="Children at our club"');
    expect(html).toContain("Remove the picture");
  });
  it("has no upload where pictures can't be added", () => {
    expect(render([{ subject: "Thank you", body: "Thank you for your gift to us.", waitDays: 2 }], false)).not.toContain('type="file"');
  });
});
